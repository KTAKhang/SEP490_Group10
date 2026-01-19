const CartModel = require("../models/CartsModel");
const CartDetailModel = require("../models/CartDetailsModel");
const ProductModel = require("../models/ProductModel");
const { default: mongoose } = require("mongoose");

const addItemToCart = async (user_id, product_id, quantity) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // ===== 1️⃣ VALIDATE INPUT =====
    if (!quantity || quantity < 1) {
      throw new Error("Số lượng phải >= 1");
    }

    // ===== 2️⃣ CHECK PRODUCT =====
    const product = await ProductModel.findById(product_id).session(session);
    if (!product || !product.status) {
      throw new Error("Sản phẩm không tồn tại hoặc đã ngừng bán");
    }

    // ===== 3️⃣ LOAD / CREATE CART =====
    let cart = await CartModel.findOne({ user_id }).session(session);
    if (!cart) {
      cart = await CartModel.create(
        [{ user_id, sum: 0 }],
        { session }
      );
      cart = cart[0];
    }

    // ===== 4️⃣ LOAD CART DETAIL =====
    let cartDetail = await CartDetailModel.findOne({
      cart_id: cart._id,
      product_id,
    }).session(session);

    const currentQty = cartDetail ? cartDetail.quantity : 0;
    const newQty = currentQty + quantity;

    // ===== 5️⃣ CHECK STOCK =====
    if (product.onHandQuantity < newQty) {
      throw new Error(
        `Không đủ hàng cho sản phẩm ${product.name}. Còn ${product.onHandQuantity}`
      );
    }

    // ===== 6️⃣ UPSERT CART DETAIL =====
    if (cartDetail) {
      cartDetail.quantity = newQty;
      await cartDetail.save({ session });
    } else {
      await CartDetailModel.create(
        [
          {
            cart_id: cart._id,
            product_id,
            quantity,
            price: product.price,
          },
        ],
        { session }
      );
    }

    // ===== 7️⃣ RECALCULATE CART SUM =====
    const items = await CartDetailModel.find({ cart_id: cart._id }).session(
      session
    );

    cart.sum = items.reduce((total, item) => total + item.quantity, 0);
    await cart.save({ session });

    await session.commitTransaction();

    return {
      status: "OK",
      message: "Thêm sản phẩm vào giỏ hàng thành công",
    };
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

const updateItemInCart = async (user_id, product_id, newQuantity) => {
  const product = await ProductModel.findById(product_id);
  if (!product || !product.status) {
    throw new Error("Sản phẩm không tồn tại hoặc đã ngừng bán");
  }

  if (newQuantity > product.onHandQuantity) {
    throw new Error(`Chỉ còn ${product.onHandQuantity} sản phẩm trong kho`);
  }

  const cart = await CartModel.findOne({ user_id });
  if (!cart) throw new Error("Không tìm thấy giỏ hàng");

  const cartDetail = await CartDetailModel.findOne({
    cart_id: cart._id,
    product_id,
  });

  if (!cartDetail) {
    throw new Error("Sản phẩm không có trong giỏ hàng");
  }

  if (newQuantity <= 0) {
    await cartDetail.remove();
  } else {
    cartDetail.quantity = newQuantity;
    await cartDetail.save();
  }

  const allItems = await CartDetailModel.find({ cart_id: cart._id });
  const newSum = allItems.reduce(
    (total, item) => total + item.quantity * item.price,
    0
  );

  cart.sum = allItems.length;
  await cart.save();

  return {
    message: "Cập nhật giỏ hàng thành công",
    total_price: newSum,
    total_items: allItems.length,
  };
};

const removeItemFromCart = async (user_id, product_ids) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const cart = await CartModel
      .findOne({ user_id })
      .session(session);

    if (!cart) throw new Error("Không tìm thấy giỏ hàng");

    // Luôn ép về mảng
    const ids = Array.isArray(product_ids)
      ? product_ids
      : [product_ids];

    /* ==========================
       1️⃣ Lấy các item cần xóa
    ========================== */
    const itemsToDelete = await CartDetailModel
      .find({
        cart_id: cart._id,
        product_id: { $in: ids },
      })
      .session(session);

    if (itemsToDelete.length === 0) {
      throw new Error("Không có sản phẩm hợp lệ để xóa");
    }

    /* ==========================
       2️⃣ Tính tổng quantity cần trừ
    ========================== */
    const minusQuantity = itemsToDelete.reduce(
      (total, item) => total + item.quantity,
      0
    );

    /* ==========================
       3️⃣ Xóa nhiều item 1 lần
    ========================== */
    await CartDetailModel.deleteMany(
      {
        cart_id: cart._id,
        product_id: { $in: ids },
      },
      { session }
    );

    /* ==========================
       4️⃣ Update cart.sum (quantity)
    ========================== */
    cart.sum = Math.max(cart.sum - minusQuantity, 0);
    await cart.save({ session });

    await session.commitTransaction();
    session.endSession();

    return {
      status: "OK",
      message: "Đã xóa sản phẩm khỏi giỏ hàng",
      removed_items: itemsToDelete.length,
      sum: cart.sum, // tổng quantity còn lại
    };
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    throw error;
  }
};

const getCartItems = async (user_id) => {
  const cart = await CartModel.findOne({ user_id });
  if (!cart) {
    return {
      cart_id: null,
      sum: 0,
      items: [],
    };
  }

  const items = await CartDetailModel.find({ cart_id: cart._id }).populate(
    "product_id",
    "name images price onHandQuantity status"
  );

  const formattedItems = items.map((item) => ({
    product_id: item.product_id._id,
    name: item.product_id.name,
    image: item.product_id.images?.[0],
    price: item.price,
    quantity: item.quantity,
    in_stock: item.product_id.onHandQuantity,
    status: item.product_id.status,
    warning: !item.product_id.status
      ? "Sản phẩm đã ngừng bán"
      : item.product_id.onHandQuantity <= 0
      ? "Sản phẩm tạm hết hàng"
      : "Còn hàng",
    subtotal: item.quantity * item.price,
  }));

  return {
    cart_id: cart._id,
    sum: cart.sum,
    item_count: formattedItems.length,
    items: formattedItems,
  };
};

module.exports = {
  addItemToCart,
  updateItemInCart,
  removeItemFromCart,
  getCartItems,
};
