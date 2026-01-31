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
 */
const listAvailableForPreOrder = async () => {
  const list = await FruitTypeModel.find({
    allowPreOrder: true,
    status: "ACTIVE",
  })
    .sort({ name: 1 })
    .lean();
  const filtered = list.filter((ft) => !isPreOrderLockedByHarvest(ft.estimatedHarvestDate));
  return { status: "OK", data: filtered };
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
  if (!doc) throw new Error("Không tìm thấy loại trái cây hoặc không mở đặt trước");
  if (isPreOrderLockedByHarvest(doc.estimatedHarvestDate)) {
    throw new Error("Đã chốt đặt trước loại trái này: còn dưới 3 ngày đến ngày thu hoạch.");
  }
  if (doc.depositPercent == null) doc.depositPercent = 50;
  return { status: "OK", data: doc };
};

/**
 * Admin: list all fruit types with optional filter.
 */
const listAdmin = async (query = {}) => {
  const { status, allowPreOrder, page = 1, limit = 20 } = query;
  const filter = {};
  if (status) filter.status = status;
  if (allowPreOrder !== undefined) filter.allowPreOrder = allowPreOrder === "true" || allowPreOrder === true;

  const [data, total] = await Promise.all([
    FruitTypeModel.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(Number(limit)).lean(),
    FruitTypeModel.countDocuments(filter),
  ]);
  return {
    status: "OK",
    data,
    pagination: { page: Number(page), limit: Number(limit), total, totalPages: Math.ceil(total / limit) },
  };
};

/**
 * Admin: get one by id.
 */
const getById = async (id) => {
  const doc = await FruitTypeModel.findById(id).lean();
  if (!doc) throw new Error("Không tìm thấy loại trái cây");
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

  if (!name || estimatedPrice == null || minOrderKg == null || maxOrderKg == null) {
    throw new Error("Thiếu name, estimatedPrice, minOrderKg hoặc maxOrderKg");
  }
  const minKg = Number(minOrderKg);
  const maxKg = Number(maxOrderKg);
  if (Number.isNaN(minKg) || Number.isNaN(maxKg)) {
    throw new Error("minOrderKg và maxOrderKg phải là số");
  }
  if (minKg > maxKg) {
    throw new Error("minOrderKg không được lớn hơn maxOrderKg");
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
  if (!doc) throw new Error("Không tìm thấy loại trái cây");

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
    throw new Error("minOrderKg không được lớn hơn maxOrderKg");
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
