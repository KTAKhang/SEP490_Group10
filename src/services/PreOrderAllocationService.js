/**
 * Pre-order Allocation Service
 *
 * Business logic for pre-order demand and FIFO allocation.
 *
 * This service handles:
 * - Demand dashboard: aggregate demand by fruit type (WAITING_FOR_ALLOCATION, WAITING_FOR_NEXT_BATCH, ALLOCATED_WAITING_PAYMENT)
 * - Run allocation: FIFO by createdAt (WAITING_FOR_NEXT_BATCH first, then WAITING_FOR_ALLOCATION); no partial allocation
 * - List allocation records by fruit type
 *
 * Demand = sum(quantityKg) of pre-orders in demand statuses. READY_FOR_FULFILLMENT and COMPLETED are not counted.
 *
 * @module services/PreOrderAllocationService
 */

const mongoose = require("mongoose");
const PreOrderModel = require("../models/PreOrderModel");
const PreOrderAllocationModel = require("../models/PreOrderAllocationModel");
const PreOrderStockModel = require("../models/PreOrderStockModel");
const FruitTypeModel = require("../models/FruitTypeModel");
const { triggerReadyAndNotifyForFruitType, notifyPreOrderDelayed } = require("./preorderFulfillmentLogic");

/** Statuses that count toward demand (still needing stock or waiting for remaining payment). */
const DEMAND_STATUSES = ["WAITING_FOR_ALLOCATION", "WAITING_FOR_NEXT_BATCH", "ALLOCATED_WAITING_PAYMENT", "WAITING_FOR_PRODUCT"];
/** Statuses that count as already allocated (no longer in demand). */
const ALLOCATED_STATUSES = ["ALLOCATED_WAITING_PAYMENT", "READY_FOR_FULFILLMENT", "COMPLETED"];

/** In-memory lock: prevent parallel allocation for the same fruit type (reject duplicate concurrent requests). */
const allocatingFruitIds = new Set();

/**
 * Demand dashboard: aggregate demand by fruit type from pre-orders with status in DEMAND_STATUSES.
 * allocatedKg = sum(quantityKg) of orders with status in ALLOCATED_STATUSES (computed from PreOrder).
 *
 * @param {Object} [query={}] - Optional page, limit, keyword
 * @returns {Promise<{ status: string, data: Array, pagination: Object }>}
 */
const getDemandByFruitType = async (query = {}) => {
  const { page = 1, limit = 20, keyword } = query;
  const demandMatch = { status: { $in: DEMAND_STATUSES } };
  const [demandAgg, stocks] = await Promise.all([
    PreOrderModel.aggregate([
      { $match: demandMatch },
      { $group: { _id: "$fruitTypeId", demandKg: { $sum: "$quantityKg" }, count: { $sum: 1 } } },
    ]),
    PreOrderStockModel.find({}).select("fruitTypeId receivedKg").lean(),
  ]);

  const demandFruitIds = new Set(demandAgg.map((d) => (d._id || d._id?.toString()).toString()));
  stocks.forEach((s) => {
    if (s.fruitTypeId) demandFruitIds.add((s.fruitTypeId._id || s.fruitTypeId).toString());
  });
  const fruitTypeIds = [...demandFruitIds].map((id) => new mongoose.Types.ObjectId(id));

  const [allocAgg, fruitTypes] = await Promise.all([
    PreOrderModel.aggregate([
      { $match: { fruitTypeId: { $in: fruitTypeIds }, status: { $in: ALLOCATED_STATUSES } } },
      { $group: { _id: "$fruitTypeId", allocatedKg: { $sum: "$quantityKg" } } },
    ]),
    FruitTypeModel.find({ _id: { $in: fruitTypeIds } }).lean(),
  ]);

  const allocMap = Object.fromEntries(allocAgg.map((a) => [a._id.toString(), a.allocatedKg ?? 0]));
  const stockMap = Object.fromEntries(
    stocks.map((s) => {
      const fid = (s.fruitTypeId?._id || s.fruitTypeId).toString();
      return [fid, s.receivedKg ?? 0];
    })
  );
  const demandMap = Object.fromEntries(
    demandAgg.map((d) => [d._id.toString(), { demandKg: d.demandKg ?? 0, count: d.count ?? 0 }])
  );
  const fruitMap = Object.fromEntries(fruitTypes.map((f) => [f._id.toString(), f]));

  let result = fruitTypeIds.map((id) => {
    const fid = id.toString();
    const ft = fruitMap[fid];
    const demandInfo = demandMap[fid] || { demandKg: 0, count: 0 };
    const demandKg = demandInfo.demandKg;
    const orderCount = demandInfo.count;
    const allocatedKg = allocMap[fid] || 0;
    const receivedKg = stockMap[fid] ?? 0;
    const remaining = Math.max(0, demandKg - allocatedKg);
    const fullyReceived = demandKg > 0 ? receivedKg >= demandKg : true;
    return {
      fruitTypeId: id,
      fruitTypeName: ft?.name,
      demandKg,
      orderCount,
      allocatedKg,
      remainingKg: remaining,
      receivedKgFromPreOrderStock: receivedKg,
      fullyReceived,
    };
  });

  result.sort((a, b) => {
    if (a.demandKg > 0 && b.demandKg === 0) return -1;
    if (a.demandKg === 0 && b.demandKg > 0) return 1;
    return (a.fruitTypeName || "").localeCompare(b.fruitTypeName || "");
  });
  if (keyword && String(keyword).trim()) {
    const k = String(keyword).trim().toLowerCase();
    result = result.filter((r) => (r.fruitTypeName || "").toLowerCase().includes(k));
  }
  const total = result.length;
  const limitNum = Math.max(1, Math.min(100, Number(limit) || 20));
  const pageNum = Math.max(1, Number(page) || 1);
  const data = result.slice((pageNum - 1) * limitNum, pageNum * limitNum);
  return {
    status: "OK",
    data,
    pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) },
  };
};

/**
 * Admin: run FIFO allocation for a fruit type. Iterates PreOrders in order: WAITING_FOR_NEXT_BATCH first (by createdAt),
 * then WAITING_FOR_ALLOCATION. Allocates only when remaining stock >= order.quantityKg; no partial allocation.
 * If insufficient for current order: set WAITING_FOR_ALLOCATION → WAITING_FOR_NEXT_BATCH and stop.
 *
 * Flow:
 * 1. Load fruit type and PreOrderStock (receivedKg)
 * 2. allocatedSoFar = sum(quantityKg) of PreOrders with status in ALLOCATED_STATUSES for this fruit type
 * 3. available = receivedKg - allocatedSoFar
 * 4. Load orders: WAITING_FOR_NEXT_BATCH first (createdAt asc), then WAITING_FOR_ALLOCATION (createdAt asc)
 * 5. For each: if available >= order.quantityKg → set ALLOCATED_WAITING_PAYMENT, available -= quantityKg; else set WAITING_FOR_NEXT_BATCH (if was WAITING_FOR_ALLOCATION) and break
 * 6. Upsert PreOrderAllocationModel.allocatedKg = new total; triggerReadyAndNotifyForFruitType
 *
 * @param {Object} params - Input parameters
 * @param {string} params.fruitTypeId - Fruit type document ID
 * @param {number} [params.allocatedKg] - Ignored
 * @returns {Promise<{ status: string, data: Object }>}
 */
const upsertAllocation = async ({ fruitTypeId, allocatedKg: _ignored }) => {
  const fid = String(fruitTypeId);
  if (allocatingFruitIds.has(fid)) {
    throw new Error("Allocation for this fruit type is already in progress. Please wait.");
  }
  allocatingFruitIds.add(fid);
  try {
  const ft = await FruitTypeModel.findById(fruitTypeId);
  if (!ft) throw new Error("Fruit type not found");

  const stock = await PreOrderStockModel.findOne({ fruitTypeId }).lean();
  const receivedKg = stock?.receivedKg ?? 0;
  if (receivedKg <= 0) {
    throw new Error("Pre-order stock has no quantity. Warehouse staff must receive at Pre-order Stock.");
  }

  const ftObjId = new mongoose.Types.ObjectId(fruitTypeId);
  const allocatedAgg = await PreOrderModel.aggregate([
    { $match: { fruitTypeId: ftObjId, status: { $in: ALLOCATED_STATUSES } } },
    { $group: { _id: null, allocatedKg: { $sum: "$quantityKg" } } },
  ]);
  const allocatedSoFar = allocatedAgg[0]?.allocatedKg ?? 0;
  let available = receivedKg - allocatedSoFar;
  if (available <= 0) {
    const demandAgg = await PreOrderModel.aggregate([
      { $match: { fruitTypeId: ftObjId, status: { $in: DEMAND_STATUSES } } },
      { $group: { _id: null, demandKg: { $sum: "$quantityKg" } } },
    ]);
    const demandKg = demandAgg[0]?.demandKg ?? 0;
    const remainingKg = Math.max(0, demandKg - allocatedSoFar);
    throw new Error(
      `Not enough stock to run allocation. Current: Demand ${demandKg} kg, Received ${receivedKg} kg, Allocated ${allocatedSoFar} kg, Remaining demand ${remainingKg} kg, Available to allocate 0 kg. Please receive more stock before running allocation.`
    );
  }

  const nextBatch = await PreOrderModel.find({
    fruitTypeId: ftObjId,
    status: "WAITING_FOR_NEXT_BATCH",
  })
    .sort({ createdAt: 1 })
    .lean();
  const waitingAlloc = await PreOrderModel.find({
    fruitTypeId: ftObjId,
    status: { $in: ["WAITING_FOR_ALLOCATION", "WAITING_FOR_PRODUCT"] },
  })
    .sort({ createdAt: 1 })
    .lean();
  const queue = [...nextBatch, ...waitingAlloc];
  let insufficientMessage = null; // when we break due to insufficient stock for next order

  for (const po of queue) {
    const qty = po.quantityKg ?? 0;
    if (qty <= 0) continue;
    const availableBeforeOrder = available;
    if (available >= qty) {
      await PreOrderModel.updateOne({ _id: po._id }, { $set: { status: "ALLOCATED_WAITING_PAYMENT" } });
      available -= qty;
    } else {
      // Allocation failed for this order due to insufficient stock: set WAITING_FOR_NEXT_BATCH and notify customer.
      insufficientMessage = `Allocation has been run but there is not enough stock to allocate for the next order: need ${qty} kg, available ${availableBeforeOrder} kg. Please receive more stock.`;
      // Notify is triggered HERE only (not on createBatch/createReceive/cron): this is the exact moment we transition
      // from WAITING_FOR_ALLOCATION/WAITING_FOR_PRODUCT → WAITING_FOR_NEXT_BATCH due to allocation attempt.
      if (po.status === "WAITING_FOR_ALLOCATION" || po.status === "WAITING_FOR_PRODUCT") {
        await PreOrderModel.updateOne({ _id: po._id }, { $set: { status: "WAITING_FOR_NEXT_BATCH" } });
        try {
          await notifyPreOrderDelayed(po);
        } catch (e) {
          console.warn("PreOrder delayed notify skip:", e.message);
        }
      }
      break;
    }
  }

  const newAllocAgg = await PreOrderModel.aggregate([
    { $match: { fruitTypeId: ftObjId, status: { $in: ALLOCATED_STATUSES } } },
    { $group: { _id: null, allocatedKg: { $sum: "$quantityKg" } } },
  ]);
  const newAllocatedKg = newAllocAgg[0]?.allocatedKg ?? 0;
  await PreOrderAllocationModel.findOneAndUpdate(
    { fruitTypeId },
    { $set: { allocatedKg: newAllocatedKg } },
    { new: true, upsert: true }
  );

  try {
    await triggerReadyAndNotifyForFruitType(fruitTypeId.toString());
  } catch (e) {
    console.warn("PreOrder triggerReadyAfterAllocation:", e.message);
  }

  // When remaining demand = 0 (fully fulfilled), set fruit type to INACTIVE (admin chốt đơn, ẩn khỏi pre-order mới).
  const demandAgg = await PreOrderModel.aggregate([
    { $match: { fruitTypeId: ftObjId, status: { $in: DEMAND_STATUSES } } },
    { $group: { _id: null, demandKg: { $sum: "$quantityKg" } } },
  ]);
  const demandKg = demandAgg[0]?.demandKg ?? 0;
  const availableKg = Math.max(0, receivedKg - newAllocatedKg);
  const remainingDemandKg = Math.max(0, demandKg - availableKg);
  if (remainingDemandKg <= 0) {
    await FruitTypeModel.findByIdAndUpdate(fruitTypeId, { $set: { status: "INACTIVE" } });
  }

  const responseData = { allocatedKg: newAllocatedKg };
  if (insufficientMessage) responseData.message = insufficientMessage;
  return { status: "OK", data: responseData };
  } finally {
    allocatingFruitIds.delete(fid);
  }
};

/**
 * Admin: list allocation records, optionally filtered by fruit type. Used for demand/allocations UI.
 *
 * @param {string} [fruitTypeId] - Optional fruit type ID to filter by
 * @returns {Promise<{ status: string, data: Array }>} List of allocations with populated fruitTypeId (name)
 */
const listAllocations = async (fruitTypeId) => {
  const filter = fruitTypeId ? { fruitTypeId } : {};
  const list = await PreOrderAllocationModel.find(filter)
    .populate("fruitTypeId", "name")
    .lean();
  return { status: "OK", data: list };
};

module.exports = {
  getDemandByFruitType,
  upsertAllocation,
  listAllocations,
};
