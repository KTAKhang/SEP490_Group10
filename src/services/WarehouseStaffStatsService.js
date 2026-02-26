/**
 * Warehouse Staff Stats Service
 *
 * Thống kê trang warehouse staff:
 * - Cá nhân: lịch sử nhập kho (RECEIPT) của nhân viên đó.
 * - Chung: tổng nhập theo tháng trong năm, tháng hiện tại, tồn kho, còn/hết hàng, sắp hết hàng (~10%), sắp hết hạn (≤7 ngày), pre-order summary.
 *
 * @module services/WarehouseStaffStatsService
 */

const mongoose = require("mongoose");
const InventoryTransactionModel = require("../models/InventoryTransactionModel");
const ProductModel = require("../models/ProductModel");
const PreOrderStockModel = require("../models/PreOrderStockModel");
const PreOrderAllocationModel = require("../models/PreOrderAllocationModel");

const RECEIPT_HISTORY_DEFAULT_LIMIT = 20;
const NEAR_EXPIRY_DAYS = 7;
const LOW_STOCK_RATIO = 0.1;

/**
 * Lấy ngày đầu và cuối tháng (0h00 - 23h59:59) theo timezone VN cho tháng hiện tại.
 */
function getCurrentMonthRangeVN() {
  const now = new Date();
  const vn = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" }));
  const start = new Date(vn.getFullYear(), vn.getMonth(), 1, 0, 0, 0, 0);
  const end = new Date(vn.getFullYear(), vn.getMonth() + 1, 0, 23, 59, 59, 999);
  return { start, end };
}

/**
 * Lấy ngày đầu và cuối năm (VN) cho năm hiện tại.
 */
function getCurrentYearRangeVN() {
  const now = new Date();
  const vn = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" }));
  const start = new Date(vn.getFullYear(), 0, 1, 0, 0, 0, 0);
  const end = new Date(vn.getFullYear(), 11, 31, 23, 59, 59, 999);
  return { start, end };
}

/**
 * "Hôm nay" 0h00 và 23h59:59 VN (để so sánh expiry: còn nhiều nhất 7 ngày = expiry trong [today, today+7]).
 */
function getTodayAndNext7DaysVN() {
  const now = new Date();
  const vn = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" }));
  const todayStart = new Date(vn.getFullYear(), vn.getMonth(), vn.getDate(), 0, 0, 0, 0);
  const todayEnd = new Date(vn.getFullYear(), vn.getMonth(), vn.getDate(), 23, 59, 59, 999);
  const in7DaysEnd = new Date(todayStart);
  in7DaysEnd.setDate(in7DaysEnd.getDate() + NEAR_EXPIRY_DAYS);
  in7DaysEnd.setHours(23, 59, 59, 999);
  return { todayStart, todayEnd, in7DaysEnd };
}

/**
 * Lịch sử nhập kho (RECEIPT) của nhân viên – có phân trang.
 */
async function getStaffReceiptHistory(staffId, page = 1, limit = RECEIPT_HISTORY_DEFAULT_LIMIT) {
  const pageNum = Math.max(1, parseInt(page) || 1);
  const limitNum = Math.max(1, Math.min(100, parseInt(limit) || RECEIPT_HISTORY_DEFAULT_LIMIT));
  const skip = (pageNum - 1) * limitNum;

  const query = {
    type: "RECEIPT",
    createdBy: new mongoose.Types.ObjectId(staffId),
  };

  const [data, total] = await Promise.all([
    InventoryTransactionModel.find(query)
      .populate("product", "name price category")
      .populate("createdBy", "user_name email")
      .populate({
        path: "harvestBatch",
        select: "batchCode batchNumber harvestDate harvestDateStr receivedQuantity supplier",
        populate: { path: "supplier", select: "name type code" },
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean(),
    InventoryTransactionModel.countDocuments(query),
  ]);

  return {
    data,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum),
    },
  };
}

/**
 * Tổng số lượng sản phẩm đã nhập (RECEIPT) theo từng tháng trong năm hiện tại (timezone VN).
 */
async function getTotalReceivedByMonthThisYear() {
  const now = new Date();
  const vn = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" }));
  const currentYear = vn.getFullYear();
  const start = new Date(currentYear, 0, 1, 0, 0, 0, 0);
  const end = new Date(currentYear, 11, 31, 23, 59, 59, 999);

  const result = await InventoryTransactionModel.aggregate([
    {
      $match: {
        type: "RECEIPT",
        createdAt: { $gte: start, $lte: end },
      },
    },
    {
      $addFields: {
        vnMonth: { $month: { date: "$createdAt", timezone: "Asia/Ho_Chi_Minh" } },
        vnYear: { $year: { date: "$createdAt", timezone: "Asia/Ho_Chi_Minh" } },
      },
    },
    { $match: { vnYear: currentYear } },
    {
      $group: {
        _id: "$vnMonth",
        totalQuantity: { $sum: "$quantity" },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  return result.map((r) => ({
    month: r._id,
    year: currentYear,
    totalQuantity: r.totalQuantity,
  }));
}

/**
 * Tổng số lượng sản phẩm đã nhập trong tháng hiện tại.
 */
async function getTotalReceivedCurrentMonth() {
  const { start, end } = getCurrentMonthRangeVN();
  const result = await InventoryTransactionModel.aggregate([
    {
      $match: {
        type: "RECEIPT",
        createdAt: { $gte: start, $lte: end },
      },
    },
    { $group: { _id: null, totalQuantity: { $sum: "$quantity" } } },
  ]);
  return result[0]?.totalQuantity ?? 0;
}

/**
 * Thống kê chung kho: tổng tồn, còn hàng, sắp hết hàng (~10%), sắp hết hạn (≤7 ngày), hết hàng.
 */
async function getWarehouseProductStats() {
  const { todayStart, in7DaysEnd } = getTodayAndNext7DaysVN();

  const products = await ProductModel.find({ status: true })
    .select("onHandQuantity receivedQuantity plannedQuantity stockStatus expiryDate expiryDateStr")
    .lean();

  let totalQuantityInStock = 0;
  let totalProductsInStock = 0;
  let totalProductsLowStock = 0;
  let totalProductsNearExpiry = 0;
  let totalProductsOutOfStock = 0;

  for (const p of products) {
    const onHand = p.onHandQuantity ?? 0;
    const received = p.receivedQuantity ?? 0;
    const planned = p.plannedQuantity ?? 0;
    const refQty = received > 0 ? received : planned;

    totalQuantityInStock += onHand;

    if (onHand > 0) {
      totalProductsInStock += 1;
      if (refQty > 0 && onHand <= refQty * LOW_STOCK_RATIO) {
        totalProductsLowStock += 1;
      }
    } else {
      totalProductsOutOfStock += 1;
    }

    if (p.expiryDate) {
      const exp = new Date(p.expiryDate);
      if (exp >= todayStart && exp <= in7DaysEnd) {
        totalProductsNearExpiry += 1;
      }
    }
  }

  return {
    totalQuantityInStock,
    totalProductsInStock,
    totalProductsLowStock,
    totalProductsNearExpiry,
    totalProductsOutOfStock,
  };
}

/**
 * Pre-order: tổng kg và summary (Total received, Total allocated, Available).
 */
async function getPreOrderSummary() {
  const stocks = await PreOrderStockModel.find().populate("fruitTypeId", "name").lean();
  const allocations = await PreOrderAllocationModel.find().lean();
  const allocMap = Object.fromEntries(allocations.map((a) => [a.fruitTypeId.toString(), a.allocatedKg || 0]));

  let totalReceivedKg = 0;
  let totalAllocatedKg = 0;

  for (const s of stocks) {
    const fid = s.fruitTypeId?._id?.toString() || s.fruitTypeId?.toString();
    const receivedKg = s.receivedKg ?? 0;
    const allocatedKg = allocMap[fid] ?? 0;
    totalReceivedKg += receivedKg;
    totalAllocatedKg += allocatedKg;
  }

  const availableKg = Math.max(0, totalReceivedKg - totalAllocatedKg);

  return {
    totalPreOrderKg: totalReceivedKg,
    preOrderStockSummary: {
      totalReceivedKg,
      totalAllocatedKg,
      availableKg,
    },
  };
}

/**
 * Lấy thống kê đầy đủ cho warehouse staff.
 *
 * @param {string} staffId - User ID của warehouse staff
 * @param {Object} [options] - { page, limit } cho lịch sử nhập kho
 * @returns {Promise<{ status: string, data: Object }>}
 */
async function getWarehouseStaffStats(staffId, options = {}) {
  if (!staffId || !mongoose.Types.ObjectId.isValid(staffId)) {
    return { status: "ERR", message: "Invalid staffId" };
  }

  const page = options.page || 1;
  const limit = options.limit || RECEIPT_HISTORY_DEFAULT_LIMIT;

  const [
    receiptHistory,
    totalReceivedByMonthThisYear,
    totalReceivedCurrentMonth,
    productStats,
    preOrder,
  ] = await Promise.all([
    getStaffReceiptHistory(staffId, page, limit),
    getTotalReceivedByMonthThisYear(),
    getTotalReceivedCurrentMonth(),
    getWarehouseProductStats(),
    getPreOrderSummary(),
  ]);

  const myStats = {
    receiptHistory: {
      data: receiptHistory.data,
      pagination: receiptHistory.pagination,
    },
  };

  const warehouseStats = {
    totalReceivedByMonthThisYear,
    totalReceivedCurrentMonth,
    totalQuantityInStock: productStats.totalQuantityInStock,
    totalProductsInStock: productStats.totalProductsInStock,
    totalProductsLowStock: productStats.totalProductsLowStock,
    totalProductsNearExpiry: productStats.totalProductsNearExpiry,
    totalProductsOutOfStock: productStats.totalProductsOutOfStock,
    totalPreOrderKg: preOrder.totalPreOrderKg,
    preOrderStockSummary: preOrder.preOrderStockSummary,
  };

  return {
    status: "OK",
    message: "Fetched warehouse staff stats successfully",
    data: {
      myStats,
      warehouseStats,
    },
  };
}

module.exports = {
  getWarehouseStaffStats,
};
