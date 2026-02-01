/**
 * Pre-order Stock Service
 *
 * Business logic for pre-order stock (PreOrderStock) and receive records (PreOrderReceive).
 * Warehouse staff receive stock by fruit type or by pre-order harvest batch; Admin and Warehouse view stock list
 * (receivedKg, allocatedKg, availableKg per fruit type) and receive history.
 */

const mongoose = require("mongoose");
const PreOrderStockModel = require("../models/PreOrderStockModel");
const PreOrderReceiveModel = require("../models/PreOrderReceiveModel");
const PreOrderHarvestBatchModel = require("../models/PreOrderHarvestBatchModel");
const PreOrderAllocationModel = require("../models/PreOrderAllocationModel");
const FruitTypeModel = require("../models/FruitTypeModel");

/**
 * List pre-order stock by fruit type: receivedKg, allocatedKg, availableKg (receivedKg - allocatedKg).
 * Includes fruit types that allow pre-order and are ACTIVE but have no stock record yet (receivedKg = 0).
 *
 * Flow:
 * 1. Load all PreOrderStock with populated fruitTypeId (name); load all PreOrderAllocation and build allocMap (fruitTypeId -> allocatedKg)
 * 2. Map each stock to { _id, fruitTypeId, fruitTypeName, receivedKg, allocatedKg, availableKg }
 * 3. Load FruitType where allowPreOrder and status ACTIVE; for any not already in data, append row with receivedKg/allocatedKg/availableKg = 0
 *
 * @returns {Promise<{ status: string, data: Array }>}
 */
async function listStock() {
  const stocks = await PreOrderStockModel.find().populate("fruitTypeId", "name").lean();
  const allocations = await PreOrderAllocationModel.find().lean();
  const allocMap = Object.fromEntries(allocations.map((a) => [a.fruitTypeId.toString(), a.allocatedKg || 0]));

  const data = stocks.map((s) => {
    const fid = s.fruitTypeId?._id?.toString() || s.fruitTypeId?.toString();
    const receivedKg = s.receivedKg ?? 0;
    const allocatedKg = allocMap[fid] ?? 0;
    return {
      _id: s._id,
      fruitTypeId: s.fruitTypeId,
      fruitTypeName: s.fruitTypeId?.name,
      receivedKg,
      allocatedKg,
      availableKg: Math.max(0, receivedKg - allocatedKg),
    };
  });

  const fruitTypeIds = data.map((d) => d.fruitTypeId?._id || d.fruitTypeId);
  const allFruitTypes = await FruitTypeModel.find({ allowPreOrder: true, status: "ACTIVE" }).lean();
  const existingIds = new Set(fruitTypeIds.map((id) => id?.toString()));
  for (const ft of allFruitTypes) {
    const fid = ft._id.toString();
    if (existingIds.has(fid)) continue;
    data.push({
      _id: null,
      fruitTypeId: ft._id,
      fruitTypeName: ft.name,
      receivedKg: 0,
      allocatedKg: allocMap[fid] ?? 0,
      availableKg: 0,
    });
  }

  return { status: "OK", data };
}

/**
 * Warehouse staff: record a receive into pre-order stock by fruit type. Creates PreOrderReceive and increments PreOrderStock.receivedKg.
 *
 * Flow:
 * 1. Validate fruit type exists and quantityKg > 0
 * 2. Create PreOrderReceive (fruitTypeId, quantityKg, receivedBy, note)
 * 3. FindOneAndUpdate PreOrderStock for fruitTypeId: $inc receivedKg by quantityKg (upsert: true)
 * 4. Return created receive and updated stock
 *
 * @param {Object} params - Input parameters
 * @param {string} params.fruitTypeId - Fruit type document ID
 * @param {number} params.quantityKg - Quantity received (kg)
 * @param {string} params.receivedBy - User ID of warehouse staff
 * @param {string} [params.note] - Optional note
 * @returns {Promise<{ status: string, data: Object, stock: Object }>}
 */
async function createReceive({ fruitTypeId, quantityKg, receivedBy, note }) {
  const ft = await FruitTypeModel.findById(fruitTypeId).lean();
  if (!ft) throw new Error("Fruit type not found");
  const qty = Number(quantityKg);
  if (isNaN(qty) || qty <= 0) throw new Error("Quantity (kg) must be greater than 0");

  const [receive] = await Promise.all([
    PreOrderReceiveModel.create({
      fruitTypeId,
      quantityKg: qty,
      receivedBy,
      note: (note || "").toString().trim(),
    }),
    PreOrderStockModel.findOneAndUpdate(
      { fruitTypeId },
      { $inc: { receivedKg: qty } },
      { new: true, upsert: true }
    ),
  ]);

  return { status: "OK", data: receive, stock: await PreOrderStockModel.findOne({ fruitTypeId }).lean() };
}

/**
 * Warehouse staff: receive pre-order stock by batch (PreOrderHarvestBatch). One-time receive only per batch; quantity must equal planned (batch.quantityKg).
 *
 * Business rules:
 * - Batch must exist; batch must not already have receivedKg > 0 or any PreOrderReceive record
 * - quantityKg must equal batch.quantityKg (planned)
 *
 * Flow:
 * 1. Load batch; validate not already received (batch.receivedKg === 0, no PreOrderReceive for this batch)
 * 2. Validate quantityKg === batch.quantityKg
 * 3. Create PreOrderReceive (preOrderHarvestBatchId, fruitTypeId, quantityKg, receivedBy, note)
 * 4. Update PreOrderHarvestBatch: $inc receivedKg by quantityKg
 * 5. Update PreOrderStock for fruitTypeId: $inc receivedKg by quantityKg (upsert)
 * 6. Return created receive, updated batch, and updated stock
 *
 * @param {Object} params - Input parameters
 * @param {string} params.preOrderHarvestBatchId - PreOrderHarvestBatch document ID
 * @param {number} params.quantityKg - Quantity received (must equal batch.quantityKg)
 * @param {string} params.receivedBy - User ID of warehouse staff
 * @param {string} [params.note] - Optional note
 * @returns {Promise<{ status: string, data: Object, batch: Object, stock: Object }>}
 */
async function createReceiveByBatch({ preOrderHarvestBatchId, quantityKg, receivedBy, note }) {
  if (!mongoose.isValidObjectId(preOrderHarvestBatchId)) {
    throw new Error("Invalid preOrderHarvestBatchId");
  }
  const batch = await PreOrderHarvestBatchModel.findById(preOrderHarvestBatchId).lean();
  if (!batch) throw new Error("Pre-order receive batch not found");
  const planned = batch.quantityKg ?? 0;
  const received = batch.receivedKg ?? 0;
  if (received > 0) {
    throw new Error("This batch was already received. Each batch can only be received once.");
  }
  const existingReceives = await PreOrderReceiveModel.countDocuments({ preOrderHarvestBatchId: batch._id });
  if (existingReceives > 0) {
    throw new Error("This batch already has a receive record. Each batch can only be received once.");
  }
  const qty = Number(quantityKg);
  if (!Number.isFinite(qty) || qty <= 0) throw new Error("Quantity (kg) must be greater than 0");
  if (Math.abs(qty - planned) > 0.001) {
    throw new Error(`Received quantity must equal planned quantity (${planned} kg). One-time receive only.`);
  }
  const fruitTypeId = batch.fruitTypeId;

  const receive = await PreOrderReceiveModel.create({
    preOrderHarvestBatchId: batch._id,
    fruitTypeId,
    quantityKg: qty,
    receivedBy,
    note: (note || "").toString().trim(),
  });

  await PreOrderHarvestBatchModel.findByIdAndUpdate(preOrderHarvestBatchId, {
    $inc: { receivedKg: qty },
  });
  await PreOrderStockModel.findOneAndUpdate(
    { fruitTypeId },
    { $inc: { receivedKg: qty } },
    { new: true, upsert: true }
  );

  const updatedBatch = await PreOrderHarvestBatchModel.findById(preOrderHarvestBatchId).lean();
  return {
    status: "OK",
    data: receive,
    batch: updatedBatch,
    stock: await PreOrderStockModel.findOne({ fruitTypeId }).lean(),
  };
}

/**
 * List pre-order receive history with optional filter by fruitTypeId or preOrderHarvestBatchId, pagination.
 *
 * Flow:
 * 1. Build filter from fruitTypeId, preOrderHarvestBatchId (if valid ObjectId)
 * 2. Find PreOrderReceive with populate (fruitTypeId, preOrderHarvestBatchId, receivedBy); sort by createdAt desc; skip/limit
 * 3. Return list and pagination metadata
 *
 * @param {string} [fruitTypeId] - Optional fruit type ID to filter by
 * @param {number} [page=1] - Page number
 * @param {number} [limit=20] - Items per page
 * @param {string} [preOrderHarvestBatchId=null] - Optional batch ID to filter by
 * @returns {Promise<{ status: string, data: Array, pagination: Object }>}
 */
async function listReceives(fruitTypeId, page = 1, limit = 20, preOrderHarvestBatchId = null) {
  const filter = {};
  if (fruitTypeId) filter.fruitTypeId = fruitTypeId;
  if (preOrderHarvestBatchId && mongoose.isValidObjectId(preOrderHarvestBatchId)) {
    filter.preOrderHarvestBatchId = preOrderHarvestBatchId;
  }
  const skip = (Math.max(1, page) - 1) * Math.max(1, Math.min(100, limit));
  const [list, total] = await Promise.all([
    PreOrderReceiveModel.find(filter)
      .populate("fruitTypeId", "name")
      .populate("preOrderHarvestBatchId", "batchCode quantityKg receivedKg")
      .populate("receivedBy", "user_name")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Math.max(1, Math.min(100, limit)))
      .lean(),
    PreOrderReceiveModel.countDocuments(filter),
  ]);
  return {
    status: "OK",
    data: list,
    pagination: { page: Math.max(1, page), limit: Math.max(1, Math.min(100, limit)), total, totalPages: Math.ceil(total / Math.max(1, Math.min(100, limit))) },
  };
}

/**
 * Get total received kg for a fruit type from PreOrderStock. Returns 0 if no stock record exists.
 *
 * @param {string} fruitTypeId - Fruit type document ID
 * @returns {Promise<number>} receivedKg (0 if no record)
 */
async function getReceivedKgByFruitType(fruitTypeId) {
  const s = await PreOrderStockModel.findOne({ fruitTypeId }).lean();
  return (s?.receivedKg ?? 0);
}

module.exports = {
  listStock,
  createReceive,
  createReceiveByBatch,
  listReceives,
  getReceivedKgByFruitType,
};
