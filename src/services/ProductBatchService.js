const mongoose = require("mongoose");
const ProductModel = require("../models/ProductModel");
const ProductBatchHistoryModel = require("../models/ProductBatchHistoryModel");
const InventoryTransactionModel = require("../models/InventoryTransactionModel");
const HarvestBatchModel = require("../models/HarvestBatchModel");
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

    // ✅ Tìm harvestBatch liên quan (nếu có)
    // Tìm harvestBatch đã được nhập kho (receivedQuantity > 0)
    // Ưu tiên harvestBatch có harvestDate gần với warehouseEntryDate nhất
    let harvestBatchId = null;
    if (product.supplier && batchSnapshot.warehouseEntryDateStr) {
      try {
        const harvestBatch = await HarvestBatchModel.findOne({
          product: new mongoose.Types.ObjectId(productId),
          supplier: product.supplier,
          status: "APPROVED",
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
 * Tự động reset products hết hạn (chạy bởi scheduled job)
 * Tìm tất cả products có expiryDateStr < today và onHandQuantity > 0
 * Tự động reset và lưu vào ProductBatchHistoryModel
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
      message: `Đã tự động reset ${resetResults.length} sản phẩm hết hạn`,
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
      return { status: "ERR", message: "Sản phẩm không tồn tại" };
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
          message: "Đã tự động reset sản phẩm (bán hết)",
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
      message: "Sản phẩm chưa đủ điều kiện để reset",
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
        .populate("harvestBatch", "batchCode batchNumber harvestDate quantity receivedQuantity") // ✅ Populate harvestBatch
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


module.exports = {
  calculateSoldQuantity,
  resetProductForNewBatch,
  autoResetExpiredProducts,
  autoResetSoldOutProduct,
  getProductBatchHistory,
};
