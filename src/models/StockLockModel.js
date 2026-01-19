// models/StockLockModel.js
const mongoose = require("mongoose");

const stockLockSchema = new mongoose.Schema(
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
    checkout_session_id: {
      type: String,
      required: true,
      index: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
    },

    // TTL giữ hàng
    expiresAt: {
      type: Date,
      required: true, // ✅ KHÔNG index ở đây
    },

    // Cooldown chống spam
    cooldownUntil: {
      type: Date,
      default: null,
      index: true,
    },
  },
  { timestamps: true }
);

// ✅ TTL index – MongoDB tự xoá document khi expiresAt < now
stockLockSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("stock_locks", stockLockSchema);
