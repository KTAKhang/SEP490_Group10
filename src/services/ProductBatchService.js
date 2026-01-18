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

    // Tính soldQuantity từ warehouseEntryDate đến completedDate
    const warehouseEntryDate = product.warehouseEntryDate || new Date(product.warehouseEntryDateStr);
    const soldQuantity = await calculateSoldQuantity(productId, warehouseEntryDate, today);

    // Tính discardedQuantity = receivedQuantity - soldQuantity
    const discardedQuantity = Math.max(0, (product.receivedQuantity || 0) - soldQuantity);

    // Tạo batch history
    const batchHistory = new ProductBatchHistoryModel({
      product: new mongoose.Types.ObjectId(productId),
      batchNumber: product.batchNumber || 1,
      plannedQuantity: product.plannedQuantity || 0,
      receivedQuantity: product.receivedQuantity || 0,
      soldQuantity: soldQuantity,
      discardedQuantity: discardedQuantity,
      warehouseEntryDate: product.warehouseEntryDate,
      warehouseEntryDateStr: product.warehouseEntryDateStr,
      expiryDate: product.expiryDate,
      expiryDateStr: product.expiryDateStr,
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
    product.shelfLifeDays = null;
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
 * Auto-reset products hết hạn (chạy bởi scheduled job)
 * Tìm tất cả products có expiryDateStr < today và onHandQuantity > 0
 * @returns {Promise<Object>} { status, message, data: { resetCount, resetProducts } }
 */
const autoResetExpiredProducts = async () => {
  try {
    const today = getTodayInVietnam();
    const todayStr = formatDateVN(today);

    // Tìm products hết hạn và còn tồn kho
    const expiredProducts = await ProductModel.find({
      expiryDateStr: { $lt: todayStr },
      onHandQuantity: { $gt: 0 },
      warehouseEntryDateStr: { $ne: null }, // Đã nhập kho
    });

    if (expiredProducts.length === 0) {
      return {
        status: "OK",
        message: "Không có sản phẩm nào hết hạn cần reset",
        data: {
          resetCount: 0,
          resetProducts: [],
          errors: [],
        },
      };
    }

    const resetResults = [];
    const errors = [];

    // Reset từng product
    for (const product of expiredProducts) {
      try {
        // ✅ Lưu onHandQuantity trước khi reset (vì đã hết hạn, phải vứt bỏ)
        const onHandBeforeReset = product.onHandQuantity;
        
        // Set onHandQuantity về 0 để pass validation trong resetProductForNewBatch
        product.onHandQuantity = 0;
        await product.save();

        // ✅ Reset product (tạo batch history + reset fields)
        const result = await resetProductForNewBatch(product._id.toString(), "EXPIRED");
        if (result.status === "OK") {
          resetResults.push({
            productId: product._id.toString(),
            productName: product.name,
            batchNumber: result.data.batchHistory.batchNumber,
            discardedQuantity: onHandBeforeReset, // Số lượng vứt bỏ
          });
        } else {
          // Rollback onHandQuantity nếu reset thất bại
          product.onHandQuantity = onHandBeforeReset;
          await product.save();
          
          errors.push({
            productId: product._id.toString(),
            productName: product.name,
            error: result.message,
          });
        }
      } catch (error) {
        errors.push({
          productId: product._id.toString(),
          productName: product.name,
          error: error.message,
        });
      }
    }

    return {
      status: "OK",
      message: `Đã reset ${resetResults.length} sản phẩm hết hạn. ${errors.length} lỗi.`,
      data: {
        resetCount: resetResults.length,
        resetProducts: resetResults,
        errors: errors,
      },
    };
  } catch (error) {
    console.error("Error in autoResetExpiredProducts:", error);
    return { status: "ERR", message: error.message };
  }
};

/**
 * Auto-reset product khi bán hết (onHandQuantity = 0 sau khi ISSUE)
 * Được gọi từ InventoryTransactionService sau khi tạo ISSUE transaction
 * @param {String} productId - Product ID
 * @returns {Promise<Object>} { status, message, data }
 */
const autoResetSoldOutProduct = async (productId) => {
  try {
    const product = await ProductModel.findById(productId);
    if (!product) {
      return { status: "ERR", message: "Sản phẩm không tồn tại" };
    }

    // Chỉ reset nếu onHandQuantity = 0 và đã có warehouseEntryDate (đã nhập kho)
    if (product.onHandQuantity === 0 && (product.warehouseEntryDate || product.warehouseEntryDateStr)) {
      return await resetProductForNewBatch(productId, "SOLD_OUT");
    }

    return {
      status: "OK",
      message: "Sản phẩm chưa đủ điều kiện để reset",
      data: null,
    };
  } catch (error) {
    console.error("Error in autoResetSoldOutProduct:", error);
    return { status: "ERR", message: error.message };
  }
};

/**
 * Lấy lịch sử lô hàng của một sản phẩm
 * @param {String} productId - Product ID
 * @param {Object} filters - { page, limit }
 * @returns {Promise<Object>} { status, message, data, pagination }
 */
const getProductBatchHistory = async (productId, filters = {}) => {
  try {
    if (!mongoose.isValidObjectId(productId)) {
      return { status: "ERR", message: "productId không hợp lệ" };
    }

    const { page = 1, limit = 20 } = filters;
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit) || 20));
    const skip = (pageNum - 1) * limitNum;

    const query = { product: new mongoose.Types.ObjectId(productId) };

    const [data, total] = await Promise.all([
      ProductBatchHistoryModel.find(query)
        .sort({ batchNumber: -1 }) // Lô mới nhất trước
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

module.exports = {
  calculateSoldQuantity,
  resetProductForNewBatch,
  autoResetExpiredProducts,
  autoResetSoldOutProduct,
  getProductBatchHistory,
};
