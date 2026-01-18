const mongoose = require("mongoose");

const cartSchema = new mongoose.Schema({
    user_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "users",
        required: true,
    },
    sum: { type: Number, required: true }
});

const CartModel = mongoose.model("carts", cartSchema);
module.exports = CartModel;