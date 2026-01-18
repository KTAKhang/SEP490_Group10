const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema(
  {
    order_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "orders",
      required: true,
      index: true,
    },

    // PAYMENT | REFUND
    type: {
      type: String,
      enum: ["PAYMENT", "REFUND"],
      required: true,
    },

    // COD | VNPAY
    method: {
      type: String,
      enum: ["COD", "VNPAY"],
      required: true,
    },

    amount: {
      type: Number,
      required: true,
      min: 0,
    },

    // trạng thái giao dịch tiền
    status: {
      type: String,
      enum: ["PENDING", "SUCCESS", "FAILED", "CANCELLED", "UNPAID","REFUND_PENDING","REFUNDED", "REFUND_FAILED"],
      default: "PENDING",
    },

    // VNPay fields
    provider_txn_id: {
      type: String, // vnp_TxnRef / vnp_TransactionNo
      index: true,
    },

    provider_response: {
      type: Object, // lưu raw response từ VNPay
    },

    note: {
      type: String,
      trim: true,
      maxlength: 200,
    },
  },
  { timestamps: true }
);

const PaymentModel = mongoose.model("payments", paymentSchema);
module.exports = PaymentModel;
