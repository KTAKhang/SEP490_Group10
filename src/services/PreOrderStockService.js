/**
 * author: KhoaNDCE170420
 * Pre-order Stock Service
 *
 * Total received across ALL batches MUST NOT exceed total demand.
 * Each receive: quantity > 0 and <= (remaining demand not yet received). Requires explicit confirmation flag.
 */

const mongoose = require("mongoose");
const PreOrderStockModel = require("../models/PreOrderStockModel");
const PreOrderReceiveModel = require("../models/PreOrderReceiveModel");
const PreOrderHarvestBatchModel = require("../models/PreOrderHarvestBatchModel");
const PreOrderAllocationModel = require("../models/PreOrderAllocationModel");
const PreOrderModel = require("../models/PreOrderModel");
const FruitTypeModel = require("../models/FruitTypeModel");

/** Statuses that count toward demand. */
const DEMAND_STATUSES = ["WAITING_FOR_ALLOCATION", "WAITING_FOR_NEXT_BATCH", "ALLOCATED_WAITING_PAYMENT", "WAITING_FOR_PRODUCT"];

async function getDemandKgForFruitType(fruitTypeId) {
  const agg = await PreOrderModel.aggregate([
    { $match: { fruitTypeId: new mongoose.Types.ObjectId(fruitTypeId), status: { $in: DEMAND_STATUSES } } },
    { $group: { _id: null, demandKg: { $sum: "$quantityKg" } } },
  ]);
  return agg[0]?.demandKg ?? 0;
}

/** Allocated kg for this fruit type (from PreOrderAllocation). Used to compute available = received - allocated. */
async function getAllocatedKgForFruitType(fruitTypeId) {
  const a = await PreOrderAllocationModel.findOne({ fruitTypeId }).lean();
  return a?.allocatedKg ?? 0;
}

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
 * Warehouse staff: record a receive into pre-order stock by fruit type.
 * Total received must not exceed demand. Requires confirmed: true.
 *
 * @param {Object} params - Input parameters
 * @param {string} params.fruitTypeId - Fruit type document ID
 * @param {number} params.quantityKg - Quantity received (kg)
 * @param {string} params.receivedBy - User ID of warehouse staff
 * @param {boolean} params.confirmed - Must be true (business confirmation)
 * @param {string} [params.note] - Optional note
 * @returns {Promise<{ status: string, data: Object, stock: Object }>}
 */
async function createReceive({ fruitTypeId, quantityKg, receivedBy, confirmed, note }) {
  if (confirmed !== true) throw new Error("Receive requires explicit confirmation (confirmed: true)");
  const ft = await FruitTypeModel.findById(fruitTypeId).lean();
  if (!ft) throw new Error("Fruit type not found");
  const qty = Number(quantityKg);
  if (isNaN(qty) || qty <= 0) throw new Error("Quantity (kg) must be greater than 0");

  const demandKg = await getDemandKgForFruitType(fruitTypeId);
  const stock = await PreOrderStockModel.findOne({ fruitTypeId }).lean();
  const totalReceived = stock?.receivedKg ?? 0;
  const allocatedKg = await getAllocatedKgForFruitType(fruitTypeId);
  const availableKg = Math.max(0, totalReceived - allocatedKg);
  const doneReceiving = totalReceived >= allocatedKg && demandKg <= allocatedKg;
  const remainingToReceive = doneReceiving ? 0 : Math.max(0, demandKg - availableKg);
  if (qty > remainingToReceive) {
    throw new Error(`Receive quantity (${qty} kg) exceeds remaining to receive (${remainingToReceive} kg). Demand: ${demandKg} kg, available: ${availableKg} kg, already received: ${totalReceived} kg.`);
  }

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
 * Warehouse staff: receive pre-order stock by batch (PreOrderHarvestBatch).
 * Partial receives allowed. Total received must not exceed demand. Requires confirmed: true.
 *
 * Business rules:
 * - Batch must exist
 * - quantityKg > 0 and <= min(batch.quantityKg - batch.receivedKg, demand - totalReceivedForFruitType)
 * - confirmed must be true
 *
 * @param {Object} params - Input parameters
 * @param {string} params.preOrderHarvestBatchId - PreOrderHarvestBatch document ID
 * @param {number} params.quantityKg - Quantity received (kg)
 * @param {string} params.receivedBy - User ID of warehouse staff
 * @param {boolean} params.confirmed - Must be true (business confirmation)
 * @param {string} [params.note] - Optional note
 * @returns {Promise<{ status: string, data: Object, batch: Object, stock: Object }>}
 */
async function createReceiveByBatch({ preOrderHarvestBatchId, quantityKg, receivedBy, confirmed, note }) {
  if (confirmed !== true) throw new Error("Receive requires explicit confirmation (confirmed: true)");
  if (!mongoose.isValidObjectId(preOrderHarvestBatchId)) {
    throw new Error("Invalid preOrderHarvestBatchId");
  }
  const batch = await PreOrderHarvestBatchModel.findById(preOrderHarvestBatchId).lean();
  if (!batch) throw new Error("Pre-order receive batch not found");
  const planned = batch.quantityKg ?? 0;
  const batchReceived = batch.receivedKg ?? 0;
  const qty = Number(quantityKg);
  if (!Number.isFinite(qty) || qty <= 0) throw new Error("Quantity (kg) must be greater than 0");
  if (qty > planned - batchReceived) {
    throw new Error(`Receive quantity (${qty} kg) exceeds batch remaining (${Math.max(0, planned - batchReceived)} kg). Batch planned: ${planned} kg, already received: ${batchReceived} kg.`);
  }

  const fruitTypeId = batch.fruitTypeId;
  const demandKg = await getDemandKgForFruitType(fruitTypeId);
  const stockDoc = await PreOrderStockModel.findOne({ fruitTypeId }).lean();
  const totalReceived = stockDoc?.receivedKg ?? 0;
  const allocatedKg = await getAllocatedKgForFruitType(fruitTypeId);
  const availableKg = Math.max(0, totalReceived - allocatedKg);
  const doneReceiving = totalReceived >= allocatedKg && demandKg <= allocatedKg;
  const remainingToReceive = doneReceiving ? 0 : Math.max(0, demandKg - availableKg);
  if (qty > remainingToReceive) {
    throw new Error(`Receive quantity (${qty} kg) exceeds remaining to receive (${remainingToReceive} kg). Demand: ${demandKg} kg, available: ${availableKg} kg, already received: ${totalReceived} kg.`);
  }

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
