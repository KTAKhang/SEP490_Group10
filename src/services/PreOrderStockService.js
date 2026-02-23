/**
 * Pre-order Stock Service
 *
 * Business logic for pre-order stock (received kg by fruit type) and warehouse receive operations.
 *
 * This service handles:
 * - List pre-order stock by fruit type: receivedKg, allocatedKg, availableKg (receivedKg - allocatedKg)
 * - Warehouse receive by fruit type: increment receivedKg; total received must not exceed demand; requires confirmed: true
 * - Warehouse receive by batch (PreOrderHarvestBatch): partial receives allowed; total received must not exceed demand
 * - List receive history with optional filters and pagination
 *
 * Total received for a fruit type must not exceed total demand. Each receive requires explicit confirmation (confirmed: true).
 *
 * @module services/PreOrderStockService
 */

const mongoose = require("mongoose");
const PreOrderStockModel = require("../models/PreOrderStockModel");
const PreOrderReceiveModel = require("../models/PreOrderReceiveModel");
const PreOrderHarvestBatchModel = require("../models/PreOrderHarvestBatchModel");
const PreOrderAllocationModel = require("../models/PreOrderAllocationModel");
const PreOrderModel = require("../models/PreOrderModel");
const FruitTypeModel = require("../models/FruitTypeModel");
const HarvestBatchModel = require("../models/HarvestBatchModel");
const PreOrderService = require("./PreOrderService");

/** Statuses that count toward demand. */
const DEMAND_STATUSES = ["WAITING_FOR_ALLOCATION", "WAITING_FOR_NEXT_BATCH", "ALLOCATED_WAITING_PAYMENT", "WAITING_FOR_PRODUCT"];
/** In-memory lock: prevent concurrent import for the same fruit type. */
const importingFruitIds = new Set();

/**
 * Get total demand (kg) for a fruit type from pre-orders in demand statuses.
 *
 * @param {string} fruitTypeId - Fruit type document ID
 * @returns {Promise<number>} Total demand in kg
 */
async function getDemandKgForFruitType(fruitTypeId) {
  const agg = await PreOrderModel.aggregate([
    { $match: { fruitTypeId: new mongoose.Types.ObjectId(fruitTypeId), status: { $in: DEMAND_STATUSES } } },
    { $group: { _id: null, demandKg: { $sum: "$quantityKg" } } },
  ]);
  return agg[0]?.demandKg ?? 0;
}

/**
 * Get allocated kg for a fruit type from PreOrderAllocation. Used to compute available = received - allocated.
 *
 * @param {string} fruitTypeId - Fruit type document ID
 * @returns {Promise<number>} Allocated kg
 */
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
 * FULL ORDER FULFILLMENT ONLY: import is allowed only when supplierAvailableQuantity equals
 * the quantity needed to fully fulfill N orders (FIFO). No partial fulfillment, no excess inventory.
 *
 * @param {Object} params - Input parameters
 * @param {string} params.fruitTypeId - Fruit type document ID
 * @param {number} params.supplierAvailableQuantity - Quantity (kg) supplier has available
 * @param {string} params.receivedBy - User ID of warehouse staff
 * @param {boolean} params.confirmed - Must be true (business confirmation)
 * @param {string} [params.note] - Optional note
 * @returns {Promise<{ status: string, data: Object, stock: Object, simulation?: Object }>}
 */
async function createReceive({ fruitTypeId, supplierAvailableQuantity, receivedBy, confirmed, note }) {
  if (confirmed !== true) throw new Error("Receive requires explicit confirmation (confirmed: true)");
  const ft = await FruitTypeModel.findById(fruitTypeId).lean();
  if (!ft) throw new Error("Fruit type not found");
  const fruitTypeIdStr = fruitTypeId.toString();
  const qty = Number(supplierAvailableQuantity);
  if (!Number.isFinite(qty) || qty < 0) {
    throw new Error("supplierAvailableQuantity must be a non-negative number");
  }

  if (importingFruitIds.has(fruitTypeIdStr)) {
    throw new Error("An import for this fruit type is already in progress. Please wait.");
  }
  importingFruitIds.add(fruitTypeIdStr);
  try {
    const simulation = await PreOrderService.simulatePreOrderImport(fruitTypeIdStr, qty);
    const {
      numberOfOrdersCanBeFulfilled,
      recommendedImportQuantity,
      excessQuantity,
    } = simulation;

    if (numberOfOrdersCanBeFulfilled === 0 && recommendedImportQuantity === 0) {
      const queue = await getFifoUnfulfilledOrders(fruitTypeId);
      if (queue.length === 0) {
        throw new Error("No remaining pre-orders. Import is not allowed.");
      }
      throw new Error(
        "Import quantity will generate excess inventory. Please import the recommended quantity. (Recommended: 0 kg – supplier quantity is less than the smallest remaining order.)"
      );
    }
    if (qty > recommendedImportQuantity) {
      throw new Error(
        "Import quantity will generate excess inventory. Please import the recommended quantity."
      );
    }
    if (qty < recommendedImportQuantity) {
      throw new Error(
        `Import quantity is insufficient to fully fulfill the next order(s). Recommended quantity: ${recommendedImportQuantity} kg.`
      );
    }

    const ftObjId = new mongoose.Types.ObjectId(fruitTypeIdStr);
    const session = await mongoose.startSession();
    session.startTransaction();
    let createdReceive;
    try {
      const [receiveDoc] = await PreOrderReceiveModel.create(
        [
          {
            fruitTypeId: ftObjId,
            quantityKg: recommendedImportQuantity,
            receivedBy,
            note: (note || "").toString().trim(),
          },
        ],
        { session }
      );
      createdReceive = receiveDoc;
      await PreOrderStockModel.findOneAndUpdate(
        { fruitTypeId: ftObjId },
        { $inc: { receivedKg: recommendedImportQuantity } },
        { new: true, upsert: true, session }
      );
      await session.commitTransaction();
    } catch (err) {
      await session.abortTransaction();
      throw err;
    } finally {
      session.endSession();
    }

    return {
      status: "OK",
      data: createdReceive ? (createdReceive.toObject ? createdReceive.toObject() : createdReceive) : null,
      stock: await PreOrderStockModel.findOne({ fruitTypeId }).lean(),
      simulation: {
        supplierAvailableQuantity: qty,
        numberOfOrdersCanBeFulfilled,
        totalQuantityUsedForFulfillment: recommendedImportQuantity,
        recommendedImportQuantity,
        excessQuantity,
      },
    };
  } finally {
    importingFruitIds.delete(fruitTypeIdStr);
  }
}

/**
 * Get FIFO queue of unfulfilled pre-orders for a fruit type (order by createdAt ascending).
 * Used to mark exactly N orders as ALLOCATED_WAITING_PAYMENT after import.
 *
 * @param {mongoose.Types.ObjectId} fruitTypeIdObj - Fruit type ObjectId
 * @param {Object} [session] - Optional MongoDB session
 * @returns {Promise<Array<{ _id: ObjectId, quantityKg: number }>>}
 */
async function getFifoUnfulfilledOrders(fruitTypeIdObj, session = null) {
  const opts = session ? { session } : {};
  const nextBatch = await PreOrderModel.find({
    fruitTypeId: fruitTypeIdObj,
    status: "WAITING_FOR_NEXT_BATCH",
  })
    .sort({ createdAt: 1 })
    .select("_id quantityKg")
    .lean(opts);
  const waitingAlloc = await PreOrderModel.find({
    fruitTypeId: fruitTypeIdObj,
    status: { $in: ["WAITING_FOR_ALLOCATION", "WAITING_FOR_PRODUCT"] },
  })
    .sort({ createdAt: 1 })
    .select("_id quantityKg")
    .lean(opts);
  return [...nextBatch, ...waitingAlloc];
}

/**
 * Warehouse staff: receive pre-order stock by batch (PreOrderHarvestBatch).
 * Only records receipt (receive doc, batch receivedKg, pre-order stock receivedKg).
 * Allocation is a separate step done by Admin from the Demand/Allocation page.
 *
 * @param {Object} params - Input parameters
 * @param {string} params.preOrderHarvestBatchId - PreOrderHarvestBatch document ID
 * @param {number} params.quantityKg - Quantity (kg) being received (must be <= batch remaining)
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
  const fruitTypeId = batch.fruitTypeId?._id || batch.fruitTypeId;
  const fruitTypeIdStr = fruitTypeId.toString();

  const qty = Number(quantityKg);
  if (!Number.isFinite(qty) || qty <= 0) {
    throw new Error("Quantity (kg) must be greater than 0");
  }
  const planned = batch.quantityKg ?? 0;
  const batchReceived = batch.receivedKg ?? 0;
  const batchRemaining = Math.max(0, planned - batchReceived);
  if (qty > batchRemaining) {
    throw new Error(
      `Receive quantity (${qty} kg) exceeds batch remaining (${batchRemaining} kg). Planned: ${planned} kg, already received: ${batchReceived} kg.`
    );
  }

  if (importingFruitIds.has(fruitTypeIdStr)) {
    throw new Error("An import for this fruit type is already in progress. Please wait.");
  }
  importingFruitIds.add(fruitTypeIdStr);
  try {
    const session = await mongoose.startSession();
    session.startTransaction();
    let createdReceive;
    try {
      const [receiveDoc] = await PreOrderReceiveModel.create(
        [
          {
            preOrderHarvestBatchId: batch._id,
            fruitTypeId,
            quantityKg: qty,
            receivedBy,
            note: (note || "").toString().trim(),
          },
        ],
        { session }
      );
      createdReceive = receiveDoc;
      await PreOrderHarvestBatchModel.findByIdAndUpdate(
        preOrderHarvestBatchId,
        { $inc: { receivedKg: qty } },
        { session }
      );
      await PreOrderStockModel.findOneAndUpdate(
        { fruitTypeId },
        { $inc: { receivedKg: qty } },
        { new: true, upsert: true, session }
      );
      await session.commitTransaction();
    } catch (err) {
      await session.abortTransaction();
      throw err;
    } finally {
      session.endSession();
    }

    const updatedBatch = await PreOrderHarvestBatchModel.findById(preOrderHarvestBatchId).lean();
    if (updatedBatch?.harvestBatchId && mongoose.isValidObjectId(updatedBatch.harvestBatchId)) {
      const hb = await HarvestBatchModel.findById(updatedBatch.harvestBatchId).select("isPreOrderBatch").lean();
      if (hb && hb.isPreOrderBatch === true) {
        await HarvestBatchModel.findByIdAndUpdate(updatedBatch.harvestBatchId, {
          $set: {
            receivedQuantity: Math.round(updatedBatch.receivedKg ?? 0),
            visibleInReceipt: false,
          },
        });
      }
    }

    return {
      status: "OK",
      data: createdReceive ? (createdReceive.toObject ? createdReceive.toObject() : createdReceive) : null,
      batch: updatedBatch,
      stock: await PreOrderStockModel.findOne({ fruitTypeId }).lean(),
    };
  } finally {
    importingFruitIds.delete(fruitTypeIdStr);
  }
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
