const mongoose = require("mongoose");
const InventoryTransactionModel = require("../models/InventoryTransactionModel");
const ProductModel = require("../models/ProductModel");
const HarvestBatchModel = require("../models/HarvestBatchModel");
const { getTodayInVietnam, formatDateVN, compareDates, calculateDaysBetween } = require("../utils/dateVN");


// Build receivingStatus expression based on updated fields
const receivingStatusExpr = () => ({
  $switch: {
    branches: [
      // received <= 0 -> NOT_RECEIVED
      { case: { $lte: ["$receivedQuantity", 0] }, then: "NOT_RECEIVED" },
      // received < planned -> PARTIAL
      { case: { $lt: ["$receivedQuantity", "$plannedQuantity"] }, then: "PARTIAL" },
    ],
    default: "RECEIVED",
  },
});


const stockStatusExpr = () => ({
  $cond: [{ $gt: ["$onHandQuantity", 0] }, "IN_STOCK", "OUT_OF_STOCK"],
});


/**
 * Nhập kho (RECEIPT) - atomic & chống lệch khi concurrent
 * Rules:
 * - receivedQuantity + x <= plannedQuantity
 * - receivedQuantity += x
 * - onHandQuantity += x
 * - Nếu là lần nhập đầu tiên (receivedQuantity = 0), tự động set warehouseEntryDate = ngày hiện tại
 * - Nhận expiryDate từ payload (date picker)
 * - Validate: expiryDate >= ngày hiện tại + 1 ngày
 */
const createReceipt = async (userId, payload = {}) => {
  const { productId, quantity, expiryDate, note = "", referenceType = "", referenceId = null, harvestBatchId = null } = payload;


  if (!mongoose.isValidObjectId(productId)) {
    return { status: "ERR", message: "Invalid productId" };
  }


  const qty = Number(quantity);
  if (!Number.isFinite(qty) || qty <= 0 || !Number.isInteger(qty)) {
    return {
      status: "ERR",
      message: "Inbound quantity must be an integer greater than 0",
    };
  }


  // ✅ Lấy ngày hiện tại theo timezone Asia/Ho_Chi_Minh (date-only)
  const today = getTodayInVietnam();


  // Validate expiryDate
  let finalExpiryDate = null;


  if (expiryDate !== undefined && expiryDate !== null) {
    try {
      finalExpiryDate = new Date(expiryDate);
      if (isNaN(finalExpiryDate.getTime())) {
        return { status: "ERR", message: "Invalid expiryDate" };
      }
     
      // Reset về 00:00:00 để so sánh ngày
      finalExpiryDate.setHours(0, 0, 0, 0);
     
      // ✅ Validate: expiryDate >= ngày hiện tại + 1 ngày (theo timezone Vietnam)
      const minDate = new Date(today);
      minDate.setDate(minDate.getDate() + 1);
     
      if (finalExpiryDate < minDate) {
        // ✅ Format date theo timezone VN thay vì toISOString() (UTC)
        const minDateStr = formatDateVN(minDate);
        return {
          status: "ERR",
          message: `Hạn sử dụng phải tối thiểu từ ngày ${minDateStr} (ngày mai theo timezone Asia/Ho_Chi_Minh)`
        };
      }
    } catch (err) {
      return { status: "ERR", message: "Invalid expiryDate" };
    }
  }


  // OPTIONAL: referenceId nếu có thì phải là ObjectId
  const refIdValue = referenceId
    ? mongoose.isValidObjectId(referenceId)
      ? new mongoose.Types.ObjectId(referenceId)
      : null
    : null;
  if (referenceId && !refIdValue) {
    return { status: "ERR", message: "Invalid referenceId" };
  }


  // ✅ Validate và convert harvestBatchId
  const harvestBatchIdValue = harvestBatchId
    ? mongoose.isValidObjectId(harvestBatchId)
      ? new mongoose.Types.ObjectId(harvestBatchId)
      : null
    : null;
  if (harvestBatchId && !harvestBatchIdValue) {
    return { status: "ERR", message: "Invalid harvestBatchId" };
  }


  const session = await mongoose.startSession();
  try {
    let updatedProduct = null;
    let txDoc = null;


    await session.withTransaction(async () => {
      // Lấy product hiện tại để check supplier và các thông tin khác
      const currentProduct = await ProductModel.findById(productId).session(session);
      if (!currentProduct) {
        throw new Error("Product does not exist");
      }


      // ✅ Logic mới: Nếu sản phẩm có supplier, bắt buộc phải có harvestBatchId khi nhập hàng
      if (currentProduct.supplier) {
        if (!harvestBatchIdValue) {
          throw new Error("This product has a supplier, so a harvest batch (harvestBatchId) is required when receiving inventory");
        }
      }


      // ✅ Nếu có harvestBatchId, validate lại trong transaction để tránh race condition
      if (harvestBatchIdValue) {
        const currentHarvestBatch = await HarvestBatchModel.findById(harvestBatchIdValue).session(session);
        if (!currentHarvestBatch) {
          throw new Error("Harvest batch does not exist");
        }
        // ✅ Chỉ cho phép chọn lô có receiptEligible = true
        if (currentHarvestBatch.receiptEligible === false) {
          throw new Error("This harvest batch is not eligible for warehouse receipt");
        }
        if (currentHarvestBatch.product.toString() !== productId) {
          throw new Error("Harvest batch does not match the product");
        }
        // ✅ Validate: harvest batch phải thuộc cùng supplier với product
        if (currentHarvestBatch.supplier.toString() !== currentProduct.supplier?.toString()) {
          throw new Error("Harvest batch does not belong to the product's supplier");
        }
      }
      // ✅ Ràng buộc (theo từng kỳ nhập kho): Trong cùng một kỳ (cùng ngày nhập warehouseEntryDateStr),
      // nếu đã có phiếu nhập chọn lô thu hoạch thì các phiếu sau phải dùng cùng lô.
      // Sau khi sản phẩm reset (bán hết/hết hạn), warehouseEntryDateStr = null → kỳ mới → được chọn lô thu hoạch khác.
      const receiptQuery = {
        product: new mongoose.Types.ObjectId(productId),
        type: "RECEIPT",
        harvestBatch: { $ne: null },
      };
      if (currentProduct.warehouseEntryDateStr) {
        receiptQuery.$expr = {
          $eq: [
            { $dateToString: { date: "$createdAt", format: "%Y-%m-%d", timezone: "Asia/Ho_Chi_Minh" } },
            currentProduct.warehouseEntryDateStr,
          ],
        };
      } else {
        receiptQuery.$expr = { $eq: [1, 0] }; // Kỳ mới (chưa có ngày nhập) → không ràng buộc lô cũ
      }
      const existingReceipt = await InventoryTransactionModel.findOne(receiptQuery)
        .sort({ createdAt: 1 })
        .select("harvestBatch")
        .session(session);


      if (existingReceipt && harvestBatchIdValue) {
        if (existingReceipt.harvestBatch?.toString() !== harvestBatchIdValue.toString()) {
          throw new Error("The harvest batch was selected during the first receipt and cannot be changed in later receipts");
        }
      }


      // ✅ Validate: Kiểm tra xem đây có phải lần nhập kho đầu tiên không
      const isFirstReceipt = !currentProduct.warehouseEntryDate && !currentProduct.warehouseEntryDateStr;


      // ✅ Ràng buộc: Ở lần nhập kho đầu tiên, bắt buộc phải setting hạn sử dụng
      if (isFirstReceipt) {
        if (!finalExpiryDate) {
          throw new Error("The first receipt must set an expiryDate");
        }
      }


      // ✅ Validate: Nếu đã có expiryDate (Date hoặc Str) mà payload gửi expiryDate mới → trả lỗi
      // Check bằng cả Date + Str để khỏi lọt data cũ
      const hasExpiry = !!(currentProduct.expiryDate || currentProduct.expiryDateStr);
      if (hasExpiry && finalExpiryDate !== null) {
        throw new Error("The expiry date has already been set and cannot be changed.");
      }


      // ✅ Lưu warehouseEntryDate là date-only (YYYY-MM-DD) theo timezone Asia/Ho_Chi_Minh
      const warehouseEntryDate = getTodayInVietnam();
      const warehouseEntryDateStr = formatDateVN(warehouseEntryDate);
      const todayStr = formatDateVN(today);


      // ✅ Logic: Nếu đã có warehouseEntryDate, chỉ cho phép nhập trong cùng ngày (theo timezone Vietnam)
      // So sánh bằng string để đơn giản và chắc chắn hơn
      if (currentProduct.warehouseEntryDateStr) {
        if (todayStr !== currentProduct.warehouseEntryDateStr) {
          throw new Error("Inbound purchase orders must be completed on the same day (Asia/Ho_Chi_Minh). You cannot add receipts on a different day.");
        }
      } else if (currentProduct.warehouseEntryDate) {
        // Fallback: nếu chưa có Str nhưng có Date (data cũ)
        const existingEntryDate = new Date(currentProduct.warehouseEntryDate);
        existingEntryDate.setHours(0, 0, 0, 0);
        if (!compareDates(today, existingEntryDate)) {
          throw new Error("Inbound purchase orders must be completed on the same day (Asia/Ho_Chi_Minh). You cannot add receipts on a different day.");
        }
      }


      // ✅ Logic mới: Cho phép nhập nhiều lần trong ngày dù đã set expiryDate
      // (Chỉ chặn khi qua ngày khác, không chặn khi đã set expiryDate)


      // ✅ Tính toán expiryDate trước (nếu có)
      let expiryDateToSet = null;
      let expiryDateStrToSet = null;
      const existingEntryDate = currentProduct.warehouseEntryDate
        ? new Date(currentProduct.warehouseEntryDate)
        : warehouseEntryDate;
      existingEntryDate.setHours(0, 0, 0, 0);


      if (finalExpiryDate !== null) {
        const diffDays = calculateDaysBetween(existingEntryDate, finalExpiryDate);
        if (diffDays <= 0) {
          throw new Error("The expiry date must be after the warehouse entry date");
        }
        expiryDateToSet = finalExpiryDate;
        expiryDateStrToSet = formatDateVN(finalExpiryDate);
      }


      // ✅ Atomic update: gộp logic set warehouseEntryDate và expiryDate vào pipeline để tránh race condition
      const updatePipeline = [
        {
          $set: {
            receivedQuantity: { $add: ["$receivedQuantity", qty] },
            onHandQuantity: { $add: ["$onHandQuantity", qty] },
            // ✅ Atomic set warehouseEntryDate chỉ khi chưa có (tránh race condition)
            warehouseEntryDate: { $ifNull: ["$warehouseEntryDate", warehouseEntryDate] },
            warehouseEntryDateStr: { $ifNull: ["$warehouseEntryDateStr", warehouseEntryDateStr] },
          },
        },
      ];


      // ✅ Atomic set expiryDate chỉ khi chưa có và có giá trị mới
      if (expiryDateToSet !== null) {
        updatePipeline.push({
          $set: {
            expiryDate: { $ifNull: ["$expiryDate", expiryDateToSet] },
            expiryDateStr: { $ifNull: ["$expiryDateStr", expiryDateStrToSet] },
          },
        });
      }


      updatePipeline.push({
        $set: {
          receivingStatus: receivingStatusExpr(),
          stockStatus: stockStatusExpr(),
        },
      });


      // Atomic condition: received + qty <= planned
      updatedProduct = await ProductModel.findOneAndUpdate(
        {
          _id: new mongoose.Types.ObjectId(productId),
          $expr: {
            $lte: [{ $add: ["$receivedQuantity", qty] }, "$plannedQuantity"],
          },
        },
        updatePipeline,
        { new: true, session, runValidators: true }
      );


      if (!updatedProduct) {
        throw new Error("Inbound quantity exceeds the plannedQuantity");
      }

      // ✅ Cập nhật receivedQuantity và ẩn lô khỏi danh sách chọn (visibleInReceipt = false)
      if (harvestBatchIdValue) {
        await HarvestBatchModel.findByIdAndUpdate(
          harvestBatchIdValue,
          { $inc: { receivedQuantity: qty }, $set: { visibleInReceipt: false } },
          { session }
        );
      }


      const created = await InventoryTransactionModel.create(
        [
          {
            product: new mongoose.Types.ObjectId(productId),
            type: "RECEIPT",
            quantity: qty,
            createdBy: new mongoose.Types.ObjectId(userId),
            note: note?.toString?.() ? note.toString() : "",
            referenceType: referenceType?.toString?.() ? referenceType.toString() : "",
            referenceId: refIdValue,
            harvestBatch: harvestBatchIdValue, // ✅ Liên kết với harvest batch
          },
        ],
        { session }
      );
      txDoc = created[0];


      // ✅ Cập nhật inventoryTransactionIds trong harvest batch
      if (harvestBatchIdValue) {
        await HarvestBatchModel.findByIdAndUpdate(
          harvestBatchIdValue,
          { $addToSet: { inventoryTransactionIds: txDoc._id } },
          { session }
        );
      }
    });


    const populatedTx = await InventoryTransactionModel.findById(txDoc._id)
      .populate("product", "name plannedQuantity receivedQuantity onHandQuantity reservedQuantity receivingStatus stockStatus")
      .populate("createdBy", "user_name email")
      .populate({
        path: "harvestBatch",
        select: "batchCode batchNumber harvestDate harvestDateStr receivedQuantity location notes supplier",
        populate: {
          path: "supplier",
          select: "name type code contactPerson phone email address cooperationStatus",
        },
      }) // ✅ Thông tin lô thu hoạch (nếu có)
      .lean();


    return {
      status: "OK",
      message: "Stock receipt created successfully",
      data: {
        transaction: populatedTx,
        product: updatedProduct,
      },
    };
  } catch (error) {
    return { status: "ERR", message: error.message };
  } finally {
    session.endSession();
  }
};


/**
 * Xuất kho (ISSUE) - atomic & chống lệch khi concurrent
 * Rules:
 * - onHandQuantity - y >= 0 (chặn âm kho)
 * - onHandQuantity -= y
 * - Tự động reset product nếu bán hết (onHandQuantity = 0)
 */
const createIssue = async (userId, payload = {}) => {
  const { productId, quantity, note = "", referenceType = "", referenceId = null } = payload;


  if (!mongoose.isValidObjectId(productId)) {
    return { status: "ERR", message: "Invalid productId" };
  }


  const qty = Number(quantity);
  if (!Number.isFinite(qty) || qty <= 0 || !Number.isInteger(qty)) {
    return {
      status: "ERR",
      message: "Outbound quantity must be an integer greater than 0",
    };
  }


  // OPTIONAL: referenceId nếu có thì phải là ObjectId
  const refIdValue = referenceId
    ? mongoose.isValidObjectId(referenceId)
      ? new mongoose.Types.ObjectId(referenceId)
      : null
    : null;
  if (referenceId && !refIdValue) {
    return { status: "ERR", message: "Invalid referenceId" };
  }


  const session = await mongoose.startSession();
  try {
    let updatedProduct = null;
    let txDoc = null;


    await session.withTransaction(async () => {
      // Lấy product hiện tại để check onHandQuantity
      const currentProduct = await ProductModel.findById(productId).session(session);
      if (!currentProduct) {
        throw new Error("Product does not exist");
      }


      // ✅ Validate: onHandQuantity - qty >= 0 (chặn âm kho)
      if ((currentProduct.onHandQuantity || 0) < qty) {
        throw new Error(`Not enough inventory. Current on-hand quantity: ${currentProduct.onHandQuantity || 0}`);
      }


      // ✅ Atomic update: onHandQuantity -= qty
      const updatePipeline = [
        {
          $set: {
            onHandQuantity: { $subtract: ["$onHandQuantity", qty] },
            stockStatus: stockStatusExpr(),
          },
        },
      ];


      // Atomic condition: onHandQuantity - qty >= 0
      updatedProduct = await ProductModel.findOneAndUpdate(
        {
          _id: new mongoose.Types.ObjectId(productId),
          $expr: {
            $gte: [{ $subtract: ["$onHandQuantity", qty] }, 0],
          },
        },
        updatePipeline,
        { new: true, session, runValidators: true }
      );


      if (!updatedProduct) {
        throw new Error("Insufficient inventory or quantities were modified by another transaction");
      }


      // Tạo ISSUE transaction
      const created = await InventoryTransactionModel.create(
        [
          {
            product: new mongoose.Types.ObjectId(productId),
            type: "ISSUE",
            quantity: qty,
            createdBy: new mongoose.Types.ObjectId(userId),
            note: note?.toString?.() ? note.toString() : "",
            referenceType: referenceType?.toString?.() ? referenceType.toString() : "",
            referenceId: refIdValue,
          },
        ],
        { session }
      );
      txDoc = created[0];
    });


    // ✅ Sau khi commit transaction, tự động reset nếu bán hết
    // (Không nên làm trong transaction vì có thể gây deadlock)
    // Tự động reset và lưu vào ProductBatchHistoryModel
    let resetResult = null;
    if (updatedProduct.onHandQuantity === 0) {
      try {
        const { autoResetSoldOutProduct } = require("./ProductBatchService");
        resetResult = await autoResetSoldOutProduct(productId);
        if (resetResult.status === "OK") {
          console.log(`[${new Date().toISOString()}] Auto-reset product ${productId} (sold out)`);
        }
      } catch (error) {
        // Log error nhưng không fail transaction ISSUE
        console.error(`[${new Date().toISOString()}] Error auto-resetting product ${productId}:`, error);
      }
    }


    const populatedTx = await InventoryTransactionModel.findById(txDoc._id)
      .populate("product", "name plannedQuantity receivedQuantity onHandQuantity reservedQuantity receivingStatus stockStatus")
      .populate("createdBy", "user_name email")
      .lean();


    return {
      status: "OK",
      message: "Stock issue created successfully",
      data: {
        transaction: populatedTx,
        product: updatedProduct,
        markedForReset: markResult?.data || null, // Thông tin đánh dấu reset nếu có
      },
    };
  } catch (error) {
    return { status: "ERR", message: error.message };
  } finally {
    session.endSession();
  }
};


/**
 * Lấy lịch sử nhập hàng (RECEIPT transactions) - có search, sort, filter, pagination
 * @param {Object} filters - { page, limit, productId, createdBy, startDate, endDate, search, sortBy, sortOrder }
 * @returns {Promise<Object>} { status, message, data, pagination }
 */
const getReceiptHistory = async (filters = {}) => {
  try {
    const {
      page = 1,
      limit = 20,
      productId,
      createdBy,
      startDate,
      endDate,
      search = "",
      sortBy = "createdAt",
      sortOrder = "desc",
    } = filters;


    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit) || 20));
    const skip = (pageNum - 1) * limitNum;


    const query = {
      type: "RECEIPT", // Chỉ lấy RECEIPT transactions
    };


    // Filter theo productId
    if (productId) {
      if (!mongoose.isValidObjectId(productId)) {
        return {
          status: "ERR",
          message: "Invalid productId",
        };
      }
      query.product = new mongoose.Types.ObjectId(productId);
    }


    // Filter theo createdBy (nhân viên nhập hàng)
    if (createdBy) {
      if (!mongoose.isValidObjectId(createdBy)) {
        return {
          status: "ERR",
          message: "Invalid createdBy value",
        };
      }
      query.createdBy = new mongoose.Types.ObjectId(createdBy);
    }


    // Filter theo khoảng thời gian
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        query.createdAt.$gte = start;
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query.createdAt.$lte = end;
      }
    }


    // Search theo note (nếu có)
    if (search) {
      query.note = { $regex: search, $options: "i" };
    }


    // Sort options
    const allowedSortFields = ["createdAt", "updatedAt", "quantity"];
    const sortField = allowedSortFields.includes(sortBy) ? sortBy : "createdAt";
    const sortDirection = sortOrder === "asc" ? 1 : -1;
    const sortObj = { [sortField]: sortDirection };


    const [data, total] = await Promise.all([
      InventoryTransactionModel.find(query)
        .populate("product", "name price category")
        .populate("createdBy", "user_name email") // ✅ Thông tin nhân viên nhập hàng
        .populate({
          path: "harvestBatch",
          select: "batchCode batchNumber harvestDate harvestDateStr receivedQuantity supplier",
          populate: {
            path: "supplier",
            select: "name type code",
          },
        }) // ✅ Thông tin lô thu hoạch (nếu có) - chỉ các field cơ bản cho list view
        .sort(sortObj)
        .skip(skip)
        .limit(limitNum)
        .lean(),
      InventoryTransactionModel.countDocuments(query),
    ]);


    return {
      status: "OK",
      message: "Fetched receipt history successfully",
      data,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    };
  } catch (error) {
    return { status: "ERR", message: error.message };
  }
};


/**
 * Lấy lịch sử tất cả transactions (RECEIPT, ISSUE, etc.) - có search, sort, filter, pagination
 * @param {Object} filters - { page, limit, type, productId, createdBy, startDate, endDate, search, sortBy, sortOrder }
 * @returns {Promise<Object>} { status, message, data, pagination }
 */
const getTransactionHistory = async (filters = {}) => {
  try {
    const {
      page = 1,
      limit = 20,
      type, // "RECEIPT" | "ISSUE" | "RESERVE" | "RELEASE" | "ADJUST"
      productId,
      createdBy,
      startDate,
      endDate,
      search = "",
      sortBy = "createdAt",
      sortOrder = "desc",
    } = filters;


    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit) || 20));
    const skip = (pageNum - 1) * limitNum;


    const query = {};


    // Filter theo type
    if (type) {
      const allowedTypes = ["RECEIPT", "ISSUE", "RESERVE", "RELEASE", "ADJUST"];
      if (allowedTypes.includes(type)) {
        query.type = type;
      }
    }


    // Filter theo productId
    if (productId) {
      if (!mongoose.isValidObjectId(productId)) {
        return {
          status: "ERR",
          message: "Invalid productId",
        };
      }
      query.product = new mongoose.Types.ObjectId(productId);
    }


    // Filter theo createdBy
    if (createdBy) {
      if (!mongoose.isValidObjectId(createdBy)) {
        return {
          status: "ERR",
          message: "Invalid createdBy value",
        };
      }
      query.createdBy = new mongoose.Types.ObjectId(createdBy);
    }


    // Filter theo khoảng thời gian
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        query.createdAt.$gte = start;
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query.createdAt.$lte = end;
      }
    }


    // Search theo note (nếu có)
    if (search) {
      query.note = { $regex: search, $options: "i" };
    }


    // Sort options
    const allowedSortFields = ["createdAt", "updatedAt", "quantity", "type"];
    const sortField = allowedSortFields.includes(sortBy) ? sortBy : "createdAt";
    const sortDirection = sortOrder === "asc" ? 1 : -1;
    const sortObj = { [sortField]: sortDirection };


    const [data, total] = await Promise.all([
      InventoryTransactionModel.find(query)
        .populate("product", "name price category")
        .populate("createdBy", "user_name email") // ✅ Thông tin người thao tác
        .populate({
          path: "harvestBatch",
          select: "batchCode batchNumber harvestDate harvestDateStr receivedQuantity supplier",
          populate: {
            path: "supplier",
            select: "name type code",
          },
        }) // ✅ Thông tin lô thu hoạch (nếu có) - chỉ các field cơ bản cho list view
        .sort(sortObj)
        .skip(skip)
        .limit(limitNum)
        .lean(),
      InventoryTransactionModel.countDocuments(query),
    ]);


    return {
      status: "OK",
      message: "Fetched transaction history successfully",
      data,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    };
  } catch (error) {
    return { status: "ERR", message: error.message };
  }
};


/**
 * Lấy chi tiết một phiếu nhập hàng (RECEIPT transaction) theo ID
 * @param {String} transactionId - ID của transaction
 * @returns {Promise<Object>} { status, message, data }
 */
const getReceiptById = async (transactionId) => {
  try {
    if (!mongoose.isValidObjectId(transactionId)) {
      return {
        status: "ERR",
        message: "Invalid transaction ID",
      };
    }


    const transaction = await InventoryTransactionModel.findOne({
      _id: new mongoose.Types.ObjectId(transactionId),
      type: "RECEIPT", // Chỉ lấy RECEIPT transactions
    })
      .populate({
        path: "product",
        select: "name price category brand images description warehouseEntryDate warehouseEntryDateStr expiryDate expiryDateStr plannedQuantity receivedQuantity onHandQuantity reservedQuantity receivingStatus stockStatus status",
        populate: {
          path: "category",
          select: "name status",
        },
      })
      .populate({
        path: "createdBy",
        select: "user_name email avatar phone address role_id",
        populate: {
          path: "role_id",
          select: "name",
        },
      }) // ✅ Thông tin chi tiết nhân viên nhập hàng
      .populate({
        path: "harvestBatch",
        select: "batchCode batchNumber harvestDate harvestDateStr receivedQuantity location notes supplier",
        populate: {
          path: "supplier",
          select: "name type code contactPerson phone email address cooperationStatus",
        },
      }) // ✅ Thông tin lô thu hoạch (nếu có)
      .lean();


    if (!transaction) {
      return {
        status: "ERR",
        message: "Receipt transaction not found",
      };
    }


    return {
      status: "OK",
      message: "Fetched receipt transaction details successfully",
      data: transaction,
    };
  } catch (error) {
    return { status: "ERR", message: error.message };
  }
};


module.exports = {
  createReceipt,
  createIssue,
  getReceiptHistory,
  getTransactionHistory,
  getReceiptById,
};
