const mongoose = require("mongoose");
const StockLockModel = require("../models/StockLockModel");
const CartDetailModel = require("../models/CartDetailsModel");
const CartModel = require("../models/CartsModel");
const ProductModel = require("../models/ProductModel");

const HOLD_MINUTES = 15;
const COOLDOWN_MINUTES = 30;
const MAX_HOLD_PERCENT = 0.8;
const MAX_HOLD_PER_DAY = 3;

/**
 * HOLD STOCK for selected cart items
 */
const checkoutHold = async (
  user_id,
  selected_product_ids,
  checkout_session_id
) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    /* =======================
       0️⃣ LOAD CART
    ======================= */
    const cart = await CartModel
      .findOne({ user_id })
      .session(session);

    if (!cart) throw new Error("Giỏ hàng trống");

    const cartItems = await CartDetailModel
      .find({
        cart_id: cart._id,
        product_id: { $in: selected_product_ids }
      })
      .session(session);

    if (!cartItems.length)
      throw new Error("Không có sản phẩm được chọn");

    /* =======================
       LOOP ITEMS
    ======================= */
    for (const item of cartItems) {
      const product = await ProductModel
        .findById(item.product_id)
        .session(session);

      if (!product || !product.status)
        throw new Error(`Sản phẩm ${product?.name || ""} không khả dụng`);

      /* =======================
         1️⃣ CHECK KHO THỰC TẾ
      ======================= */
      if (product.onHandQuantity < item.quantity)
        throw new Error(`Không đủ hàng cho ${product.name}`);

      /* =======================
         2️⃣ RESUME CHECKOUT CŨ
      ======================= */
      const existingLock = await StockLockModel
        .findOne({
          user_id,
          product_id: product._id,
          checkout_session_id,
          expiresAt: { $gt: new Date() }
        })
        .session(session);

      if (existingLock) {
        // 👉 User reload / mở lại web → giữ nguyên lock
        continue;
      }

      /* =======================
         3️⃣ CHECK COOLDOWN
      ======================= */
      const cooldown = await StockLockModel
        .findOne({
          user_id,
          product_id: product._id,
          cooldownUntil: { $gt: new Date() }
        })
        .session(session);

      if (cooldown)
        throw new Error(
          `Bạn vừa giữ sản phẩm ${product.name}, vui lòng thử lại sau`
        );

      /* =======================
         4️⃣ CHECK LIMIT / DAY
      ======================= */
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);

      const todayCount = await StockLockModel
        .countDocuments({
          user_id,
          product_id: product._id,
          createdAt: { $gte: startOfDay }
        })
        .session(session);

      if (todayCount >= MAX_HOLD_PER_DAY)
        throw new Error(
          `Bạn đã giữ sản phẩm ${product.name} quá nhiều lần hôm nay`
        );

      /* =======================
         5️⃣ CHECK % KHO (LOCK CHƯA HẾT HẠN)
      ======================= */
      const lockedAgg = await StockLockModel
        .aggregate([
          {
            $match: {
              product_id: product._id,
              expiresAt: { $gt: new Date() }
            }
          },
          {
            $group: {
              _id: null,
              total: { $sum: "$quantity" }
            }
          }
        ])
        .session(session);

      const lockedQty = lockedAgg[0]?.total || 0;
      const maxLock = Math.floor(
        product.onHandQuantity * MAX_HOLD_PERCENT
      );

      if (lockedQty + item.quantity > maxLock)
        throw new Error(
          `Sản phẩm ${product.name} đang được nhiều người thanh toán, vui lòng giảm số lượng`
        );

      /* =======================
         6️⃣ XOÁ LOCK CŨ (KHÁC SESSION)
      ======================= */
      await StockLockModel.deleteMany(
        {
          user_id,
          product_id: product._id,
          checkout_session_id: { $ne: checkout_session_id }
        },
        { session }
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
            expiresAt: new Date(
              Date.now() + HOLD_MINUTES * 60 * 1000
            ),
            cooldownUntil: new Date(
              Date.now() + COOLDOWN_MINUTES * 60 * 1000
            )
          }
        ],
        { session }
      );
    }

    /* =======================
       COMMIT
    ======================= */
    await session.commitTransaction();
    session.endSession();

    return {
      status: "OK",
      message: "Đã giữ hàng, vui lòng thanh toán trong 15 phút"
    };

  } catch (error) {
    await session.abortTransaction();
    session.endSession();

    return {
      status: "ERR",
      message: error.message || "Checkout hold thất bại"
    };
  }
};

const cancelCheckout = async (user_id, checkout_session_id) => {
  if (!checkout_session_id) {
    throw new Error("Thiếu checkout_session_id");
  }

  await StockLockModel.deleteMany({
    user_id,
    checkout_session_id
  });

  return {
    status: "OK",
    message: "Đã huỷ checkout, hàng đã được trả lại kho"
  };
};
module.exports = {
    checkoutHold,
    cancelCheckout
};
