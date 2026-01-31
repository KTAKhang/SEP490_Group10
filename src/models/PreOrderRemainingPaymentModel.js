const mongoose = require("mongoose");

/** Intent thanh toán phần còn lại cho pre-order. vnp_TxnRef = _id. */
const preOrderRemainingPaymentSchema = new mongoose.Schema(
  {
    preOrderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "pre_orders",
      required: true,
      index: true,
    },
    amount: { type: Number, required: true, min: 0 },
    status: {
      type: String,
      enum: ["PENDING", "SUCCESS", "FAILED", "EXPIRED"],
      default: "PENDING",
      index: true,
    },
    expiresAt: { type: Date, required: true, index: true },
  },
  { timestamps: true }
);

const PreOrderRemainingPaymentModel = mongoose.model(
  "pre_order_remaining_payments",
  preOrderRemainingPaymentSchema
);
module.exports = PreOrderRemainingPaymentModel;
