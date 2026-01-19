const mongoose = require("mongoose");

const favoriteSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      required: true,
      index: true,
    },
    product_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "products",
      required: true,
      index: true,
    },
  },
  { timestamps: true }
);

// Compound unique index: Một user chỉ có thể yêu thích một sản phẩm một lần
favoriteSchema.index({ user_id: 1, product_id: 1 }, { unique: true });

module.exports = mongoose.model("favorites", favoriteSchema);
