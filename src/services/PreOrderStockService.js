const mongoose = require("mongoose");
const PreOrderStockModel = require("../models/PreOrderStockModel");
const PreOrderReceiveModel = require("../models/PreOrderReceiveModel");
const PreOrderHarvestBatchModel = require("../models/PreOrderHarvestBatchModel");
const PreOrderAllocationModel = require("../models/PreOrderAllocationModel");
const FruitTypeModel = require("../models/FruitTypeModel");

/**
 * Danh sách kho trả đơn theo FruitType: receivedKg, allocatedKg, availableKg.
 * Warehouse staff + Admin xem.
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
 * Warehouse staff: nhập kho trả đơn – tạo PreOrderReceive và cộng PreOrderStock.receivedKg.
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
 * Warehouse staff: nhập kho trả đơn theo lô (PreOrderHarvestBatch).
 * Chỉ được nhập đủ một lần duy nhất, đúng bằng số kế hoạch (quantityKg của lô). Không chỉnh sửa sau.
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
 * Lịch sử nhập kho trả đơn (theo fruitType, preOrderHarvestBatchId hoặc tất cả).
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
 * Lấy receivedKg cho một fruitType (từ PreOrderStock).
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
