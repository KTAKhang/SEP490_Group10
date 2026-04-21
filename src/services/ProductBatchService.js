const mongoose = require("mongoose");
const ProductModel = require("../models/ProductModel");
const ProductBatchHistoryModel = require("../models/ProductBatchHistoryModel");
const InventoryTransactionModel = require("../models/InventoryTransactionModel");
const HarvestBatchModel = require("../models/HarvestBatchModel");
const OrderDetailModel = require("../models/OrderDetailModel");
const { getTodayInVietnam, formatDateVN, compareDates } = require("../utils/dateVN");

/** Trạng thái đơn hàng "kết thúc" — không còn thay đổi số lượng kho (COMPLETED, CANCELLED, REFUND) */
const ORDER_TERMINAL_STATUSES = [/^COMPLETED$/i, /^CANCELLED$/i, /^REFUND$/i];

/**
 * Kiểm tra lô hàng đã hoàn tất nhập kho (có thể chốt lô khi bán hết).
 * true khi: (1) received >= planned HOẶC (2) đã qua ngày nhập (today > warehouseEntryDate).
 * Tránh chốt lô sớm khi cùng ngày mới nhập 700/1000, còn chờ 300 đến.
 * @param {Object} product - Document product (plannedQuantity, receivedQuantity, warehouseEntryDate, warehouseEntryDateStr)
 * @returns {boolean}
 */
const isBatchReceivingComplete = (product) => {
  const planned = Number(product?.plannedQuantity) ?? 0;
  const received = Number(product?.receivedQuantity) ?? 0;
  if (received >= planned) return true;
  const today = getTodayInVietnam();
  const todayStr = formatDateVN(today);
  const entryStr = product?.warehouseEntryDateStr ?? (product?.warehouseEntryDate ? formatDateVN(product.warehouseEntryDate) : null);
  if (!entryStr) return true;
  return todayStr > entryStr;
};

/**
 * Kiểm tra sản phẩm có đơn hàng đang ở trạng thái chưa kết thúc (PENDING, PAID, READY-TO-SHIP, SHIPPING).
 * Chỉ chốt lô khi TẤT CẢ đơn chứa sản phẩm đều ở trạng thái kết thúc (COMPLETED, CANCELLED, REFUND).
 * @param {String} productId - Product ID
 * @param {String} [excludeOrderId] - Order ID để loại trừ (vd: đơn vừa chuyển COMPLETED, tránh replication lag)
 * @returns {Promise<boolean>} true nếu có đơn PENDING/PAID/READY-TO-SHIP/SHIPPING
 */
const hasOrdersInTransitionForProduct = async (productId, excludeOrderId = null) => {
  try {
    const matchStage = { product_id: new mongoose.Types.ObjectId(productId) };
    if (excludeOrderId && mongoose.isValidObjectId(excludeOrderId)) {
      matchStage.order_id = { $ne: new mongoose.Types.ObjectId(excludeOrderId) };
    }
    const result = await OrderDetailModel.aggregate([
      { $match: matchStage },
      { $lookup: { from: "orders", localField: "order_id", foreignField: "_id", as: "order" } },
      { $unwind: "$order" },
      { $lookup: { from: "order_statuses", localField: "order.order_status_id", foreignField: "_id", as: "orderStatus" } },
      { $unwind: { path: "$orderStatus", preserveNullAndEmptyArrays: true } },
      {
        $match: {
          $nor: ORDER_TERMINAL_STATUSES.map((regex) => ({ "orderStatus.name": { $regex: regex } })),
        },
      },
      { $limit: 1 },
      { $count: "count" },
    ]);
    return result.length > 0 && result[0].count > 0;
  } catch (error) {
    return true; // Khi lỗi, coi như có đơn đang chuyển → không chốt (an toàn)
  }
};


/**
 * Lấy ngày bắt đầu lô hiện tại từ phiếu RECEIPT (không phụ thuộc product.warehouseEntryDate).
 * Đảm bảo mỗi lô có khoảng thời gian riêng → doanh thu/số lượng không cộng dồn giữa các lô.
 * @param {String} productId - Product ID
 * @returns {Promise<{ warehouseEntryDate: Date, warehouseEntryDateStr: string } | null>}
 */
const getCurrentBatchWindowFromReceipts = async (productId) => {
  try {
    const productObjectId = new mongoose.Types.ObjectId(productId);
    const lastBatch = await ProductBatchHistoryModel.findOne({ product: productObjectId })
      .sort({ completedDate: -1 })
      .select("completedDate")
      .lean();
    const afterDate = lastBatch?.completedDate ? new Date(lastBatch.completedDate) : null;
    if (afterDate) afterDate.setMilliseconds(afterDate.getMilliseconds() + 1);

    const match = {
      product: productObjectId,
      type: "RECEIPT",
    };
    if (afterDate) match.createdAt = { $gt: afterDate };

    const firstReceipt = await InventoryTransactionModel.findOne(match)
      .sort({ createdAt: 1 })
      .select("createdAt")
      .lean();
    if (!firstReceipt || !firstReceipt.createdAt) return null;

    const warehouseEntryDate = new Date(firstReceipt.createdAt);
    const warehouseEntryDateStr = formatDateVN(warehouseEntryDate);
    return { warehouseEntryDate, warehouseEntryDateStr };
  } catch (error) {
    return null;
  }
};


/**
 * Tính số lượng đã bán (soldQuantity) từ warehouseEntryDate đến completedDate (theo ISSUE.createdAt).
 * Revenue dùng order.createdAt (aggregateOrderRevenueByBatch) — nếu lệch ngày (timezone, async) có thể mismatch; xem comment bên aggregateOrderRevenueByBatch.
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
    return 0;
  }
};


/**
 * Tổng hợp doanh thu từ đơn hàng trong kỳ lô: doanh thu thực tế, số lượng & doanh thu bán xả kho (giảm giá).
 * Lưu ý: Đang dùng order.createdAt. soldQuantity dùng ISSUE.createdAt — nếu timezone/async khiến order ghi ngày khác ISSUE có thể mismatch.
 * Về lâu dài nên dùng cùng nguồn thời gian (vd. order.paymentAt hoặc ISSUE.createdAt) cho cả soldQuantity và revenue.
 * @param {String} productId - Product ID
 * @param {Date|String} warehouseEntryDate - Ngày nhập kho
 * @param {Date|String} completedDate - Ngày hoàn thành lô
 * @param {Object} options - { targetSoldQuantity?: number, batchExpiryDate?: Date|String }
 * @returns {Promise<{ actualRevenue: number, clearanceQuantity: number, clearanceRevenue: number, fullPriceQuantity: number, fullPriceRevenue: number }>}
 */
const aggregateOrderRevenueByBatch = async (productId, warehouseEntryDate, completedDate, options = {}) => {
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
    const entryStr = typeof warehouseEntryDate === "string" ? warehouseEntryDate : formatDateVN(entryDate);
    const completeStr = typeof completedDate === "string" ? completedDate : formatDateVN(completeDate);
    const startDate = new Date(entryStr + "T00:00:00+07:00");
    const endDate = new Date(completeStr + "T23:59:59.999+07:00");
    const targetSoldQuantity = Math.max(0, Number(options.targetSoldQuantity) || 0);
    const batchExpiryDate = options.batchExpiryDate || null;
    const expiryStr = batchExpiryDate
      ? (typeof batchExpiryDate === "string" ? batchExpiryDate : formatDateVN(batchExpiryDate))
      : null;
    const expiryStart = expiryStr ? new Date(expiryStr + "T00:00:00+07:00") : null;
    const expiryEnd = expiryStr ? new Date(expiryStr + "T23:59:59.999+07:00") : null;

    // Helper: chạy aggregate với optional expiry filter và date range
    const runAggregate = (useExpiryFilter, rangeStart, rangeEnd) => {
      const matchOrderDetail = { product_id: new mongoose.Types.ObjectId(productId) };
      if (useExpiryFilter && expiryStart && expiryEnd) {
        matchOrderDetail.expiry_date = { $gte: expiryStart, $lte: expiryEnd };
      }
      return OrderDetailModel.aggregate([
        { $match: matchOrderDetail },
        { $lookup: { from: "orders", localField: "order_id", foreignField: "_id", as: "order" } },
        { $unwind: "$order" },
        { $match: { "order.createdAt": { $gte: rangeStart, $lte: rangeEnd } } },
        { $lookup: { from: "order_statuses", localField: "order.order_status_id", foreignField: "_id", as: "orderStatus" } },
        { $unwind: { path: "$orderStatus", preserveNullAndEmptyArrays: true } },
        { $match: { "orderStatus.name": { $in: [/^COMPLETED$/i, /^REFUND$/i] } } },
        { $project: { quantity: 1, price: 1, original_price: 1, orderCreatedAt: "$order.createdAt" } },
        { $sort: { orderCreatedAt: -1, _id: -1 } },
      ]);
    };

    let rows = await runAggregate(true, startDate, endDate);
    // Fallback 1: khi filter expiry_date trả về 0 (OrderDetail.expiry_date null hoặc không khớp), thử lại không filter expiry
    if (rows.length === 0 && expiryStr) {
      rows = await runAggregate(false, startDate, endDate);
    }
    // Fallback 2: khi vẫn 0, mở rộng khoảng ngày 1 ngày trước warehouseEntry (trường hợp phiếu nhập ghi trễ)
    if (rows.length === 0 && targetSoldQuantity > 0) {
      const extendedStart = new Date(startDate.getTime() - 24 * 60 * 60 * 1000);
      rows = await runAggregate(false, extendedStart, endDate);
    }

    if (!rows.length) {
      return defaultResult;
    }

    // Nếu targetSoldQuantity = 0 (lô hết hạn bị vứt bỏ, không bán được): không gán đơn hàng nào cho lô này.
    // Tránh hiển thị sai Full price/Clearance từ đơn hàng của lô khác (cùng product, expiry_date trùng).
    // Nếu có targetSoldQuantity > 0, chỉ lấy đúng phần doanh thu tương ứng soldQuantity gần thời điểm chốt lô nhất.
    let rowsUsed = rows;
    if (targetSoldQuantity === 0) {
      rowsUsed = [];
    } else if (targetSoldQuantity > 0) {
      let remaining = targetSoldQuantity;
      rowsUsed = [];
      for (const row of rows) {
        if (remaining <= 0) break;
        const qty = Number(row.quantity) || 0;
        if (qty <= 0) continue;
        const takenQty = Math.min(qty, remaining);
        rowsUsed.push({
          quantity: takenQty,
          price: Number(row.price) || 0,
          original_price: row.original_price,
        });
        remaining -= takenQty;
      }
    }

    let actualRevenue = 0;
    let clearanceQuantity = 0;
    let clearanceRevenue = 0;
    let totalQuantity = 0;
    for (const row of rowsUsed) {
      const qty = Number(row.quantity) || 0;
      const price = Number(row.price) || 0;
      const originalPrice = row.original_price;
      const itemRevenue = qty * price;
      const isClearance = originalPrice != null && price < Number(originalPrice);
      totalQuantity += qty;
      actualRevenue += itemRevenue;
      if (isClearance) {
        clearanceQuantity += qty;
        clearanceRevenue += itemRevenue;
      }
    }

    const r = {
      actualRevenue,
      clearanceQuantity,
      clearanceRevenue,
      fullPriceQuantity: Math.max(0, totalQuantity - clearanceQuantity),
      fullPriceRevenue: Math.max(0, actualRevenue - clearanceRevenue),
    };
    const out = {
      actualRevenue: Math.round((r.actualRevenue || 0) * 100) / 100,
      clearanceQuantity: r.clearanceQuantity || 0,
      clearanceRevenue: Math.round((r.clearanceRevenue || 0) * 100) / 100,
      fullPriceQuantity: r.fullPriceQuantity || 0,
      fullPriceRevenue: Math.round((r.fullPriceRevenue || 0) * 100) / 100,
    };
    return out;
  } catch (error) {
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


    // Lấy product hiện tại (populate category để snapshot tên danh mục)
    const product = await ProductModel.findById(productId).populate("category", "name").session(session);
    if (!product) {
      await session.abortTransaction();
      return { status: "ERR", message: "Product does not exist" };
    }


    // Validate: phải có warehouseEntryDate trên product (đã nhập kho ít nhất 1 lần)
    if (!product.warehouseEntryDate && !product.warehouseEntryDateStr) {
      await session.abortTransaction();
      return {
        status: "ERR",
        message: "The product has no warehouse entry date and cannot be reset",
      };
    }
    // ✅ Khoảng thời gian lô: ưu tiên từ phiếu RECEIPT (tránh cộng dồn); không có thì dùng product.warehouseEntryDate để vẫn tự động chốt lô được
    let batchWindow = await getCurrentBatchWindowFromReceipts(productId);
    if (!batchWindow) {
      batchWindow = {
        warehouseEntryDate: product.warehouseEntryDate || new Date(product.warehouseEntryDateStr),
        warehouseEntryDateStr: product.warehouseEntryDateStr || formatDateVN(product.warehouseEntryDate),
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


    // ✅ SNAPSHOT: Lưu dữ liệu TRƯỚC KHI reset. Khoảng thời gian lô dùng từ RECEIPT (tránh cộng dồn giữa các lô)
    const batchSnapshot = {
      batchNumber: product.batchNumber || 1,
      plannedQuantity: product.plannedQuantity || 0,
      receivedQuantity: product.receivedQuantity || 0,
      onHandQuantity: product.onHandQuantity || 0,
      warehouseEntryDate: batchWindow.warehouseEntryDate,
      warehouseEntryDateStr: batchWindow.warehouseEntryDateStr,
      expiryDate: product.expiryDate,
      expiryDateStr: product.expiryDateStr,
    };
    // ✅ SOLD_OUT: Số đã xuất = received - onHand. EXPIRED: received = sold + discarded → sold = received - discarded.
    // Dùng received - discarded thay vì calculateSoldQuantity (ISSUE) vì: bán có thể không tạo ISSUE, hoặc timezone/date range sai.
    const onHand = batchSnapshot.onHandQuantity || 0;
    const received = batchSnapshot.receivedQuantity || 0;
    let soldQuantity = 0;
    let discardedQuantity = 0;
    if (completionReason === "EXPIRED") {
      discardedQuantity = onHand;
      soldQuantity = Math.max(0, received - discardedQuantity);
    } else {
      soldQuantity = Math.max(0, received - onHand);
      discardedQuantity = onHand;
    }


    // ✅ Tìm harvestBatch liên quan (nếu có)
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
        // Không throw error (không bắt buộc phải có harvestBatch)
      }
    }
    // ✅ Snapshot giá nhập / giá bán tại thời điểm chốt lô (để báo cáo doanh thu, lợi nhuận gộp, tổn thất)
    const unitCostPrice = product.purchasePrice ?? 0;
    const unitSellPrice = product.price ?? 0;
    // ✅ Tổng hợp doanh thu từ đơn hàng trong kỳ lô (chỉ lưu khi tổng số lượng từ đơn ≤ soldQuantity — tránh cộng dồn)
    const revenueStats = await aggregateOrderRevenueByBatch(
      productId,
      batchSnapshot.warehouseEntryDate || batchSnapshot.warehouseEntryDateStr,
      today,
      {
        targetSoldQuantity: soldQuantity,
        batchExpiryDate: batchSnapshot.expiryDateStr || batchSnapshot.expiryDate,
      }
    );
    const orderTotalQty = (revenueStats.fullPriceQuantity || 0) + (revenueStats.clearanceQuantity || 0);
    const useOrderStats = orderTotalQty > 0;
    let finalActualRevenue = 0;
    let finalClearanceQuantity = 0;
    let finalClearanceRevenue = 0;
    let finalFullPriceQuantity = 0;
    let finalFullPriceRevenue = 0;
    if (useOrderStats) {
      finalActualRevenue = revenueStats.actualRevenue;
      finalClearanceQuantity = revenueStats.clearanceQuantity;
      finalClearanceRevenue = revenueStats.clearanceRevenue;
      finalFullPriceQuantity = revenueStats.fullPriceQuantity;
      finalFullPriceRevenue = revenueStats.fullPriceRevenue;
    }
    // Snapshot name, category, brand tại thời điểm chốt lô (minh bạch, không đổi khi product sửa sau)
    const productNameSnapshot = (product.name && product.name.toString()) ? product.name.toString().trim() : "";
    const productCategoryNameSnapshot = (product.category && product.category.name) ? String(product.category.name).trim() : "";
    const productBrandSnapshot = (product.brand && product.brand.toString()) ? product.brand.toString().trim() : "";

    // Toàn bộ dữ liệu sản phẩm tại thời điểm chốt lô (bản sao độc lập, không tham chiếu Product)
    const productSnapshot = {
      name: productNameSnapshot,
      brand: productBrandSnapshot,
      categoryName: productCategoryNameSnapshot,
      short_desc: (product.short_desc && product.short_desc.toString()) ? product.short_desc.toString().trim() : "",
      detail_desc: (product.detail_desc && product.detail_desc.toString()) ? product.detail_desc.toString().trim() : "",
      price: typeof product.price === "number" ? product.price : Number(product.price) || 0,
      purchasePrice: typeof product.purchasePrice === "number" ? product.purchasePrice : Number(product.purchasePrice) || 0,
      images: Array.isArray(product.images) ? [...product.images] : [],
    };

    // ✅ Tạo batch history với dữ liệu snapshot (TRƯỚC KHI reset)
    const batchHistory = new ProductBatchHistoryModel({
      product: new mongoose.Types.ObjectId(productId),
      productNameSnapshot,
      productCategoryNameSnapshot,
      productBrandSnapshot,
      productSnapshot,
      harvestBatch: harvestBatchId,
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
      actualRevenue: finalActualRevenue,
      clearanceQuantity: finalClearanceQuantity,
      clearanceRevenue: finalClearanceRevenue,
      fullPriceQuantity: finalFullPriceQuantity,
      fullPriceRevenue: finalFullPriceRevenue,
      status: "COMPLETED",
    });


    await batchHistory.save({ session });


    // Reset product fields (giữ lại: name, category, brand, images, price, detail_desc, short_desc, status)
    product.plannedQuantity = 0;
    product.receivedQuantity = 0;
    product.onHandQuantity = 0;
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
    // Hết hạn: expiryDateStr <= today (bao gồm hết hạn trong ngày) HOẶC (expiryDateStr null và expiryDate <= endOfToday)
    const endOfTodayVN = new Date(startOfTodayVN.getTime() + 24 * 60 * 60 * 1000 - 1);
    const expiredProducts = await ProductModel.find({
      onHandQuantity: { $gt: 0 },
      $or: [
        { warehouseEntryDateStr: { $exists: true, $ne: null, $ne: "" } },
        { warehouseEntryDate: { $exists: true, $ne: null } },
      ],
      $and: [
        {
          $or: [
            { expiryDateStr: { $exists: true, $ne: null, $lte: todayStr } },
            { $and: [{ expiryDateStr: { $in: [null, ""] } }, { expiryDate: { $lte: endOfTodayVN } }] },
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
    const skippedProducts = [];

    // Tự động reset từng product
    for (const product of expiredProducts) {
      try {
        // Chỉ chốt lô khi TẤT CẢ đơn chứa sản phẩm đều COMPLETED/CANCELLED/REFUND.
        // Tránh chốt rồi có đơn PENDING/SHIPPING bị cancel → hàng trả kho khó xử lý.
        const inTransition = await hasOrdersInTransitionForProduct(product._id.toString());
        if (inTransition) {
          skippedProducts.push({ productId: product._id.toString(), productName: product.name, reason: "orders_in_transition" });
          continue;
        }

        const result = await resetProductForNewBatch(product._id.toString(), "EXPIRED");
       
        if (result.status === "OK") {
          resetResults.push({
            productId: product._id.toString(),
            productName: product.name,
            batchNumber: result.data.batchHistory.batchNumber,
            onHandQuantity: product.onHandQuantity,
            expiryDateStr: product.expiryDateStr,
          });
        }
      } catch (error) {
        // Skip on error
      }
    }


    return {
      status: "OK",
      message: `Automatically reset ${resetResults.length} expired products${skippedProducts.length > 0 ? `, skipped ${skippedProducts.length} (orders in transition)` : ""}`,
      data: {
        resetCount: resetResults.length,
        resetProducts: resetResults,
        skippedCount: skippedProducts.length,
        skippedProducts,
      },
    };
  } catch (error) {
    return { status: "ERR", message: error.message };
  }
};


/**
 * Tự động reset product khi bán hết (onHandQuantity = 0 sau khi ISSUE)
 * Được gọi từ InventoryTransactionService sau khi tạo ISSUE transaction
 * Tự động reset và lưu vào ProductBatchHistoryModel
 * @param {String} productId - Product ID
 * @param {Object} [options] - { excludeOrderId: string } - Loại trừ đơn khi kiểm tra (vd: đơn vừa COMPLETED)
 * @returns {Promise<Object>} { status, message, data }
 */
const autoResetSoldOutProduct = async (productId, options = {}) => {
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
      if (!isBatchReceivingComplete(product)) {
        return {
          status: "OK",
          message: "Batch receiving not complete (waiting for full receipt or end of day)",
          data: null,
        };
      }
      const excludeOrderId = options?.excludeOrderId ?? null;
      const inTransition = await hasOrdersInTransitionForProduct(productId, excludeOrderId);
      if (inTransition) {
        return {
          status: "OK",
          message: "Orders in transition (waiting for COMPLETED/CANCELLED/REFUND)",
          data: null,
        };
      }
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
        .populate("harvestBatch", "batchCode batchNumber harvestDate receivedQuantity") // ✅ Chỉ populate harvestBatch; KHÔNG populate product để dữ liệu hiển thị lấy từ snapshot
        .sort(sortObj)
        .skip(skip)
        .limit(limitNum)
        .lean(),
      ProductBatchHistoryModel.countDocuments(query),
    ]);
    // ✅ Tính lý do hiển thị + chỉ số tài chính; hiển thị thông tin sản phẩm CHỈ từ snapshot (không từ Product)
    const data = rawData.map((batch) => {
      const snap = batch.productSnapshot || {};
      const productDisplay = {
        name: batch.productNameSnapshot || snap.name || "",
        brand: batch.productBrandSnapshot || snap.brand || "",
        categoryName: batch.productCategoryNameSnapshot || snap.categoryName || "",
        short_desc: snap.short_desc != null ? snap.short_desc : "",
        detail_desc: snap.detail_desc != null ? snap.detail_desc : "",
        price: snap.price != null ? snap.price : (batch.unitSellPrice ?? 0),
        purchasePrice: snap.purchasePrice != null ? snap.purchasePrice : (batch.unitCostPrice ?? 0),
        images: Array.isArray(snap.images) ? snap.images : [],
      };
      const received = batch.receivedQuantity || 0;
      const sold = batch.soldQuantity || 0;
      const discarded = batch.discardedQuantity || 0;
      const unitCost = batch.unitCostPrice ?? (snap.purchasePrice != null ? snap.purchasePrice : 0);
      const unitSell = batch.unitSellPrice ?? (snap.price != null ? snap.price : 0);
      let displayReason = batch.completionReason;
      if (received > 0) {
        if (sold === 0 && discarded >= received * 0.99) {
          displayReason = "EXPIRED";
        } else if (sold >= received * 0.99) {
          displayReason = "SOLD_OUT";
        }
      }
      const completionReasonLabel = displayReason === "EXPIRED" ? "Expired" : "Sold out";
      const totalCostPrice = received * unitCost;
      const cogs = sold * unitCost;
      const revenueFromPrice = sold > 0 && unitSell > 0 ? sold * unitSell : 0;
      const rawFull = batch.fullPriceQuantity ?? 0;
      const rawClearance = batch.clearanceQuantity ?? 0;
      const rawActual = batch.actualRevenue ?? 0;
      const orderQtyValid = rawFull + rawClearance <= sold && ((rawFull + rawClearance) > 0 || rawActual > 0);
      const orderQty = rawFull + rawClearance;
      let clearanceQuantity = orderQtyValid ? rawClearance : 0;
      let clearanceRevenue = orderQtyValid ? (batch.clearanceRevenue ?? 0) : 0;
      let fullPriceQuantity = orderQtyValid ? rawFull : 0;
      let fullPriceRevenue = orderQtyValid ? (batch.fullPriceRevenue ?? 0) : 0;
      const actualRevenueFromOrders = orderQtyValid ? rawActual : 0;
      if (orderQtyValid && actualRevenueFromOrders > 0 && (fullPriceRevenue + clearanceRevenue) > 0) {
        const sum = fullPriceRevenue + clearanceRevenue;
        if (Math.abs(sum - actualRevenueFromOrders) > 0.01) {
          fullPriceRevenue = Math.round((actualRevenueFromOrders - clearanceRevenue) * 100) / 100;
        }
      }
      // Chuẩn kế toán: Revenue = doanh thu từ OrderDetail (actualRevenue). Không có đơn thì fallback sold × unitSell.
      const revenue = actualRevenueFromOrders > 0 ? actualRevenueFromOrders : revenueFromPrice;
      const revenueTheoretical = revenueFromPrice;
      const grossProfit = Math.round((revenue - cogs) * 100) / 100;
      const inventoryLoss = discarded * unitCost;
      const opportunityLoss = discarded * unitSell;
      const actualProfit = Math.round((grossProfit - inventoryLoss) * 100) / 100;
      const payload = {
        ...batch,
        productDisplay,
        completionReason: batch.completionReason,
        completionReasonDisplay: displayReason,
        completionReasonLabel,
        unitCostPrice: unitCost,
        unitSellPrice: unitSell,
        revenue,
        actualRevenue: actualRevenueFromOrders,
        financial: {
          totalCostPrice,
          cogs,
          revenue,
          revenueTheoretical: revenueFromPrice,
          actualRevenue: actualRevenueFromOrders,
          grossProfit,
          inventoryLoss,
          actualProfit,
          opportunityLoss,
          clearanceQuantity,
          clearanceRevenue,
          fullPriceQuantity,
          fullPriceRevenue,
        },
      };
      return payload;
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
        message: "No sold-out products require batch closure",
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
        // Skip on error
      }
    }

    return {
      status: "OK",
      message: `Batch closure completed for ${resetResults.length} sold-out products (catch-up)`,
      data: {
        resetCount: resetResults.length,
        resetProducts: resetResults,
      },
    };
  } catch (error) {
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
  isBatchReceivingComplete,
};
