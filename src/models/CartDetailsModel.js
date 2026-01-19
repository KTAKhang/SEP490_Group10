const mongoose = require("mongoose");

const cartDetailSchema = new mongoose.Schema({
    cart_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "carts",
        required: [true, "Giỏ hàng là bắt buộc"],
    },
    product_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "products",
        required: [true, "Sản phẩm là bắt buộc"],
    },
    quantity: {
        type: Number,
        required: [true, "Số lượng là bắt buộc"],
        min: [1, "Số lượng phải lớn hơn hoặc bằng 1"],
    },
    price: {
        type: Number,
        required: [true, "Giá là bắt buộc"],
        min: [0, "Giá không được âm"],
    },
});

const CartDetailModel = mongoose.model("cart_details", cartDetailSchema);
module.exports = CartDetailModel;