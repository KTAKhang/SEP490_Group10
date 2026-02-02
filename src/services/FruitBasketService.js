const mongoose = require("mongoose");
const FruitBasketModel = require("../models/FruitBasketModel");
const ProductModel = require("../models/ProductModel");

const coerceArray = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      return [];
    }
  }
  return [];
};

const buildBasketResponse = (basket) => {
  const data = basket?.toObject ? basket.toObject() : basket;
  const items = Array.isArray(data?.items) ? data.items : [];
  let totalPrice = 0;
  let isAvailable = items.length > 0;

  const mappedItems = items.map((item) => {
    const product = item?.product || null;
    const quantity = Number(item?.quantity || 0);
    const productPrice = product?.price || 0;
    const lineTotal = product ? productPrice * quantity : 0;
    totalPrice += lineTotal;

    const productAvailable =
      !!product &&
      product.status !== false &&
      product.stockStatus === "IN_STOCK" &&
      (product.onHandQuantity || 0) > 0;

    if (!productAvailable) {
      isAvailable = false;
    }

    return {
      ...item,
      product,
      lineTotal,
    };
  });

  const stockStatus = isAvailable ? "IN_STOCK" : "OUT_OF_STOCK";
  const featuredImage = Array.isArray(data?.images) && data.images.length > 0 ? data.images[0] : null;

  return {
    ...data,
    items: mappedItems,
    totalPrice,
    stockStatus,
    featuredImage,
  };
};

const validateItems = async (items = []) => {
  const list = Array.isArray(items) ? items : [];
  if (list.length === 0) {
    return { status: "ERR", message: "Giỏ trái cây phải có ít nhất 1 loại trái cây" };
  }
  if (list.length > 5) {
    return { status: "ERR", message: "Giỏ trái cây chỉ được tối đa 5 loại trái cây" };
  }

  const productIds = [];
  const productIdSet = new Set();
  const normalizedItems = [];

  for (const item of list) {
    const productId = item?.product || item?.productId;
    if (!productId || !mongoose.isValidObjectId(productId)) {
      return { status: "ERR", message: "productId không hợp lệ" };
    }
    const productIdStr = productId.toString();
    if (productIdSet.has(productIdStr)) {
      return { status: "ERR", message: "Không được chọn trùng sản phẩm trong giỏ trái cây" };
    }
    productIdSet.add(productIdStr);
    const productObjectId = new mongoose.Types.ObjectId(productId);
    productIds.push(productObjectId);

    const qty = Number(item?.quantity ?? 1);
    if (!Number.isInteger(qty) || qty < 1 || qty > 10) {
      return { status: "ERR", message: "Số lượng mỗi trái cây phải là số nguyên từ 1 đến 10" };
    }

    normalizedItems.push({
      product: productObjectId,
      quantity: qty,
    });
  }

  const products = await ProductModel.find({
    _id: { $in: productIds },
    status: true,
  }).select("name price status stockStatus onHandQuantity images");

  if (products.length !== productIds.length) {
    return { status: "ERR", message: "Một hoặc nhiều sản phẩm không tồn tại hoặc đã bị ẩn" };
  }

  return { status: "OK", productIds, normalizedItems };
};

const validateImages = (images, imagePublicIds) => {
  const imageArray = coerceArray(images);
  const imagePublicIdArray = coerceArray(imagePublicIds);

  if (imageArray.length > 10) {
    return { status: "ERR", message: "Số lượng ảnh không được vượt quá 10" };
  }
  if (imagePublicIdArray.length > 10) {
    return { status: "ERR", message: "Số lượng imagePublicIds không được vượt quá 10" };
  }
  if (imagePublicIdArray.length > 0 && imageArray.length !== imagePublicIdArray.length) {
    return { status: "ERR", message: "Số lượng images và imagePublicIds phải bằng nhau" };
  }

  return { status: "OK", imageArray, imagePublicIdArray };
};

const createFruitBasket = async (payload = {}) => {
  try {
    const { name, short_desc, detail_desc, items, images, imagePublicIds, status } = payload;

    if (!name || !name.toString().trim()) {
      return { status: "ERR", message: "Tên giỏ trái cây là bắt buộc" };
    }

    const normalizedName = name.toString().trim();
    const existing = await FruitBasketModel.findOne({
      name: { $regex: new RegExp(`^${normalizedName}$`, "i") },
    });
    if (existing) {
      return { status: "ERR", message: "Tên giỏ trái cây đã tồn tại" };
    }

    const itemCheck = await validateItems(items);
    if (itemCheck.status === "ERR") return itemCheck;

    const imageCheck = validateImages(images, imagePublicIds);
    if (imageCheck.status === "ERR") return imageCheck;

    const basket = new FruitBasketModel({
      name: normalizedName,
      short_desc: (short_desc ?? "").toString(),
      detail_desc: (detail_desc ?? "").toString(),
      items: itemCheck.normalizedItems,
      images: imageCheck.imageArray,
      imagePublicIds: imageCheck.imagePublicIdArray,
      status: status ?? true,
    });

    await basket.save();

    const populated = await FruitBasketModel.findById(basket._id).populate({
      path: "items.product",
      select: "name price status stockStatus onHandQuantity images",
    });

    return {
      status: "OK",
      message: "Tạo giỏ trái cây thành công",
      data: buildBasketResponse(populated),
    };
  } catch (error) {
    return { status: "ERR", message: error.message };
  }
};

const getFruitBaskets = async ({ page = 1, limit = 5, search = "", status, sortBy = "createdAt", sortOrder = "desc" } = {}) => {
  try {
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit) || 20));
    const skip = (pageNum - 1) * limitNum;

    const query = {};
    if (search) query.name = { $regex: search, $options: "i" };
    if (status !== undefined) query.status = status === "true" || status === true;

    const allowedSortFields = ["name", "createdAt", "updatedAt", "status"];
    const sortField = allowedSortFields.includes(sortBy) ? sortBy : "createdAt";
    const sortDirection = sortOrder === "asc" ? 1 : -1;
    const sortObj = { [sortField]: sortDirection };

    const [data, total] = await Promise.all([
      FruitBasketModel.find(query)
        .populate({
          path: "items.product",
          select: "name price status stockStatus onHandQuantity images",
        })
        .sort(sortObj)
        .skip(skip)
        .limit(limitNum)
        .lean(),
      FruitBasketModel.countDocuments(query),
    ]);

    const formatted = data.map((basket) => buildBasketResponse(basket));

    return {
      status: "OK",
      message: "Lấy danh sách giỏ trái cây thành công",
      data: formatted,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    };
  } catch (error) {
    return { status: "ERR", message: error.message };
  }
};

const getFruitBasketById = async (id) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return { status: "ERR", message: "ID giỏ trái cây không hợp lệ" };
    }

    const basket = await FruitBasketModel.findById(id).populate({
      path: "items.product",
      select: "name price status stockStatus onHandQuantity images",
    });

    if (!basket) return { status: "ERR", message: "Giỏ trái cây không tồn tại" };

    return {
      status: "OK",
      message: "Lấy giỏ trái cây thành công",
      data: buildBasketResponse(basket),
    };
  } catch (error) {
    return { status: "ERR", message: error.message };
  }
};

const updateFruitBasket = async (id, payload = {}) => {
  try {
    const basket = await FruitBasketModel.findById(id);
    if (!basket) return { status: "ERR", message: "Giỏ trái cây không tồn tại" };

    const allowed = ["name", "short_desc", "detail_desc", "items", "images", "imagePublicIds", "status"];
    for (const key of Object.keys(payload)) {
      if (!allowed.includes(key)) delete payload[key];
    }

    if (payload.name !== undefined) {
      const newName = (payload.name ?? "").toString().trim();
      if (!newName) return { status: "ERR", message: "Tên giỏ trái cây là bắt buộc" };

      const existing = await FruitBasketModel.findOne({
        _id: { $ne: id },
        name: { $regex: new RegExp(`^${newName}$`, "i") },
      });
      if (existing) return { status: "ERR", message: "Tên giỏ trái cây đã tồn tại" };
      basket.name = newName;
    }

    if (payload.short_desc !== undefined) basket.short_desc = (payload.short_desc ?? "").toString();
    if (payload.detail_desc !== undefined) basket.detail_desc = (payload.detail_desc ?? "").toString();

    if (payload.items !== undefined) {
      const itemCheck = await validateItems(payload.items);
      if (itemCheck.status === "ERR") return itemCheck;
      basket.items = itemCheck.normalizedItems;
    }

    if (payload.images !== undefined || payload.imagePublicIds !== undefined) {
      const imageCheck = validateImages(payload.images ?? basket.images, payload.imagePublicIds ?? basket.imagePublicIds);
      if (imageCheck.status === "ERR") return imageCheck;
      basket.images = imageCheck.imageArray;
      basket.imagePublicIds = imageCheck.imagePublicIdArray;
    }

    if (payload.status !== undefined) basket.status = payload.status;

    await basket.save();

    const populated = await FruitBasketModel.findById(basket._id).populate({
      path: "items.product",
      select: "name price status stockStatus onHandQuantity images",
    });

    return {
      status: "OK",
      message: "Cập nhật giỏ trái cây thành công",
      data: buildBasketResponse(populated),
    };
  } catch (error) {
    return { status: "ERR", message: error.message };
  }
};

const deleteFruitBasket = async (id) => {
  try {
    const basket = await FruitBasketModel.findById(id);
    if (!basket) return { status: "ERR", message: "Giỏ trái cây không tồn tại" };

    await FruitBasketModel.findByIdAndDelete(id);
    return { status: "OK", message: "Xóa giỏ trái cây thành công" };
  } catch (error) {
    return { status: "ERR", message: error.message };
  }
};

module.exports = {
  createFruitBasket,
  getFruitBaskets,
  getFruitBasketById,
  updateFruitBasket,
  deleteFruitBasket,
};
