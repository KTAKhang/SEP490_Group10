const FruitTypeModel = require("../models/FruitTypeModel");
const cloudinary = require("../config/cloudinaryConfig");

/** Trước ngày thu hoạch 3 ngày thì chốt đặt trước: không cho đặt loại trái đó nữa. */
function isPreOrderLockedByHarvest(estimatedHarvestDate) {
  if (!estimatedHarvestDate) return false;
  const harvest = new Date(estimatedHarvestDate);
  harvest.setHours(0, 0, 0, 0);
  const lockout = new Date(harvest);
  lockout.setDate(lockout.getDate() - 3);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today >= lockout;
}

/**
 * List fruit types available for pre-order (allowPreOrder = true, status = ACTIVE).
 * Loại trái có estimatedHarvestDate trong vòng 3 ngày tới bị chốt, không hiển thị.
 * Supports page, limit, keyword (search by name).
 */
const listAvailableForPreOrder = async (query = {}) => {
  const { page = 1, limit = 20, keyword } = query;
  const filter = { allowPreOrder: true, status: "ACTIVE" };
  if (keyword && String(keyword).trim()) {
    filter.name = { $regex: String(keyword).trim(), $options: "i" };
  }
  const list = await FruitTypeModel.find(filter).sort({ name: 1 }).lean();
  const filtered = list.filter((ft) => !isPreOrderLockedByHarvest(ft.estimatedHarvestDate));
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
 * Nếu đã vào giai đoạn chốt (trước thu hoạch 3 ngày) thì trả lỗi.
 */
const getAvailableById = async (id) => {
  const doc = await FruitTypeModel.findOne({
    _id: id,
    allowPreOrder: true,
    status: "ACTIVE",
  }).lean();
  if (!doc) throw new Error("Fruit type not found or not open for pre-order");
  if (isPreOrderLockedByHarvest(doc.estimatedHarvestDate)) {
    throw new Error("Pre-order closed for this fruit: less than 3 days until harvest.");
  }
  if (doc.depositPercent == null) doc.depositPercent = 50;
  return { status: "OK", data: doc };
};

/**
 * Admin: list all fruit types with optional filter, search (keyword by name), sort.
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
  const [data, total] = await Promise.all([
    FruitTypeModel.find(filter).sort(sortOpt).skip((pageNum - 1) * limitNum).limit(limitNum).lean(),
    FruitTypeModel.countDocuments(filter),
  ]);
  return {
    status: "OK",
    data,
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
 * Admin: update fruit type.
 */
const update = async (id, payload) => {
  const doc = await FruitTypeModel.findById(id);
  if (!doc) throw new Error("Fruit type not found");

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

module.exports = {
  listAvailableForPreOrder,
  getAvailableById,
  isPreOrderLockedByHarvest,
  listAdmin,
  getById,
  create,
  update,
};
