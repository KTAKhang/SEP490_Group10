const mongoose = require("mongoose");
const ProductModel = require("../models/ProductModel");
const ProductBatchHistoryModel = require("../models/ProductBatchHistoryModel");
const InventoryTransactionModel = require("../models/InventoryTransactionModel");
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
      return { status: "ERR", message: "productId không hợp lệ" };
    }

    if (!["SOLD_OUT", "EXPIRED"].includes(completionReason)) {
      return { status: "ERR", message: "completionReason phải là SOLD_OUT hoặc EXPIRED" };
    }

    // Lấy product hiện tại
    const product = await ProductModel.findById(productId).session(session);
    if (!product) {
      await session.abortTransaction();
      return { status: "ERR", message: "Sản phẩm không tồn tại" };
    }

    // Validate: phải có warehouseEntryDate (đã nhập kho ít nhất 1 lần)
    if (!product.warehouseEntryDate && !product.warehouseEntryDateStr) {
      await session.abortTransaction();
      return {
        status: "ERR",
        message: "Sản phẩm chưa có ngày nhập kho, không thể reset",
      };
    }

    // Validate: onHandQuantity phải = 0 (đã bán hết hoặc hết hạn)
    if (product.onHandQuantity > 0) {
      await session.abortTransaction();
      return {
        status: "ERR",
        message: "Sản phẩm còn tồn kho, không thể reset. Vui lòng bán hết hoặc đợi hết hạn.",
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

    // Tính soldQuantity từ warehouseEntryDate đến completedDate
    const warehouseEntryDate = batchSnapshot.warehouseEntryDate || new Date(batchSnapshot.warehouseEntryDateStr);
    const soldQuantity = await calculateSoldQuantity(productId, warehouseEntryDate, today);

    // ✅ Tính discardedQuantity: 
    // - Nếu SOLD_OUT: discardedQuantity = receivedQuantity - soldQuantity (số lượng không bán được)
    // - Nếu EXPIRED: discardedQuantity = onHandQuantity (số lượng còn lại phải vứt bỏ)
    let discardedQuantity = 0;
    if (completionReason === "EXPIRED") {
      // Hết hạn: discardedQuantity = số lượng còn lại trong kho (onHandQuantity)
      discardedQuantity = batchSnapshot.onHandQuantity || 0;
    } else {
      // Bán hết: discardedQuantity = receivedQuantity - soldQuantity (số lượng không bán được)
      discardedQuantity = Math.max(0, batchSnapshot.receivedQuantity - soldQuantity);
    }

    // ✅ Tạo batch history với dữ liệu snapshot (TRƯỚC KHI reset)
    const batchHistory = new ProductBatchHistoryModel({
      product: new mongoose.Types.ObjectId(productId),
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
      message: `Reset sản phẩm thành công. Đã lưu lịch sử lô hàng batch #${batchHistory.batchNumber}`,
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
 * Đánh dấu products hết hạn cần reset (chạy bởi scheduled job)
 * Tìm tất cả products có expiryDateStr < today và onHandQuantity > 0
 * Chỉ đánh dấu, không tự động reset (cần admin xác nhận)
 * @returns {Promise<Object>} { status, message, data: { markedCount, markedProducts } }
 */
const markExpiredProductsForReset = async () => {
  try {
    const today = getTodayInVietnam();
    const todayStr = formatDateVN(today);

    // Tìm products hết hạn và còn tồn kho, chưa được đánh dấu
    const expiredProducts = await ProductModel.find({
      expiryDateStr: { $lt: todayStr },
      onHandQuantity: { $gt: 0 },
      warehouseEntryDateStr: { $ne: null }, // Đã nhập kho
      pendingBatchReset: { $ne: true }, // Chưa được đánh dấu
    });

    if (expiredProducts.length === 0) {
      return {
        status: "OK",
        message: "Không có sản phẩm nào hết hạn cần đánh dấu",
        data: {
          markedCount: 0,
          markedProducts: [],
        },
      };
    }

    const markedResults = [];

    // Đánh dấu từng product
    for (const product of expiredProducts) {
      try {
        product.pendingBatchReset = true;
        product.resetReason = "EXPIRED";
        await product.save();

        markedResults.push({
          productId: product._id.toString(),
          productName: product.name,
          batchNumber: product.batchNumber || 1,
          onHandQuantity: product.onHandQuantity,
          expiryDateStr: product.expiryDateStr,
        });
      } catch (error) {
        console.error(`Error marking product ${product._id}:`, error);
      }
    }

    return {
      status: "OK",
      message: `Đã đánh dấu ${markedResults.length} sản phẩm hết hạn cần reset`,
      data: {
        markedCount: markedResults.length,
        markedProducts: markedResults,
      },
    };
  } catch (error) {
    console.error("Error in markExpiredProductsForReset:", error);
    return { status: "ERR", message: error.message };
  }
};

/**
 * Đánh dấu product khi bán hết (onHandQuantity = 0 sau khi ISSUE)
 * Được gọi từ InventoryTransactionService sau khi tạo ISSUE transaction
 * Chỉ đánh dấu, không tự động reset (cần admin xác nhận)
 * @param {String} productId - Product ID
 * @returns {Promise<Object>} { status, message, data }
 */
const markSoldOutProductForReset = async (productId) => {
  try {
    const product = await ProductModel.findById(productId);
    if (!product) {
      return { status: "ERR", message: "Sản phẩm không tồn tại" };
    }

    // Chỉ đánh dấu nếu onHandQuantity = 0, đã có warehouseEntryDate, và chưa được đánh dấu
    if (
      product.onHandQuantity === 0 &&
      (product.warehouseEntryDate || product.warehouseEntryDateStr) &&
      !product.pendingBatchReset
    ) {
      product.pendingBatchReset = true;
      product.resetReason = "SOLD_OUT";
      await product.save();

      return {
        status: "OK",
        message: "Đã đánh dấu sản phẩm cần reset (bán hết)",
        data: {
          productId: product._id.toString(),
          productName: product.name,
          batchNumber: product.batchNumber || 1,
        },
      };
    }

    return {
      status: "OK",
      message: "Sản phẩm chưa đủ điều kiện để đánh dấu reset",
      data: null,
    };
  } catch (error) {
    console.error("Error in markSoldOutProductForReset:", error);
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
      return { status: "ERR", message: "productId không hợp lệ" };
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

    const [data, total] = await Promise.all([
      ProductBatchHistoryModel.find(query)
        .sort(sortObj)
        .skip(skip)
        .limit(limitNum)
        .lean(),
      ProductBatchHistoryModel.countDocuments(query),
    ]);

    return {
      status: "OK",
      message: "Lấy lịch sử lô hàng thành công",
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
 * Lấy danh sách sản phẩm cần reset (chờ admin xác nhận) - có search, sort, filter, pagination
 * @param {Object} filters - { page, limit, search, resetReason, sortBy, sortOrder }
 * @returns {Promise<Object>} { status, message, data, pagination }
 */
const getPendingResetProducts = async (filters = {}) => {
  try {
    const { page = 1, limit = 20, search = "", resetReason, sortBy = "updatedAt", sortOrder = "desc" } = filters;
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit) || 20));
    const skip = (pageNum - 1) * limitNum;

    const query = {
      pendingBatchReset: true,
    };

    // Filter theo resetReason
    if (resetReason && ["SOLD_OUT", "EXPIRED"].includes(resetReason)) {
      query.resetReason = resetReason;
    }

    // Search theo tên sản phẩm hoặc brand
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { brand: { $regex: search, $options: "i" } },
      ];
    }

    // Sort options
    const allowedSortFields = ["name", "brand", "batchNumber", "updatedAt", "createdAt", "onHandQuantity", "receivedQuantity"];
    const sortField = allowedSortFields.includes(sortBy) ? sortBy : "updatedAt";
    const sortDirection = sortOrder === "asc" ? 1 : -1;
    const sortObj = { [sortField]: sortDirection };

    const [data, total] = await Promise.all([
      ProductModel.find(query)
        .populate("category", "name status")
        .select("name brand plannedQuantity receivedQuantity onHandQuantity batchNumber warehouseEntryDate warehouseEntryDateStr expiryDate expiryDateStr resetReason createdAt updatedAt")
        .sort(sortObj)
        .skip(skip)
        .limit(limitNum)
        .lean(),
      ProductModel.countDocuments(query),
    ]);

    return {
      status: "OK",
      message: "Lấy danh sách sản phẩm cần reset thành công",
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
 * Admin xác nhận reset sản phẩm (tạo batch history + reset fields)
 * @param {String} productId - Product ID
 * @returns {Promise<Object>} { status, message, data }
 */
const confirmResetProduct = async (productId) => {
  try {
    const product = await ProductModel.findById(productId);
    if (!product) {
      return { status: "ERR", message: "Sản phẩm không tồn tại" };
    }

    if (!product.pendingBatchReset) {
      return { status: "ERR", message: "Sản phẩm không có trong danh sách cần reset" };
    }

    const resetReason = product.resetReason || "SOLD_OUT";

    // Reset product (tạo batch history + reset fields)
    const result = await resetProductForNewBatch(productId, resetReason);

    if (result.status === "OK") {
      // Clear pending flag (đã được reset)
      product.pendingBatchReset = false;
      product.resetReason = null;
      await product.save();

      return {
        status: "OK",
        message: `Đã xác nhận reset sản phẩm. Đã lưu lịch sử lô hàng batch #${result.data.batchHistory.batchNumber}`,
        data: result.data,
      };
    }

    return result;
  } catch (error) {
    console.error("Error in confirmResetProduct:", error);
    return { status: "ERR", message: error.message };
  }
};

module.exports = {
  calculateSoldQuantity,
  resetProductForNewBatch,
  markExpiredProductsForReset,
  markSoldOutProductForReset,
  getProductBatchHistory,
  getPendingResetProducts,
  confirmResetProduct,
};
