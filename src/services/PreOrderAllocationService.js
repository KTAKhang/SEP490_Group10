/**
 * Pre-order Allocation Service
 *
 * Business logic for admin allocation of pre-order stock: demand by fruit type (from PreOrder + PreOrderStock),
 * upsert allocation (one-time per fruit type when fully received), list allocations. Does not use Product model.
 *
 * Flow: Warehouse receives stock at Pre-order Stock → Admin runs allocation (upsertAllocation) when receivedKg >= demand
 * → Allocation is one-time only; then fruit type is set INACTIVE. triggerReadyAndNotifyForFruitType sends email/FCM.
 */

const mongoose = require("mongoose");
const PreOrderModel = require("../models/PreOrderModel");
const PreOrderAllocationModel = require("../models/PreOrderAllocationModel");
const PreOrderStockModel = require("../models/PreOrderStockModel");
const FruitTypeModel = require("../models/FruitTypeModel");
const { triggerReadyAndNotifyForFruitType } = require("./preorderFulfillmentLogic");

const CANCEL_WINDOW_HOURS = 24;
/** Optional: only count pre-orders created before this many hours ago (0 = no cutoff). */
const DEMAND_CUTOFF_HOURS = 0;

/**
 * Demand dashboard: aggregate demand (quantityKg) by fruit type from pre-orders (status WAITING_FOR_PRODUCT or READY_FOR_FULFILLMENT),
 * join with PreOrderAllocation (allocatedKg) and PreOrderStock (receivedKg). Optionally filter by keyword (fruit type name) and paginate.
 *
 * Flow:
 * 1. Aggregate PreOrder: match status in [WAITING_FOR_PRODUCT, READY_FOR_FULFILLMENT], optional createdAt cutoff; group by fruitTypeId, sum quantityKg, count
 * 2. Load allocations and stocks for those fruitTypeIds; build allocMap (fruitTypeId -> total allocatedKg) and stockMap (fruitTypeId -> receivedKg)
 * 3. Load FruitType for names; build result rows: demandKg, orderCount, allocatedKg, receivedKgFromPreOrderStock, remainingKg, fullyReceived
 * 4. Optional keyword filter (fruit type name); paginate (slice) and return data + pagination
 *
 * @param {Object} [query={}] - Optional page, limit, keyword
 * @param {number} [query.page=1] - Page number
 * @param {number} [query.limit=20] - Items per page
 * @param {string} [query.keyword] - Filter by fruit type name (case-insensitive substring)
 * @returns {Promise<{ status: string, data: Array, pagination: Object }>}
 */
const getDemandByFruitType = async (query = {}) => {
  const { page = 1, limit = 20, keyword } = query;
  const match = { status: { $in: ["WAITING_FOR_PRODUCT", "READY_FOR_FULFILLMENT"] } };
  if (DEMAND_CUTOFF_HOURS > 0) {
    const cutoff = new Date(Date.now() - DEMAND_CUTOFF_HOURS * 60 * 60 * 1000);
    match.createdAt = { $lte: cutoff };
  }
  const demandAgg = await PreOrderModel.aggregate([
    { $match: match },
    { $group: { _id: "$fruitTypeId", demandKg: { $sum: "$quantityKg" }, count: { $sum: 1 } } },
  ]);

  const fruitTypeIds = demandAgg.map((d) => d._id);
  const [allocations, stocks] = await Promise.all([
    PreOrderAllocationModel.find({ fruitTypeId: { $in: fruitTypeIds } }).lean(),
    PreOrderStockModel.find({ fruitTypeId: { $in: fruitTypeIds } }).lean(),
  ]);

  const allocMap = {};
  for (const a of allocations) {
    const fid = a.fruitTypeId.toString();
    allocMap[fid] = (allocMap[fid] || 0) + (a.allocatedKg || 0);
  }
  const stockMap = Object.fromEntries(stocks.map((s) => [s.fruitTypeId.toString(), s.receivedKg ?? 0]));

  const fruitTypes = await FruitTypeModel.find({ _id: { $in: fruitTypeIds } }).lean();
  const fruitMap = Object.fromEntries(fruitTypes.map((f) => [f._id.toString(), f]));

  let result = demandAgg.map((d) => {
    const fid = d._id.toString();
    const ft = fruitMap[fid];
    const allocatedKg = allocMap[fid] || 0;
    const receivedKg = stockMap[fid] ?? 0;
    const remaining = Math.max(0, d.demandKg - allocatedKg);
    const fullyReceived = receivedKg >= (d.demandKg || 0);
    return {
      fruitTypeId: d._id,
      fruitTypeName: ft?.name,
      demandKg: d.demandKg,
      orderCount: d.count,
      allocatedKg,
      remainingKg: remaining,
      receivedKgFromPreOrderStock: receivedKg,
      fullyReceived,
    };
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
 * Admin: allocate pre-order stock for a fruit type. Allowed only when PreOrderStock receivedKg >= demand (fully received).
 * Allocation is one-time only per fruit type (allocatedKg = receivedKg). After allocation, fruit type is set INACTIVE.
 * Triggers email and FCM to customers (triggerReadyAndNotifyForFruitType).
 *
 * Flow:
 * 1. Load fruit type; load PreOrderStock for fruitTypeId (receivedKg)
 * 2. Aggregate demand: sum(quantityKg) for pre-orders with status WAITING_FOR_PRODUCT or READY_FOR_FULFILLMENT
 * 3. Validate: receivedKg > 0, receivedKg >= demandKg; no existing allocation with allocatedKg > 0
 * 4. Delete any existing allocation rows for fruitTypeId; create new allocation with allocatedKg = receivedKg
 * 5. Call triggerReadyAndNotifyForFruitType (email + FCM); on error log and continue
 * 6. Set fruit type status to INACTIVE
 *
 * @param {Object} params - Input parameters
 * @param {string} params.fruitTypeId - Fruit type document ID
 * @param {number} [params.allocatedKg] - Ignored; allocation amount is set to receivedKg
 * @returns {Promise<{ status: string, data: Object }>}
 */
const upsertAllocation = async ({ fruitTypeId, allocatedKg }) => {
  const ft = await FruitTypeModel.findById(fruitTypeId);
  if (!ft) throw new Error("Fruit type not found");

  const stock = await PreOrderStockModel.findOne({ fruitTypeId }).lean();
  const receivedKg = stock?.receivedKg ?? 0;
  if (receivedKg <= 0) {
    throw new Error("Pre-order stock has no quantity. Warehouse staff must receive at Pre-order Stock.");
  }

  const demandAgg = await PreOrderModel.aggregate([
    { $match: { fruitTypeId: ft._id, status: { $in: ["WAITING_FOR_PRODUCT", "READY_FOR_FULFILLMENT"] } } },
    { $group: { _id: null, demandKg: { $sum: "$quantityKg" } } },
  ]);
  const demandKg = demandAgg[0]?.demandKg ?? 0;
  if (receivedKg < demandKg) {
    throw new Error(
      `Allocation only when fully received. Received ${receivedKg} kg, demand ${demandKg} kg. Warehouse must receive more at Pre-order Stock.`
    );
  }

  const existing = await PreOrderAllocationModel.findOne({ fruitTypeId }).lean();
  if (existing && (existing.allocatedKg ?? 0) > 0) {
    throw new Error(
      "Allocation for this fruit type is done once only. Already allocated, cannot change."
    );
  }

  const kg = receivedKg;

  await PreOrderAllocationModel.deleteMany({ fruitTypeId });
  const doc = await PreOrderAllocationModel.create({ fruitTypeId, allocatedKg: kg });

  try {
    await triggerReadyAndNotifyForFruitType(fruitTypeId.toString());
  } catch (e) {
    console.warn("PreOrder triggerReadyAfterAllocation:", e.message);
  }

  await FruitTypeModel.findByIdAndUpdate(fruitTypeId, { status: "INACTIVE" });

  return { status: "OK", data: doc };
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
