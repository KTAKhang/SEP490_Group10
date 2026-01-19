const CartModel = require("../models/CartsModel");
const CartDetailModel = require("../models/CartDetailsModel");
const ProductModel = require("../models/ProductModel");

const addItemToCart = async (user_id, product_id, quantity) => {
  const product = await ProductModel.findById(product_id);
  if (!product || !product.status) {
    throw new Error("Sản phẩm không tồn tại hoặc đã ngừng bán");
  }

  if (product.onHandQuantity < quantity) {
    throw new Error(`Không đủ hàng cho sản phẩm ${product.name}`);
  }

  let cart = await CartModel.findOne({ user_id });
  if (!cart) {
    cart = await CartModel.create({ user_id, sum: 0 });
  }

  let cartDetail = await CartDetailModel.findOne({
    cart_id: cart._id,
    product_id,
  });

  if (cartDetail) {
    cartDetail.quantity += quantity;
    await cartDetail.save();
  } else {
    await CartDetailModel.create({
      cart_id: cart._id,
      product_id,
      quantity,
      price: product.price,
    });
  }

  const items = await CartDetailModel.find({ cart_id: cart._id });
  cart.sum = items.length;
  await cart.save();

  return {
    message: "Thêm sản phẩm vào giỏ hàng thành công",
  };
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

const removeItemFromCart = async (user_id, product_id) => {
  const cart = await CartModel.findOne({ user_id });
  if (!cart) throw new Error("Không tìm thấy giỏ hàng");

  const deleted = await CartDetailModel.findOneAndDelete({
    cart_id: cart._id,
    product_id,
  });

  if (!deleted) {
    throw new Error("Sản phẩm không có trong giỏ hàng");
  }

  // Tính lại tổng tiền
  const allItems = await CartDetailModel.find({ cart_id: cart._id });
  const newSum = allItems.reduce(
    (total, item) => total + item.quantity * item.price,
    0
  );

  cart.sum = newSum;
  await cart.save();

  return {
    message: "Đã xóa sản phẩm khỏi giỏ hàng",
    sum: newSum,
    total_items: allItems.length,
  };
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
    "name image price quantity status"
  );

  const formattedItems = items.map((item) => ({
    product_id: item.product_id._id,
    name: item.product_id.name,
    image: item.product_id.image,
    price: item.price,
    quantity: item.quantity,
    in_stock: item.product_id.quantity,
    status: item.product_id.status,
    is_available: item.product_id.status && item.product_id.quantity > 0,
    warning: !item.product_id.status
      ? "Sản phẩm đã ngừng bán"
      : item.product_id.quantity <= 0
      ? "Sản phẩm tạm hết hàng"
      : null,
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
