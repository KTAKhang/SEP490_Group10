const mongoose = require("mongoose");
const PreOrderModel = require("../models/PreOrderModel");
const PreOrderAllocationModel = require("../models/PreOrderAllocationModel");
const PreOrderStockModel = require("../models/PreOrderStockModel");
const FruitTypeModel = require("../models/FruitTypeModel");
const { triggerReadyAndNotifyForFruitType } = require("./preorderFulfillmentLogic");

const CANCEL_WINDOW_HOURS = 24;
const DEMAND_CUTOFF_HOURS = 0;

/**
 * Demand dashboard: nhu cầu theo FruitType + receivedKg từ kho trả đơn (PreOrderStock), không dùng Product.
 */
const getDemandByFruitType = async () => {
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

  const result = demandAgg.map((d) => {
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

  return { status: "OK", data: result };
};

/**
 * Admin: phân bổ trả đơn từ kho trả đơn. Chỉ cho phép khi đã nhập đủ (Fully received).
 * Phân bổ cứng = toàn bộ khả dụng (receivedKg), trả một lần duy nhất; sau đó inactive loại trái (đã ngừng kinh doanh).
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

  // Phân bổ cứng = toàn bộ khả dụng (trả một lần xong luôn)
  const kg = receivedKg;

  await PreOrderAllocationModel.deleteMany({ fruitTypeId });
  const doc = await PreOrderAllocationModel.create({ fruitTypeId, allocatedKg: kg });

  try {
    await triggerReadyAndNotifyForFruitType(fruitTypeId.toString());
  } catch (e) {
    console.warn("PreOrder triggerReadyAfterAllocation:", e.message);
  }

  // Sau khi phân bổ xong: inactive loại trái (đã ngừng kinh doanh)
  await FruitTypeModel.findByIdAndUpdate(fruitTypeId, { status: "INACTIVE" });

  return { status: "OK", data: doc };
};

/**
 * Admin: danh sách allocation (theo fruitType).
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
