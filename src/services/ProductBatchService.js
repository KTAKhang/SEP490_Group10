const mongoose = require("mongoose");
const ProductModel = require("../models/ProductModel");
const ProductBatchHistoryModel = require("../models/ProductBatchHistoryModel");
const InventoryTransactionModel = require("../models/InventoryTransactionModel");
const HarvestBatchModel = require("../models/HarvestBatchModel");
const OrderDetailModel = require("../models/OrderDetailModel");
const { getTodayInVietnam, formatDateVN, compareDates } = require("../utils/dateVN");


/**
 * Tính số lượng đã bán (soldQuantity) từ warehouseEntryDate đến completedDate
 * @param {String} productId - Product ID
 * @param {Date|String} warehouseEntryDate - Ngày nhập kho
 * @param {Date|String} completedDate - Ngày hoàn thành lô
 * @returns {Promise<Number>} Tổng số lượng ISSUE transactions trong khoảng thời gian
 */
const calculateSoldQuantity = async (productId, warehouseEntryDate, completedDate) => {
  try {
    // Convert dates to Date objects nếu là string
    const entryDate = warehouseEntryDate instanceof Date ? warehouseEntryDate : new Date(warehouseEntryDate);
    const completeDate = completedDate instanceof Date ? completedDate : new Date(completedDate);


    // Set time to start of day (00:00:00) và end of day (23:59:59)
    const startDate = new Date(entryDate);
    startDate.setHours(0, 0, 0, 0);


    const endDate = new Date(completeDate);
    endDate.setHours(23, 59, 59, 999);


    // Aggregate tổng ISSUE transactions trong khoảng thời gian
    const result = await InventoryTransactionModel.aggregate([
      {
        $match: {
          product: new mongoose.Types.ObjectId(productId),
          type: "ISSUE",
          createdAt: {
            $gte: startDate,
            $lte: endDate,
          },
        },
      },
      {
        $group: {
          _id: null,
          totalSold: { $sum: "$quantity" },
        },
      },
    ]);


    return result.length > 0 ? result[0].totalSold : 0;
  } catch (error) {
    console.error("Error calculating soldQuantity:", error);
    return 0;
  }
};


/**
 * Tổng hợp doanh thu từ đơn hàng trong kỳ lô: doanh thu thực tế, số lượng & doanh thu bán xả kho (giảm giá).
 * @param {String} productId - Product ID
 * @param {Date|String} warehouseEntryDate - Ngày nhập kho
 * @param {Date|String} completedDate - Ngày hoàn thành lô
 * @returns {Promise<{ actualRevenue: number, clearanceQuantity: number, clearanceRevenue: number, fullPriceQuantity: number, fullPriceRevenue: number }>}
 */
const aggregateOrderRevenueByBatch = async (productId, warehouseEntryDate, completedDate) => {
  const defaultResult = {
    actualRevenue: 0,
    clearanceQuantity: 0,
    clearanceRevenue: 0,
    fullPriceQuantity: 0,
    fullPriceRevenue: 0,
  };
  try {
    const entryDate = warehouseEntryDate instanceof Date ? warehouseEntryDate : new Date(warehouseEntryDate);
    const completeDate = completedDate instanceof Date ? completedDate : new Date(completedDate);
    const startDate = new Date(entryDate);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(completeDate);
    endDate.setHours(23, 59, 59, 999);


    const result = await OrderDetailModel.aggregate([
      { $match: { product_id: new mongoose.Types.ObjectId(productId) } },
      { $lookup: { from: "orders", localField: "order_id", foreignField: "_id", as: "order" } },
      { $unwind: "$order" },
      { $match: { "order.createdAt": { $gte: startDate, $lte: endDate } } },
      {
        $addFields: {
          itemRevenue: { $multiply: ["$quantity", "$price"] },
          isClearance: {
            $and: [
              { $ne: ["$original_price", null] },
              { $lt: ["$price", "$original_price"] },
            ],
          },
        },
      },
      {
        $group: {
          _id: null,
          actualRevenue: { $sum: "$itemRevenue" },
          clearanceQuantity: { $sum: { $cond: ["$isClearance", "$quantity", 0] } },
          clearanceRevenue: { $sum: { $cond: ["$isClearance", "$itemRevenue", 0] } },
          totalQuantity: { $sum: "$quantity" },
        },
      },
      {
        $project: {
          actualRevenue: 1,
          clearanceQuantity: 1,
          clearanceRevenue: 1,
          fullPriceQuantity: { $subtract: ["$totalQuantity", "$clearanceQuantity"] },
          fullPriceRevenue: { $subtract: ["$actualRevenue", "$clearanceRevenue"] },
        },
      },
    ]);


    if (!result.length) return defaultResult;
    const r = result[0];
    return {
      actualRevenue: Math.round((r.actualRevenue || 0) * 100) / 100,
      clearanceQuantity: r.clearanceQuantity || 0,
      clearanceRevenue: Math.round((r.clearanceRevenue || 0) * 100) / 100,
      fullPriceQuantity: r.fullPriceQuantity || 0,
      fullPriceRevenue: Math.round((r.fullPriceRevenue || 0) * 100) / 100,
    };
  } catch (error) {
    console.error("Error aggregateOrderRevenueByBatch:", error);
    return defaultResult;
  }
};


/**
 * Reset product để nhập lô mới (tạo batch history + reset fields)
 * @param {String} productId - Product ID
 * @param {String} completionReason - "SOLD_OUT" | "EXPIRED"
 * @returns {Promise<Object>} { status, message, data }
 */
const resetProductForNewBatch = async (productId, completionReason = "SOLD_OUT") => {
  const session = await mongoose.startSession();
  session.startTransaction();


  try {
    if (!mongoose.isValidObjectId(productId)) {
      return { status: "ERR", message: "Invalid productId" };
    }


    if (!["SOLD_OUT", "EXPIRED"].includes(completionReason)) {
      return {
        status: "ERR",
        message: "completionReason must be SOLD_OUT or EXPIRED",
      };
    }


    // Lấy product hiện tại
    const product = await ProductModel.findById(productId).session(session);
    if (!product) {
      await session.abortTransaction();
      return { status: "ERR", message: "Product does not exist" };
    }


    // Validate: phải có warehouseEntryDate (đã nhập kho ít nhất 1 lần)
    if (!product.warehouseEntryDate && !product.warehouseEntryDateStr) {
      await session.abortTransaction();
      return {
        status: "ERR",
        message: "The product has no warehouse entry date and cannot be reset",
      };
    }
    // Validate: SOLD_OUT thì phải bán hết (onHand = 0); EXPIRED thì cho phép còn tồn (số còn lại ghi nhận là discarded)
    if (completionReason === "SOLD_OUT" && (product.onHandQuantity || 0) > 0) {
      await session.abortTransaction();
      return {
        status: "ERR",
        message: "The product still has inventory and cannot be reset to SOLD_OUT. Please sell out remaining stock first.",
      };
    }


    const today = getTodayInVietnam();
    const todayStr = formatDateVN(today);


    // ✅ SNAPSHOT: Lưu tất cả dữ liệu TRƯỚC KHI reset (để lưu vào batch history)
    const batchSnapshot = {
      batchNumber: product.batchNumber || 1,
      plannedQuantity: product.plannedQuantity || 0,
      receivedQuantity: product.receivedQuantity || 0,
      onHandQuantity: product.onHandQuantity || 0, // Lưu onHandQuantity tại thời điểm reset
      warehouseEntryDate: product.warehouseEntryDate,
      warehouseEntryDateStr: product.warehouseEntryDateStr,
      expiryDate: product.expiryDate,
      expiryDateStr: product.expiryDateStr,
    };
    // ✅ SOLD_OUT: Số đã xuất (bán/đã giao) = received - onHand. Số vứt bỏ = onHand (thường = 0).
    //    (Đơn hàng trừ kho qua OrderService/PaymentController không tạo phiếu ISSUE, nên không chỉ dựa vào calculateSoldQuantity.)
    // ✅ EXPIRED: Số đã bán = tổng ISSUE; số vứt bỏ = onHand (còn lại hết hạn).
    const onHand = batchSnapshot.onHandQuantity || 0;
    const received = batchSnapshot.receivedQuantity || 0;
    let soldQuantity = 0;
    let discardedQuantity = 0;
    if (completionReason === "EXPIRED") {
      const warehouseEntryDate = batchSnapshot.warehouseEntryDate || new Date(batchSnapshot.warehouseEntryDateStr);
      soldQuantity = await calculateSoldQuantity(productId, warehouseEntryDate, today);
      discardedQuantity = onHand;
    } else {
      // SOLD_OUT: lượng đã ra kho = received - onHand; lượng vứt bỏ = onHand (0 khi bán hết)
      soldQuantity = Math.max(0, received - onHand);
      discardedQuantity = onHand;
    }


    // ✅ Tìm harvestBatch liên quan (nếu có)
    // Tìm harvestBatch đã được nhập kho (receivedQuantity > 0)
    // Ưu tiên harvestBatch có harvestDate gần với warehouseEntryDate nhất
    let harvestBatchId = null;
    if (product.supplier && batchSnapshot.warehouseEntryDateStr) {
      try {
        const harvestBatch = await HarvestBatchModel.findOne({
          product: new mongoose.Types.ObjectId(productId),
          supplier: product.supplier,
          receivedQuantity: { $gt: 0 }, // Đã được nhập kho
        })
          .sort({ harvestDate: -1 }) // Ưu tiên harvestBatch mới nhất
          .lean()
          .session(session);


        if (harvestBatch) {
          harvestBatchId = harvestBatch._id;
        }
      } catch (error) {
        console.error("Error finding harvestBatch:", error);
        // Không throw error, chỉ log (không bắt buộc phải có harvestBatch)
      }
    }
    // ✅ Snapshot giá nhập / giá bán tại thời điểm chốt lô (để báo cáo doanh thu, lợi nhuận gộp, tổn thất)
    const unitCostPrice = product.purchasePrice ?? 0;
    const unitSellPrice = product.price ?? 0;
    // ✅ Tổng hợp doanh thu từ đơn hàng trong kỳ lô: doanh thu thực tế, bán xả kho (giảm giá) vs bán đúng giá
    const revenueStats = await aggregateOrderRevenueByBatch(
      productId,
      batchSnapshot.warehouseEntryDate || batchSnapshot.warehouseEntryDateStr,
      today
    );
    // ✅ Tạo batch history với dữ liệu snapshot (TRƯỚC KHI reset)
    const batchHistory = new ProductBatchHistoryModel({
      product: new mongoose.Types.ObjectId(productId),
      harvestBatch: harvestBatchId, // ✅ Liên kết với harvestBatch nếu có
      batchNumber: batchSnapshot.batchNumber,
      plannedQuantity: batchSnapshot.plannedQuantity,
      receivedQuantity: batchSnapshot.receivedQuantity,
      soldQuantity: soldQuantity,
      discardedQuantity: discardedQuantity,
      warehouseEntryDate: batchSnapshot.warehouseEntryDate,
      warehouseEntryDateStr: batchSnapshot.warehouseEntryDateStr,
      expiryDate: batchSnapshot.expiryDate,
      expiryDateStr: batchSnapshot.expiryDateStr,
      completedDate: today,
      completedDateStr: todayStr,
      completionReason: completionReason,
      unitCostPrice,
      unitSellPrice,
      actualRevenue: revenueStats.actualRevenue,
      clearanceQuantity: revenueStats.clearanceQuantity,
      clearanceRevenue: revenueStats.clearanceRevenue,
      fullPriceQuantity: revenueStats.fullPriceQuantity,
      fullPriceRevenue: revenueStats.fullPriceRevenue,
      status: "COMPLETED",
    });


    await batchHistory.save({ session });


    // Reset product fields (giữ lại: name, category, brand, images, price, detail_desc, short_desc, status)
    product.plannedQuantity = 0;
    product.receivedQuantity = 0;
    product.onHandQuantity = 0;
    product.reservedQuantity = 0;
    product.warehouseEntryDate = null;
    product.warehouseEntryDateStr = null;
    product.expiryDate = null;
    product.expiryDateStr = null;
    product.receivingStatus = "NOT_RECEIVED";
    product.stockStatus = "OUT_OF_STOCK";
    product.batchNumber = (product.batchNumber || 1) + 1; // Tăng batchNumber


    await product.save({ session });


    await session.commitTransaction();


    return {
      status: "OK",
      message: `Product reset successfully. Batch history #${batchHistory.batchNumber} has been saved`,
      data: {
        product: product,
        batchHistory: batchHistory,
      },
    };
  } catch (error) {
    await session.abortTransaction();
    console.error("Error resetting product:", error);
    return { status: "ERR", message: error.message };
  } finally {
    session.endSession();
  }
};


/**
 * Tự động reset products hết hạn (chạy bởi scheduled job)
 * Tìm tất cả products có expiryDateStr < today và onHandQuantity > 0
 * Tự động reset và lưu vào ProductBatchHistoryModel
 * @returns {Promise<Object>} { status, message, data: { resetCount, resetProducts } }
 */
const autoResetExpiredProducts = async () => {
  try {
    const today = getTodayInVietnam();
    const todayStr = formatDateVN(today);
    // Start of today (VN) dùng cho so sánh expiryDate (Date) khi expiryDateStr null
    const startOfTodayVN = new Date(today);
    startOfTodayVN.setHours(0, 0, 0, 0);
    // Tìm products hết hạn và còn tồn kho
    // Hết hạn: expiryDateStr < today HOẶC (expiryDateStr null/trống và expiryDate < today) để cover data cũ
    const expiredProducts = await ProductModel.find({
      onHandQuantity: { $gt: 0 },
      $or: [
        { warehouseEntryDateStr: { $exists: true, $ne: null, $ne: "" } },
        { warehouseEntryDate: { $exists: true, $ne: null } },
      ],
      $and: [
        {
          $or: [
            { expiryDateStr: { $exists: true, $ne: null, $lt: todayStr } },
            { $and: [{ expiryDateStr: { $in: [null, ""] } }, { expiryDate: { $lt: startOfTodayVN } }] },
          ],
        },
      ],
    });


    if (expiredProducts.length === 0) {
      return {
        status: "OK",
        message: "No expired products require a reset",
        data: {
          resetCount: 0,
          resetProducts: [],
        },
      };
    }


    const resetResults = [];


    // Tự động reset từng product
    for (const product of expiredProducts) {
      try {
        const result = await resetProductForNewBatch(product._id.toString(), "EXPIRED");
       
        if (result.status === "OK") {
          resetResults.push({
            productId: product._id.toString(),
            productName: product.name,
            batchNumber: result.data.batchHistory.batchNumber,
            onHandQuantity: product.onHandQuantity,
            expiryDateStr: product.expiryDateStr,
          });
        } else {
          console.error(`Error resetting product ${product._id}:`, result.message);
        }
      } catch (error) {
        console.error(`Error resetting product ${product._id}:`, error);
      }
    }


    return {
      status: "OK",
      message: `Automatically reset ${resetResults.length} expired products`,
      data: {
        resetCount: resetResults.length,
        resetProducts: resetResults,
      },
    };
  } catch (error) {
    console.error("Error in autoResetExpiredProducts:", error);
    return { status: "ERR", message: error.message };
  }
};


/**
 * Tự động reset product khi bán hết (onHandQuantity = 0 sau khi ISSUE)
 * Được gọi từ InventoryTransactionService sau khi tạo ISSUE transaction
 * Tự động reset và lưu vào ProductBatchHistoryModel
 * @param {String} productId - Product ID
 * @returns {Promise<Object>} { status, message, data }
 */
const autoResetSoldOutProduct = async (productId) => {
  try {
    const product = await ProductModel.findById(productId);
    if (!product) {
      return { status: "ERR", message: "Product does not exist" };
    }


    // Tự động reset nếu onHandQuantity = 0 và đã có warehouseEntryDate
    if (
      product.onHandQuantity === 0 &&
      (product.warehouseEntryDate || product.warehouseEntryDateStr)
    ) {
      const result = await resetProductForNewBatch(productId, "SOLD_OUT");
     
      if (result.status === "OK") {
        return {
          status: "OK",
          message: "Automatically reset product (sold out)",
          data: {
            productId: product._id.toString(),
            productName: product.name,
            batchNumber: result.data.batchHistory.batchNumber,
          },
        };
      }
     
      return result;
    }


    return {
      status: "OK",
      message: "The product does not meet the criteria to reset",
      data: null,
    };
  } catch (error) {
    console.error("Error in autoResetSoldOutProduct:", error);
    return { status: "ERR", message: error.message };
  }
};


/**
 * Lấy lịch sử lô hàng của một sản phẩm (có search, sort, filter, pagination)
 * @param {String} productId - Product ID
 * @param {Object} filters - { page, limit, search, completionReason, sortBy, sortOrder }
 * @returns {Promise<Object>} { status, message, data, pagination }
 */
const getProductBatchHistory = async (productId, filters = {}) => {
  try {
    if (!mongoose.isValidObjectId(productId)) {
      return { status: "ERR", message: "Invalid productId" };
    }


    const { page = 1, limit = 20, search = "", completionReason, sortBy = "batchNumber", sortOrder = "desc" } = filters;
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit) || 20));
    const skip = (pageNum - 1) * limitNum;


    const query = { product: new mongoose.Types.ObjectId(productId) };


    // Filter theo completionReason
    if (completionReason && ["SOLD_OUT", "EXPIRED"].includes(completionReason)) {
      query.completionReason = completionReason;
    }


    // Search: có thể search theo batchNumber (convert sang string để search)
    // Hoặc search theo các field khác nếu cần
    if (search) {
      // Search theo batchNumber nếu search là số
      const searchNum = parseInt(search);
      if (!isNaN(searchNum)) {
        query.batchNumber = searchNum;
      } else {
        // Có thể mở rộng search theo các field khác nếu cần
        // Hiện tại chỉ search theo batchNumber
      }
    }


    // Sort options
    const allowedSortFields = ["batchNumber", "completedDate", "createdAt", "plannedQuantity", "receivedQuantity", "soldQuantity", "discardedQuantity"];
    const sortField = allowedSortFields.includes(sortBy) ? sortBy : "batchNumber";
    const sortDirection = sortOrder === "asc" ? 1 : -1;
    const sortObj = { [sortField]: sortDirection };
    const [rawData, total] = await Promise.all([
      ProductBatchHistoryModel.find(query)
        .populate("harvestBatch", "batchCode batchNumber harvestDate receivedQuantity") // ✅ Populate harvestBatch
        .sort(sortObj)
        .skip(skip)
        .limit(limitNum)
        .lean(),
      ProductBatchHistoryModel.countDocuments(query),
    ]);
    // ✅ Tính lý do hiển thị + chỉ số tài chính theo chuẩn báo cáo (doanh thu, COGS, lợi nhuận gộp, tổn thất)
    const data = rawData.map((batch) => {
      const received = batch.receivedQuantity || 0;
      const sold = batch.soldQuantity || 0;
      const discarded = batch.discardedQuantity || 0;
      const unitCost = batch.unitCostPrice ?? 0;
      const unitSell = batch.unitSellPrice ?? 0;
      let displayReason = batch.completionReason;
      if (received > 0) {
        if (sold === 0 && discarded >= received * 0.99) {
          displayReason = "EXPIRED";
        } else if (sold >= received * 0.99) {
          displayReason = "SOLD_OUT";
        }
      }
      const completionReasonLabel = displayReason === "EXPIRED" ? "Hết hạn" : "Bán hết";
      // Chỉ số tài chính (đồng bộ với thuật ngữ báo cáo kinh doanh)
      const totalCostPrice = received * unitCost; // Tổng vốn nhập
      const cogs = sold * unitCost; // Giá vốn hàng bán (Cost of Goods Sold)
      const revenueFromPrice = sold * unitSell; // Doanh thu ước tính (nếu không có đơn hàng)
      const actualRevenue = batch.actualRevenue ?? 0; // Doanh thu thực tế từ đơn hàng (có cả bán xả kho)
      const revenue = actualRevenue > 0 ? actualRevenue : revenueFromPrice; // Ưu tiên doanh thu thực tế
      const grossProfit = revenue - cogs; // Lợi nhuận gộp
      const inventoryLoss = discarded * unitCost; // Tổn thất tồn kho / chi phí thất thoát hàng hóa
      const opportunityLoss = discarded * unitSell; // Doanh thu mất cơ hội (Lost Revenue)
      // Bán xả kho / giảm giá hàng tồn (clearance sale)
      const clearanceQuantity = batch.clearanceQuantity ?? 0;
      const clearanceRevenue = batch.clearanceRevenue ?? 0;
      const fullPriceQuantity = batch.fullPriceQuantity ?? 0;
      const fullPriceRevenue = batch.fullPriceRevenue ?? 0;
      return {
        ...batch,
        completionReason: batch.completionReason,
        completionReasonDisplay: displayReason,
        completionReasonLabel,
        unitCostPrice: unitCost,
        unitSellPrice: unitSell,
        financial: {
          totalCostPrice,
          cogs,
          revenue,
          actualRevenue: actualRevenue > 0 ? actualRevenue : undefined, // Chỉ trả khi có từ đơn hàng
          grossProfit,
          inventoryLoss,
          opportunityLoss,
          // Bán xả kho: số lượng & doanh thu bán giảm giá (sắp hết hạn / kém phẩm chất)
          clearanceQuantity,
          clearanceRevenue,
          fullPriceQuantity,
          fullPriceRevenue,
        },
      };
    });
    return {
      status: "OK",
      message: "Fetched batch history successfully",
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
 * Bắt lại: tìm tất cả sản phẩm đã bán hết (onHand = 0) nhưng chưa chốt lô (còn warehouseEntryDate)
 * Gọi khi server khởi động để chốt các sản phẩm đã bán hết trước khi có logic auto-reset trong order/payment
 * @returns {Promise<Object>} { status, message, data: { resetCount, resetProducts } }
 */
const autoResetSoldOutProductsCatchUp = async () => {
  try {
    const soldOutNotReset = await ProductModel.find({
      onHandQuantity: 0,
      $or: [
        { warehouseEntryDateStr: { $exists: true, $ne: null, $ne: "" } },
        { warehouseEntryDate: { $exists: true, $ne: null } },
      ],
    }).lean();

    if (soldOutNotReset.length === 0) {
      return {
        status: "OK",
        message: "Không có sản phẩm bán hết cần chốt lô",
        data: { resetCount: 0, resetProducts: [] },
      };
    }

    const resetResults = [];
    for (const product of soldOutNotReset) {
      try {
        const result = await autoResetSoldOutProduct(product._id.toString());
        if (result.status === "OK" && result.data) {
          resetResults.push({
            productId: product._id.toString(),
            productName: product.name,
            batchNumber: result.data.batchNumber,
          });
        }
      } catch (error) {
        console.error(`Error catch-up reset product ${product._id}:`, error);
      }
    }

    return {
      status: "OK",
      message: `Đã chốt lô ${resetResults.length} sản phẩm bán hết (catch-up)`,
      data: {
        resetCount: resetResults.length,
        resetProducts: resetResults,
      },
    };
  } catch (error) {
    console.error("Error in autoResetSoldOutProductsCatchUp:", error);
    return { status: "ERR", message: error.message };
  }
};
module.exports = {
  calculateSoldQuantity,
  resetProductForNewBatch,
  autoResetExpiredProducts,
  autoResetSoldOutProduct,
  autoResetSoldOutProductsCatchUp,
  getProductBatchHistory,
};
