const mongoose = require("mongoose");
const FruitTypeModel = require("../models/FruitTypeModel");
const PreOrderModel = require("../models/PreOrderModel");
const cloudinary = require("../config/cloudinaryConfig");

/** Pre-order statuses that count toward demand (no edit/delete when demand > 0). */
const PREORDER_DEMAND_STATUSES = ["WAITING_FOR_ALLOCATION", "WAITING_FOR_NEXT_BATCH", "ALLOCATED_WAITING_PAYMENT", "WAITING_FOR_PRODUCT"];

/** Statuses that mean "admin has run allocation" for this fruit type → ẩn khỏi /customer/pre-orders (chốt đơn sớm). */
const ALLOCATION_CLOSED_STATUSES = ["ALLOCATED_WAITING_PAYMENT", "READY_FOR_FULFILLMENT"];

/** Số ngày trước ngày thu hoạch: từ thời điểm này trở đi pre-order bị ẩn (chốt đơn). Đổi 3 → 5 hoặc 6 tùy nghiệp vụ. */
const DAYS_BEFORE_HARVEST_TO_LOCK = 3;

/**
 * Get pre-order demand (sum quantityKg) for a fruit type. Used to block edit/delete when demand > 0.
 * @param {string} fruitTypeId - Fruit type ObjectId
 * @returns {Promise<number>} demandKg
 */
const getPreOrderDemandKg = async (fruitTypeId) => {
  const agg = await PreOrderModel.aggregate([
    { $match: { fruitTypeId: new mongoose.Types.ObjectId(fruitTypeId), status: { $in: PREORDER_DEMAND_STATUSES } } },
    { $group: { _id: null, demandKg: { $sum: "$quantityKg" } } },
  ]);
  return agg[0]?.demandKg ?? 0;
};

/** Trước ngày thu hoạch DAYS_BEFORE_HARVEST_TO_LOCK ngày thì chốt đặt trước: không cho đặt loại trái đó nữa. */
function isPreOrderLockedByHarvest(estimatedHarvestDate) {
  if (!estimatedHarvestDate) return false;
  const harvest = new Date(estimatedHarvestDate);
  harvest.setHours(0, 0, 0, 0);
  const lockout = new Date(harvest);
  lockout.setDate(lockout.getDate() - DAYS_BEFORE_HARVEST_TO_LOCK);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today >= lockout;
}

/**
 * Fruit type IDs that are "closed by allocation": have at least one pre-order in ALLOCATED_WAITING_PAYMENT or READY_FOR_FULFILLMENT.
 * Used to hide those fruit types from /customer/pre-orders (admin chốt đơn sớm) even when harvest is still > 3 days away.
 * @returns {Promise<Set<string>>} Set of fruitTypeId strings
 */
async function getFruitTypeIdsClosedByAllocation() {
  const agg = await PreOrderModel.aggregate([
    { $match: { status: { $in: ALLOCATION_CLOSED_STATUSES } } },
    { $group: { _id: "$fruitTypeId" } },
  ]);
  return new Set(
    agg.filter((d) => d._id).map((d) => (d._id && d._id.toString ? d._id.toString() : String(d._id)))
  );
}

/**
 * Visibility for customer pre-order listing: visible = not locked by harvest AND not closed by allocation.
 * Backend decides; frontend renders only what backend returns.
 */
function isVisibleForPreOrderCustomer(ft, closedByAllocationIds) {
  if (isPreOrderLockedByHarvest(ft.estimatedHarvestDate)) return false;
  if (closedByAllocationIds && closedByAllocationIds.has((ft._id || ft).toString())) return false;
  return true;
}

/**
 * List fruit types available for pre-order (allowPreOrder = true, status = ACTIVE).
 * Visibility: ẩn khi (1) harvest trong vòng 3 ngày, HOẶC (2) admin đã chốt đơn (có pre-order ALLOCATED_WAITING_PAYMENT/READY_FOR_FULFILLMENT).
 * Backend quyết định visibility; chỉ trả về các item visible.
 */
const listAvailableForPreOrder = async (query = {}) => {
  const { page = 1, limit = 20, keyword } = query;
  const filter = { allowPreOrder: true, status: "ACTIVE" };
  if (keyword && String(keyword).trim()) {
    filter.name = { $regex: String(keyword).trim(), $options: "i" };
  }
  const [list, closedByAllocationIds] = await Promise.all([
    FruitTypeModel.find(filter).sort({ name: 1 }).lean(),
    getFruitTypeIdsClosedByAllocation(),
  ]);
  const filtered = list.filter((ft) => isVisibleForPreOrderCustomer(ft, closedByAllocationIds));
  const total = filtered.length;
  const limitNum = Math.max(1, Math.min(100, Number(limit) || 20));
  const pageNum = Math.max(1, Number(page) || 1);
  const data = filtered.slice((pageNum - 1) * limitNum, pageNum * limitNum);
  return {
    status: "OK",
    data,
    pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) },
  };
};

/**
 * Get one fruit type by id if available for pre-order (public).
 * Trả lỗi nếu: không tồn tại / không ACTIVE+allowPreOrder / chốt bởi harvest (<=3 ngày) / chốt bởi allocation (admin đã chạy allocation).
 */
const getAvailableById = async (id) => {
  const doc = await FruitTypeModel.findOne({
    _id: id,
    allowPreOrder: true,
    status: "ACTIVE",
  }).lean();
  if (!doc) throw new Error("Fruit type not found or not open for pre-order");
  if (isPreOrderLockedByHarvest(doc.estimatedHarvestDate)) {
    throw new Error(`Pre-order closed for this fruit: less than ${DAYS_BEFORE_HARVEST_TO_LOCK} days until harvest.`);
  }
  const closedIds = await getFruitTypeIdsClosedByAllocation();
  if (closedIds.has(doc._id.toString())) {
    throw new Error("Pre-order closed for this fruit: orders for this batch have already been allocated.");
  }
  if (doc.depositPercent == null) doc.depositPercent = 50;
  return { status: "OK", data: doc };
};

/**
 * Admin: list all fruit types with optional filter, search (keyword by name), sort.
 * Each item includes demandKg (pre-order demand for this fruit type). When demandKg > 0, edit/delete are not allowed.
 */
const listAdmin = async (query = {}) => {
  const { status, allowPreOrder, page = 1, limit = 20, keyword, sortBy = "createdAt", sortOrder = "desc" } = query;
  const filter = {};
  if (status) filter.status = status;
  if (allowPreOrder !== undefined) filter.allowPreOrder = allowPreOrder === "true" || allowPreOrder === true;
  if (keyword && String(keyword).trim()) {
    filter.name = { $regex: String(keyword).trim(), $options: "i" };
  }
  const sortField = ["name", "estimatedPrice", "createdAt"].includes(sortBy) ? sortBy : "createdAt";
  const sortOpt = { [sortField]: sortOrder === "asc" ? 1 : -1 };

  const limitNum = Math.max(1, Math.min(100, Number(limit) || 20));
  const pageNum = Math.max(1, Number(page) || 1);
  const [data, total, demandAgg] = await Promise.all([
    FruitTypeModel.find(filter).sort(sortOpt).skip((pageNum - 1) * limitNum).limit(limitNum).lean(),
    FruitTypeModel.countDocuments(filter),
    PreOrderModel.aggregate([
      { $match: { status: { $in: PREORDER_DEMAND_STATUSES } } },
      { $group: { _id: "$fruitTypeId", demandKg: { $sum: "$quantityKg" } } },
    ]),
  ]);
  const demandMap = Object.fromEntries((demandAgg || []).map((d) => [d._id.toString(), d.demandKg ?? 0]));
  const dataWithDemand = data.map((item) => ({
    ...item,
    demandKg: demandMap[item._id.toString()] ?? 0,
  }));
  return {
    status: "OK",
    data: dataWithDemand,
    pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) },
  };
};

/**
 * Admin: get one by id.
 */
const getById = async (id) => {
  const doc = await FruitTypeModel.findById(id).lean();
  if (!doc) throw new Error("Fruit type not found");
  return { status: "OK", data: doc };
};

/**
 * Admin: create fruit type.
 */
const create = async (payload) => {
  const {
    name,
    description = "",
    estimatedPrice,
    minOrderKg,
    maxOrderKg,
    estimatedHarvestDate,
    allowPreOrder = true,
    status = "ACTIVE",
    image,
    imagePublicId,
  } = payload;

  if (name == null || String(name).trim() === "") {
    throw new Error("Fruit name cannot be empty");
  }
  if (estimatedPrice == null || estimatedPrice === "") {
    throw new Error("Estimated price is required");
  }
  if (minOrderKg == null || minOrderKg === "") {
    throw new Error("Min order (kg) is required");
  }
  if (maxOrderKg == null || maxOrderKg === "") {
    throw new Error("Max order (kg) is required");
  }
  const minKg = Number(minOrderKg);
  const maxKg = Number(maxOrderKg);
  if (Number.isNaN(minKg) || Number.isNaN(maxKg)) {
    throw new Error("Min order and max order must be valid numbers");
  }
  if (minKg > maxKg) {
    throw new Error("Min order (kg) cannot be greater than max order (kg)");
  }
  const priceNum = Number(estimatedPrice);
  if (Number.isNaN(priceNum) || priceNum < 0) {
    throw new Error("Estimated price must be a valid number greater than or equal to 0");
  }

  const nameTrimmed = String(name).trim();
  const harvestDay = estimatedHarvestDate ? new Date(estimatedHarvestDate).toISOString().slice(0, 10) : null;
  const harvestStart = harvestDay ? new Date(harvestDay + "T00:00:00.000Z") : null;
  const harvestEnd = harvestDay ? new Date(new Date(harvestDay + "T00:00:00.000Z").getTime() + 86400000) : null;
  const duplicateFilter = {
    status: "ACTIVE",
    name: { $regex: new RegExp(`^${nameTrimmed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") },
  };
  if (harvestStart && harvestEnd) {
    duplicateFilter.estimatedHarvestDate = { $gte: harvestStart, $lt: harvestEnd };
  } else {
    duplicateFilter.$or = [{ estimatedHarvestDate: null }, { estimatedHarvestDate: { $exists: false } }];
  }
  const existing = await FruitTypeModel.findOne(duplicateFilter).lean();
  if (existing) {
    throw new Error("Fruit type already exists for this harvest.");
  }

  const doc = await FruitTypeModel.create({
    name: name.trim(),
    description: (description || "").trim(),
    estimatedPrice: Number(estimatedPrice),
    minOrderKg: minKg,
    maxOrderKg: maxKg,
    estimatedHarvestDate: estimatedHarvestDate ? new Date(estimatedHarvestDate) : null,
    allowPreOrder: !!allowPreOrder,
    status: status === "INACTIVE" ? "INACTIVE" : "ACTIVE",
    image: image && String(image).trim() ? String(image).trim() : null,
    imagePublicId: imagePublicId && String(imagePublicId).trim() ? String(imagePublicId).trim() : null,
  });
  return { status: "OK", data: doc };
};

/**
 * Admin: update fruit type. Allowed only when pre-order demand for this fruit type is 0.
 */
const update = async (id, payload) => {
  const doc = await FruitTypeModel.findById(id);
  if (!doc) throw new Error("Fruit type not found");

  const demandKg = await getPreOrderDemandKg(id);
  if (demandKg > 0) {
    throw new Error("Cannot edit fruit type when there is pre-order demand. Demand must be 0 to edit.");
  }

  const {
    name,
    description,
    estimatedPrice,
    minOrderKg,
    maxOrderKg,
    estimatedHarvestDate,
    allowPreOrder,
    status,
    image,
    imagePublicId,
    removeImage,
  } = payload;

  const shouldRemoveImage = removeImage === true || removeImage === "true";
  if (shouldRemoveImage && doc.imagePublicId) {
    cloudinary.uploader.destroy(doc.imagePublicId).catch((e) =>
      console.warn("Không thể xóa ảnh FruitType trên Cloudinary:", e.message)
    );
    doc.image = null;
    doc.imagePublicId = null;
  }
  if (name !== undefined) doc.name = name.trim();
  if (description !== undefined) doc.description = description.trim();
  if (estimatedPrice !== undefined) doc.estimatedPrice = Number(estimatedPrice);
  if (minOrderKg !== undefined) doc.minOrderKg = Number(minOrderKg);
  if (maxOrderKg !== undefined) doc.maxOrderKg = Number(maxOrderKg);
  if (estimatedHarvestDate !== undefined) doc.estimatedHarvestDate = estimatedHarvestDate ? new Date(estimatedHarvestDate) : null;
  if (allowPreOrder !== undefined) doc.allowPreOrder = !!allowPreOrder;
  if (status !== undefined) doc.status = status === "INACTIVE" ? "INACTIVE" : "ACTIVE";
  if (image !== undefined) doc.image = image && String(image).trim() ? String(image).trim() : null;
  if (imagePublicId !== undefined) doc.imagePublicId = imagePublicId && String(imagePublicId).trim() ? String(imagePublicId).trim() : null;

  const minKg = Number(doc.minOrderKg);
  const maxKg = Number(doc.maxOrderKg);
  if (!Number.isNaN(minKg) && !Number.isNaN(maxKg) && minKg > maxKg) {
    throw new Error("Min order (kg) cannot be greater than max order (kg)");
  }
  await doc.save();
  return { status: "OK", data: doc };
};

/**
 * Admin: delete fruit type. Allowed only when pre-order demand for this fruit type is 0.
 */
const remove = async (id) => {
  const doc = await FruitTypeModel.findById(id);
  if (!doc) throw new Error("Fruit type not found");

  const demandKg = await getPreOrderDemandKg(id);
  if (demandKg > 0) {
    throw new Error("Cannot delete fruit type when there is pre-order demand. Demand must be 0 to delete.");
  }

  if (doc.imagePublicId) {
    cloudinary.uploader.destroy(doc.imagePublicId).catch((e) =>
      console.warn("FruitType image delete from Cloudinary failed:", e.message)
    );
  }
  await FruitTypeModel.findByIdAndDelete(id);
  return { status: "OK", message: "Fruit type deleted" };
};

module.exports = {
  listAvailableForPreOrder,
  getAvailableById,
  isPreOrderLockedByHarvest,
  DAYS_BEFORE_HARVEST_TO_LOCK,
  listAdmin,
  getById,
  create,
  update,
  remove,
  getPreOrderDemandKg,
};
