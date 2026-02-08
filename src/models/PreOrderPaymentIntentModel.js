const mongoose = require("mongoose");

/**
 * PreOrderPaymentIntent - Pending payment for a pre-order.
 * Created when user clicks "Pre-order"; expires in 15 minutes.
 * PreOrder is created ONLY when VNPay callback returns SUCCESS.
 */
const preOrderPaymentIntentSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      required: true,
      index: true,
    },
    fruitTypeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "fruit_types",
      required: true,
    },
    quantityKg: {
      type: Number,
      required: true,
      min: 0,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    status: {
      type: String,
      enum: ["PENDING", "SUCCESS", "EXPIRED", "FAILED"],
      default: "PENDING",
      index: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
    receiver_name: { type: String, trim: true },
    receiver_phone: { type: String, trim: true },
    receiver_address: { type: String, trim: true },
  },
  { timestamps: true }
);

const PreOrderPaymentIntentModel = mongoose.model(
  "pre_order_payment_intents",
  preOrderPaymentIntentSchema
);
module.exports = PreOrderPaymentIntentModel;
