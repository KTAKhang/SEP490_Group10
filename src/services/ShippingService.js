const CartModel = require("../models/CartsModel");
const CartDetailModel = require("../models/CartDetailsModel");
const ShippingRuleModel = require("../models/ShippingRuleModel");

const calculateShippingFee = async ({
  user_id,
  selected_product_ids,
  city,
}) => {
  // 1. Lấy cart
  const cart = await CartModel.findOne({ user_id });
  if (!cart) throw new Error("Shopping cart not found");

  // 2. Lấy các item được chọn
  const cartItems = await CartDetailModel.find({
    cart_id: cart._id,
    product_id: { $in: selected_product_ids },
  });

  if (!cartItems.length)
    throw new Error("No products were selected.");

  // 3. Tổng cân nặng (quantity = kg)
  let totalWeight = 0;

  for (const item of cartItems) {
    if (item.quantity <= 0)
      throw new Error("Invalid product quantity");

    totalWeight += item.quantity;
  }

  // 4. Phân loại trong / ngoài tỉnh
  const storeProvince = "Thành phố Cần Thơ";
  const shippingType =
    city.trim().toLowerCase() === storeProvince.toLowerCase()
      ? "IN_PROVINCE"
      : "OUT_PROVINCE";

  // 5. Lấy rule ship
  const rule = await ShippingRuleModel.findOne({
    type: shippingType,
    province: storeProvince,
  });

  if (!rule)
    throw new Error("Shipping charges for this area have not yet been configured");

  // 6. Tính tiền ship
  let shippingFee = rule.basePrice;

  if (totalWeight > rule.baseWeight) {
    const extraKg = Math.ceil(totalWeight - rule.baseWeight);
    shippingFee += extraKg * rule.extraPricePerKg;
  }

  return {
    shippingType,
    totalWeight,      // kg
    shippingFee,      // VND
  };
};

const calculateShippingForCheckout = async ({
  user_id,
  selected_product_ids,
  city,
  session,
}) => {
  const cart = await CartModel.findOne({ user_id }).session(session);
  if (!cart) throw new Error("Không tìm thấy giỏ hàng");

  const cartItems = await CartDetailModel.find({
    cart_id: cart._id,
    product_id: { $in: selected_product_ids },
  }).session(session);

  if (!cartItems.length)
    throw new Error("Không có sản phẩm để tính tiền ship");

  // quantity = kg
  let totalWeight = 0;
  for (const item of cartItems) {
    totalWeight += item.quantity;
  }

  const storeProvince = "Thành phố Cần Thơ";
  const shippingType =
    city.trim().toLowerCase() === storeProvince.toLowerCase()
      ? "IN_PROVINCE"
      : "OUT_PROVINCE";

  const rule = await ShippingRuleModel.findOne({
    type: shippingType,
    province: storeProvince,
  }).session(session);

  if (!rule)
    throw new Error("Chưa cấu hình tiền ship");

  let shippingFee = rule.basePrice;
  if (totalWeight > rule.baseWeight) {
    const extraKg = Math.ceil(totalWeight - rule.baseWeight);
    shippingFee += extraKg * rule.extraPricePerKg;
  }

  return {
    shippingFee,
    shippingType,
    shippingWeight: totalWeight,
  };
};

module.exports = {
  calculateShippingFee,
  calculateShippingForCheckout
};
