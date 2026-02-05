const mongoose = require("mongoose");
const FruitBasketModel = require("../models/FruitBasketModel");


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


const getFruitBaskets = async ({ page = 1, limit = 12, search = "", sortBy = "createdAt", sortOrder = "desc" } = {}) => {
  try {
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit) || 12));
    const skip = (pageNum - 1) * limitNum;


    const query = { status: true };
    if (search) query.name = { $regex: search, $options: "i" };


    const allowedSortFields = ["name", "createdAt", "updatedAt"];
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
      message: "Fetched fruit basket list successfully",
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
      return { status: "ERR", message: "Invalid fruit basket ID" };
    }


    const basket = await FruitBasketModel.findById(id).populate({
      path: "items.product",
      select: "name price status stockStatus onHandQuantity images",
    });


    if (!basket || basket.status === false) {
      return { status: "ERR", message: "Fruit basket does not exist" };
    }


    return {
      status: "OK",
      message: "Fetched fruit basket successfully",
      data: buildBasketResponse(basket),
    };
  } catch (error) {
    return { status: "ERR", message: error.message };
  }
};


module.exports = {
  getFruitBaskets,
  getFruitBasketById,
};
