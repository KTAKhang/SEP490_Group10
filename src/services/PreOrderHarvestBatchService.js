const mongoose = require("mongoose");
const PreOrderHarvestBatchModel = require("../models/PreOrderHarvestBatchModel");
const HarvestBatchModel = require("../models/HarvestBatchModel");
const FruitTypeModel = require("../models/FruitTypeModel");
const SupplierModel = require("../models/SupplierModel");
const PreOrderModel = require("../models/PreOrderModel");

/**
 * Admin: tạo lô nhập hàng trả đơn.
 * - Mỗi loại trái chỉ được tạo một lô duy nhất.
 * - Số lượng nhập phải đúng bằng nhu cầu (demand).
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

  const existing = await PreOrderHarvestBatchModel.findOne({ fruitTypeId }).lean();
  if (existing) {
    throw new Error("This fruit type already has a pre-order receive batch. One batch per fruit type only.");
  }

  const demandAgg = await PreOrderModel.aggregate([
    { $match: { fruitTypeId: ft._id, status: { $in: ["WAITING_FOR_PRODUCT", "READY_FOR_FULFILLMENT"] } } },
    { $group: { _id: null, demandKg: { $sum: "$quantityKg" } } },
  ]);
  const demandKg = demandAgg[0]?.demandKg ?? 0;
  if (Math.abs(qty - demandKg) > 0.001) {
    throw new Error(`Quantity must equal demand (${demandKg} kg). Current: ${qty} kg.`);
  }

  let finalSupplierId, finalHarvestDate, finalBatchNumber, finalHarvestBatchId = null;

  if (harvestBatchId && mongoose.isValidObjectId(harvestBatchId)) {
    const hb = await HarvestBatchModel.findById(harvestBatchId)
      .populate("supplier", "name cooperationStatus")
      .lean();
    if (!hb) throw new Error("Harvest batch not found. Create at Harvest Batch Management.");
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
 * Danh sách lô nhập trả đơn – Planned/Received/status (NOT_RECEIVED | PARTIAL | FULLY_RECEIVED).
 * Admin + Warehouse dùng.
 */
async function listBatches(filters = {}) {
  const { fruitTypeId, supplierId, status } = filters;
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
  return { status: "OK", data };
}

/**
 * Chi tiết một lô (Admin / Warehouse).
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
