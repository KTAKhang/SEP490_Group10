/**
 * Pre-order Harvest Batch Service
 *
 * Business logic for pre-order receive batches (admin/sales-staff create batches; warehouse receives into stock).
 *
 * This service handles:
 * - Create pre-order receive batch: link fruit type + harvest batch (or supplier + harvest date + batch number); one batch per (fruitTypeId, harvest date, batch number, supplier)
 * - List batches with filters (fruitTypeId, supplierId, status), keyword search, sort and pagination; each batch has status NOT_RECEIVED | PARTIAL | FULLY_RECEIVED
 * - Get batch by ID
 *
 * A fruit type can have multiple harvest batches; warehouse can receive stock multiple times (partial deliveries).
 *
 * @module services/PreOrderHarvestBatchService
 */

const mongoose = require("mongoose");
const PreOrderHarvestBatchModel = require("../models/PreOrderHarvestBatchModel");
const HarvestBatchModel = require("../models/HarvestBatchModel");
const FruitTypeModel = require("../models/FruitTypeModel");
const SupplierModel = require("../models/SupplierModel");
const PreOrderModel = require("../models/PreOrderModel");

/** Statuses that count toward demand. */
const DEMAND_STATUSES = ["WAITING_FOR_ALLOCATION", "WAITING_FOR_NEXT_BATCH", "ALLOCATED_WAITING_PAYMENT"];

/**
 * Admin: create a pre-order receive batch for a fruit type. Multiple batches per fruit type allowed.
 *
 * Business rules:
 * - Fruit type must exist; quantityKg must be a positive number
 * - quantityKg can be any positive (receive-time validation: total received must not exceed demand)
 * - Either harvestBatchId (linked harvest batch) or supplierId + harvestDate + batchNumber must be provided; supplier must be ACTIVE
 *
 * @param {Object} params - Input parameters
 * @param {string} [params.harvestBatchId] - Optional linked harvest batch ID (supplier/date/number taken from it)
 * @param {string} params.fruitTypeId - Fruit type document ID
 * @param {string} [params.supplierId] - Required if no harvestBatchId; supplier must be ACTIVE
 * @param {number} params.quantityKg - Planned quantity (kg)
 * @param {string} [params.harvestDate] - Required if no harvestBatchId
 * @param {string} [params.batchNumber] - Required if no harvestBatchId
 * @param {string} [params.notes] - Optional notes (max 500 chars)
 * @returns {Promise<{ status: string, data: Object }>}
 */
async function createBatch({
  harvestBatchId,
  fruitTypeId,
  supplierId,
  quantityKg,
  harvestDate,
  batchNumber,
  notes,
}) {
  if (!mongoose.isValidObjectId(fruitTypeId)) {
    throw new Error("Invalid fruitTypeId");
  }
  const ft = await FruitTypeModel.findById(fruitTypeId).lean();
  if (!ft) throw new Error("Fruit type not found");
  const qty = Number(quantityKg);
  if (!Number.isFinite(qty) || qty <= 0) {
    throw new Error("Quantity (kg) must be greater than 0");
  }

  let finalSupplierId, finalHarvestDate, finalBatchNumber, finalHarvestBatchId = null;

  if (harvestBatchId && mongoose.isValidObjectId(harvestBatchId)) {
    const hb = await HarvestBatchModel.findById(harvestBatchId)
      .populate("supplier", "name cooperationStatus")
      .lean();
    if (!hb) throw new Error("Harvest batch not found. Create at Harvest Batch Management.");
    if (hb.isPreOrderBatch !== true) {
      throw new Error("Only pre-order harvest batches can be used for pre-order receive batch. Create a pre-order harvest batch (check \"Pre-order harvest batch\") at Harvest Batch Management.");
    }
    const hbFruitId = hb.fruitTypeId?._id?.toString() || hb.fruitTypeId?.toString();
    if (hbFruitId && fruitTypeId && hbFruitId !== String(fruitTypeId)) {
      throw new Error("Harvest batch fruit type must match the selected fruit type. Select a harvest batch for this fruit type.");
    }
    if (hb.supplier?.cooperationStatus && hb.supplier.cooperationStatus !== "ACTIVE") {
      throw new Error("Harvest batch supplier is not ACTIVE.");
    }
    finalSupplierId = hb.supplier?._id || hb.supplier;
    finalHarvestDate = hb.harvestDate;
    finalBatchNumber = (hb.batchNumber || hb.batchCode || "").toString().trim();
    finalHarvestBatchId = hb._id;
  } else {
    if (!mongoose.isValidObjectId(supplierId)) throw new Error("Select harvest batch or supplier and batch number.");
    const sup = await SupplierModel.findById(supplierId).lean();
    if (!sup) throw new Error("Supplier not found");
    if (sup.cooperationStatus && sup.cooperationStatus !== "ACTIVE") {
      throw new Error("Only select ACTIVE supplier");
    }
    if (!harvestDate) throw new Error("Harvest date is required");
    if (!batchNumber || !String(batchNumber).trim()) throw new Error("Batch number is required");
    finalSupplierId = supplierId;
    finalHarvestDate = new Date(harvestDate);
    finalBatchNumber = String(batchNumber).trim();
  }

  const harvestDayStart = new Date(finalHarvestDate);
  harvestDayStart.setUTCHours(0, 0, 0, 0);
  const harvestDayEnd = new Date(harvestDayStart);
  harvestDayEnd.setUTCDate(harvestDayEnd.getUTCDate() + 1);
  const existingBatch = await PreOrderHarvestBatchModel.findOne({
    fruitTypeId: new mongoose.Types.ObjectId(fruitTypeId),
    harvestDate: { $gte: harvestDayStart, $lt: harvestDayEnd },
    batchNumber: finalBatchNumber,
    supplierId: new mongoose.Types.ObjectId(finalSupplierId),
  }).lean();
  if (existingBatch) {
    throw new Error(
      "A pre-order receive batch already exists for this fruit type, harvest date, batch number and supplier. Use a different batch number or supplier for the same day."
    );
  }

  const batch = await PreOrderHarvestBatchModel.create({
    harvestBatchId: finalHarvestBatchId,
    fruitTypeId: new mongoose.Types.ObjectId(fruitTypeId),
    supplierId: new mongoose.Types.ObjectId(finalSupplierId),
    quantityKg: qty,
    harvestDate: finalHarvestDate,
    batchNumber: finalBatchNumber,
    notes: (notes || "").toString().trim().slice(0, 500),
  });

  const populated = await PreOrderHarvestBatchModel.findById(batch._id)
    .populate("fruitTypeId", "name")
    .populate("supplierId", "name")
    .populate("harvestBatchId", "batchCode batchNumber harvestDate")
    .lean();
  return { status: "OK", data: populated };
}

/**
 * List pre-order receive batches with optional filters (fruitTypeId, supplierId, status), keyword search (fruit name, batchCode, batchNumber),
 * sort and pagination. Each batch is enriched with status: NOT_RECEIVED | PARTIAL | FULLY_RECEIVED (derived from receivedKg vs quantityKg).
 *
 * Flow:
 * 1. Build query from fruitTypeId, supplierId; fetch all matching batches with populate (fruitTypeId, supplierId, harvestBatchId)
 * 2. Map each batch to add remainingKg and status (NOT_RECEIVED / PARTIAL / FULLY_RECEIVED)
 * 3. Optional status filter; optional keyword filter (fruit name, batchCode, batchNumber)
 * 4. Sort in memory (harvestDate, createdAt, quantityKg, batchCode); paginate (slice) and return
 *
 * @param {Object} [filters={}] - Filter and pagination options
 * @param {string} [filters.fruitTypeId] - Optional fruit type ID
 * @param {string} [filters.supplierId] - Optional supplier ID
 * @param {string} [filters.status] - Optional: NOT_RECEIVED | PARTIAL | FULLY_RECEIVED
 * @param {number} [filters.page=1] - Page number
 * @param {number} [filters.limit=20] - Items per page
 * @param {string} [filters.keyword] - Search in fruit name, batchCode, batchNumber (case-insensitive)
 * @param {string} [filters.sortBy="harvestDate"] - harvestDate | createdAt | quantityKg | batchCode
 * @param {string} [filters.sortOrder="desc"] - asc | desc
 * @returns {Promise<{ status: string, data: Array, pagination: Object }>}
 */
async function listBatches(filters = {}) {
  const { fruitTypeId, supplierId, status, page = 1, limit = 20, keyword, sortBy = "harvestDate", sortOrder = "desc" } = filters;
  const query = {};
  if (fruitTypeId && mongoose.isValidObjectId(fruitTypeId)) query.fruitTypeId = fruitTypeId;
  if (supplierId && mongoose.isValidObjectId(supplierId)) query.supplierId = supplierId;

  const list = await PreOrderHarvestBatchModel.find(query)
    .populate("fruitTypeId", "name")
    .populate("supplierId", "name")
    .populate("harvestBatchId", "batchCode batchNumber harvestDate")
    .sort({ harvestDate: -1, createdAt: -1 })
    .lean();

  let data = list.map((b) => {
    const receivedKg = b.receivedKg ?? 0;
    const quantityKg = b.quantityKg ?? 0;
    let s = "NOT_RECEIVED";
    if (receivedKg >= quantityKg) s = "FULLY_RECEIVED";
    else if (receivedKg > 0) s = "PARTIAL";
    return {
      ...b,
      remainingKg: Math.max(0, quantityKg - receivedKg),
      status: s,
    };
  });
  if (status) {
    data = data.filter((d) => d.status === status);
  }
  if (keyword && String(keyword).trim()) {
    const k = String(keyword).trim().toLowerCase();
    data = data.filter(
      (d) =>
        (d.fruitTypeId?.name || "").toLowerCase().includes(k) ||
        (d.batchCode || "").toLowerCase().includes(k) ||
        (d.harvestBatchId?.batchCode || "").toLowerCase().includes(k) ||
        (d.batchNumber || "").toLowerCase().includes(k)
    );
  }
  const total = data.length;
  const sortField = ["harvestDate", "createdAt", "quantityKg", "batchCode"].includes(sortBy) ? sortBy : "harvestDate";
  const asc = sortOrder === "asc" ? 1 : -1;
  data.sort((a, b) => {
    let va = a[sortField] ?? (sortField === "batchCode" ? (a.batchCode || a.harvestBatchId?.batchCode || "") : 0);
    let vb = b[sortField] ?? (sortField === "batchCode" ? (b.batchCode || b.harvestBatchId?.batchCode || "") : 0);
    if (sortField === "harvestDate" || sortField === "createdAt") {
      va = new Date(va).getTime();
      vb = new Date(vb).getTime();
    }
    if (typeof va === "string") return asc * (va.localeCompare(vb));
    return asc * (va - vb);
  });
  const limitNum = Math.max(1, Math.min(100, Number(limit) || 20));
  const pageNum = Math.max(1, Number(page) || 1);
  const paginated = data.slice((pageNum - 1) * limitNum, pageNum * limitNum);
  return {
    status: "OK",
    data: paginated,
    pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) },
  };
}

/**
 * Get a single pre-order receive batch by ID. Returns batch with remainingKg and status (NOT_RECEIVED | PARTIAL | FULLY_RECEIVED).
 *
 * @param {string} id - PreOrderHarvestBatch document ID
 * @returns {Promise<{ status: string, data?: Object, message?: string }>} OK with data, or ERR with message if invalid ID or not found
 */
async function getBatchById(id) {
  if (!mongoose.isValidObjectId(id)) {
    return { status: "ERR", message: "Invalid ID" };
  }
  const b = await PreOrderHarvestBatchModel.findById(id)
    .populate("fruitTypeId", "name")
    .populate("supplierId", "name")
    .populate("harvestBatchId", "batchCode batchNumber harvestDate supplier")
    .lean();
  if (!b) return { status: "ERR", message: "Batch not found" };
  const receivedKg = b.receivedKg ?? 0;
  const quantityKg = b.quantityKg ?? 0;
  let status = "NOT_RECEIVED";
  if (receivedKg >= quantityKg) status = "FULLY_RECEIVED";
  else if (receivedKg > 0) status = "PARTIAL";
  return {
    status: "OK",
    data: {
      ...b,
      remainingKg: Math.max(0, quantityKg - receivedKg),
      status,
    },
  };
}

module.exports = {
  createBatch,
  listBatches,
  getBatchById,
};
