const mongoose = require("mongoose");
const StockLockModel = require("../models/StockLockModel");
const CartDetailModel = require("../models/CartDetailsModel");
const CartModel = require("../models/CartsModel");
const ProductModel = require("../models/ProductModel");
const { getEffectivePrice } = require("../utils/productPrice");
const HOLD_MINUTES = 15;
const COOLDOWN_MINUTES = 30;
const MAX_HOLD_PERCENT = 1;
const MAX_HOLD_PER_DAY = 3;


/**
 * HOLD STOCK for selected cart items
 */
const checkoutHold = async (
  user_id,
  selected_product_ids,
  checkout_session_id,
) => {
  const session = await mongoose.startSession();
  session.startTransaction();


  try {
    /* =======================
       0️⃣ LOAD CART
    ======================= */
    const cart = await CartModel.findOne({ user_id }).session(session);
    if (!cart) {
      throw new Error("Shopping cart not found");
    }
    const cartItems = await CartDetailModel.find({
      cart_id: cart._id,
      product_id: { $in: selected_product_ids },
    }).session(session);
    /* =======================
       LOOP ITEMS
    ======================= */
    for (const item of cartItems) {
      const product = await ProductModel.findById(item.product_id).session(
        session,
      );


      if (!product || !product.status)
        throw new Error(`Product ${product?.name || ""} is not available`);
      /* =======================
         1️⃣ CHECK KHO THỰC TẾ
      ======================= */
      if (product.onHandQuantity < item.quantity)
        throw new Error(`Not enough stock for ${product.name}`);
      /* =======================
         2️⃣ RESUME CHECKOUT CŨ
      ======================= */
      const existingLock = await StockLockModel.findOne({
        user_id,
        product_id: product._id,
        checkout_session_id,
        expiresAt: { $gt: new Date() },
      }).session(session);


      if (existingLock) continue;


      /* =======================
         3️⃣ CHECK COOLDOWN
      ======================= */
      const cooldown = await StockLockModel.findOne({
        user_id,
        product_id: product._id,
        cooldownUntil: { $gt: new Date() },
      }).session(session);


      if (cooldown)
        throw new Error(
          `You recently reserved ${product.name}, please try again later`,
        );


      /* =======================
         4️⃣ CHECK LIMIT / DAY
      ======================= */
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);


      const todayCount = await StockLockModel.countDocuments({
        user_id,
        product_id: product._id,
        createdAt: { $gte: startOfDay },
      }).session(session);


      if (todayCount >= MAX_HOLD_PER_DAY)
        throw new Error(
          `You have reserved ${product.name} too many times today`,
        );


      /* =======================
         5️⃣ CHECK % KHO (LOCK CHƯA HẾT HẠN)
      ======================= */
      const lockedAgg = await StockLockModel.aggregate([
        {
          $match: {
            product_id: product._id,
            expiresAt: { $gt: new Date() },
          },
        },
        {
          $group: {
            _id: null,
            total: { $sum: "$quantity" },
          },
        },
      ]).session(session);


      const lockedQty = lockedAgg[0]?.total || 0;
      const maxLock = Math.max(
        1,
        Math.floor(product.onHandQuantity * MAX_HOLD_PERCENT),
      );


      if (lockedQty + item.quantity > maxLock)
        throw new Error(
          `Product ${product.name} is being checked out by too many users`,
        );


      /* =======================
         6️⃣ XOÁ LOCK CŨ (KHÁC SESSION)
      ======================= */
      await StockLockModel.deleteMany(
        {
          user_id,
          product_id: product._id,
          checkout_session_id: { $ne: checkout_session_id },
        },
        { session },
      );


      /* =======================
         7️⃣ CREATE STOCK LOCK
      ======================= */
      await StockLockModel.create(
        [
          {
            user_id,
            product_id: product._id,
            quantity: item.quantity,
            checkout_session_id,
            expiresAt: new Date(Date.now() + HOLD_MINUTES * 60 * 1000),
            cooldownUntil: new Date(Date.now() + COOLDOWN_MINUTES * 60 * 1000),
          },
        ],
        { session },
      );
    }


    /* =======================
       COMMIT TRANSACTION
    ======================= */
    await session.commitTransaction();
    session.endSession();


    /* =======================
       🔥 RETURN CHỈ ITEM ĐƯỢC SELECT
    ======================= */
    const checkoutItems = await CartDetailModel.find({
      cart_id: cart._id,
      product_id: { $in: selected_product_ids },
    }).populate("product_id", "name images price onHandQuantity status expiryDateStr expiryDate nearExpiryDaysThreshold nearExpiryDiscountPercent");
    const formattedItems = checkoutItems.map((item) => {
      const { effectivePrice, isNearExpiry, originalPrice } = getEffectivePrice(item.product_id);
      return {
        product_id: item.product_id._id,
        name: item.product_id.name,
        image: item.product_id.images?.[0],
        price: effectivePrice,
        originalPrice: isNearExpiry ? originalPrice : null,
        isNearExpiry,
        quantity: item.quantity,
        in_stock: item.product_id.onHandQuantity,
        status: item.product_id.status,
        warning: !item.product_id.status
          ? "Product is no longer for sale"
          : item.product_id.onHandQuantity <= 0
            ? "Product is temporarily out of stock"
            : "In stock",
        subtotal: item.quantity * effectivePrice,
      };
    });
    return {
      status: "OK",
      message: "Items reserved, please complete payment within 15 minutes",
      checkout_session_id,
      item_count: formattedItems.length,
      items: formattedItems,
    };
  } catch (error) {
    await session.abortTransaction();
    session.endSession();


    return {
      status: "ERR",
      message: error.message || "Failed to reserve checkout items",
      checkout_session_id,
      item_count: 0,
      items: [],
    };
  }
};


const cancelCheckout = async (user_id, checkout_session_id) => {
  if (!checkout_session_id) {
    throw new Error("Missing checkout_session_id");
  }


  await StockLockModel.deleteMany({
    user_id,
    checkout_session_id,
  });

  return {
    status: "OK",
    message: "Checkout cancelled, inventory released",
  };
};
module.exports = {
  checkoutHold,
  cancelCheckout,
};
