const CartModel = require("../models/CartsModel");
const CartDetailModel = require("../models/CartDetailsModel");
const ProductModel = require("../models/ProductModel");
const { default: mongoose } = require("mongoose");
const { getEffectivePrice } = require("../utils/productPrice");


const addItemToCart = async (user_id, product_id, quantity) => {
  const session = await mongoose.startSession();
  session.startTransaction();


  try {
    /* =======================
       1️⃣ VALIDATE INPUT
    ======================= */
    if (!quantity || quantity < 1) {
      throw new Error("The quantity must be >= 1");
    }


    /* =======================
       2️⃣ CHECK PRODUCT
    ======================= */
    const product = await ProductModel
      .findById(product_id)
      .session(session);


    if (!product || !product.status) {
      throw new Error("The product does not exist or has been discontinued.");
    }


    /* =======================
       3️⃣ LOAD / CREATE CART
    ======================= */
    let cart = await CartModel
      .findOne({ user_id })
      .session(session);


    if (!cart) {
      const [newCart] = await CartModel.create(
        [{ user_id, sum: 0 }],
        { session }
      );
      cart = newCart;
    }


    /* =======================
       4️⃣ LOAD CART DETAIL
    ======================= */
    let cartDetail = await CartDetailModel.findOne({
      cart_id: cart._id,
      product_id,
    }).session(session);


    const currentQty = cartDetail ? cartDetail.quantity : 0;
    const newQty = currentQty + quantity;


    /* =======================
       5️⃣ CHECK STOCK
    ======================= */
    if (product.onHandQuantity < newQty) {
      throw new Error(
        `Insufficient stock for the product ${product.name}. Still ${product.onHandQuantity}`
      );
    }


    /* =======================
       6️⃣ UPSERT CART DETAIL
    ======================= */
    if (cartDetail) {
      cartDetail.quantity = newQty;
      await cartDetail.save({ session });
    } else {
      const { effectivePrice } = getEffectivePrice(product);
      await CartDetailModel.create(
        [
          {
            cart_id: cart._id,
            product_id,
            quantity,
            price: effectivePrice,
          },
        ],
        { session }
      );
    }


    /* =======================
       7️⃣ RECALCULATE CART SUM
       👉 sum = số loại sản phẩm
    ======================= */
    const distinctItemsCount = await CartDetailModel.countDocuments(
      { cart_id: cart._id },
      { session }
    );


    cart.sum = distinctItemsCount;
    await cart.save({ session });


    await session.commitTransaction();


    return {
      status: "OK",
      message: "Product added to cart successfully.",
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
    throw new Error("The product does not exist or has been discontinued.");
  }


  if (newQuantity > product.onHandQuantity) {
    throw new Error(`Only one left ${product.onHandQuantity} products in stock`);
  }


  const cart = await CartModel.findOne({ user_id });
  if (!cart) throw new Error("Shopping cart not found");


  const cartDetail = await CartDetailModel.findOne({
    cart_id: cart._id,
    product_id,
  });


  if (!cartDetail) {
    throw new Error("The product is not in the shopping cart.");
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
    message: "Shopping cart updated successfully",
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


    if (!cart) throw new Error("Shopping cart not found");


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
      throw new Error("No valid products to delete");
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
      message: "The product has been removed from the shopping cart",
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
    "name images price onHandQuantity status expiryDateStr expiryDate nearExpiryDaysThreshold nearExpiryDiscountPercent"
  );
  const formattedItems = items.map((item) => {
    const { effectivePrice, isNearExpiry, originalPrice } = getEffectivePrice(item.product_id);
    const priceToUse = effectivePrice;
    return {
      product_id: item.product_id._id,
      name: item.product_id.name,
      image: item.product_id.images?.[0],
      price: priceToUse,
      originalPrice: isNearExpiry ? originalPrice : null,
      isNearExpiry,
      quantity: item.quantity,
      in_stock: item.product_id.onHandQuantity,
      status: item.product_id.status,
      warning: !item.product_id.status
        ? "The product has been discontinued"
        : item.product_id.onHandQuantity <= 0
        ? "The product is temporarily out of stock"
        : "In stock",
      subtotal: item.quantity * priceToUse,
    };
  });
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
