const mongoose = require("mongoose");

/**
 * PreOrder - Created ONLY after successful VNPay payment.
 * Business commitment, not a stock transaction.
 * Warehouse does NOT see or handle PreOrder.
 */
const preOrderSchema = new mongoose.Schema(
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
      index: true,
    },
    quantityKg: {
      type: Number,
      required: true,
      min: 0,
    },
    status: {
      type: String,
      enum: [
        "WAITING_FOR_ALLOCATION",
        "WAITING_FOR_NEXT_BATCH",
        "ALLOCATED_WAITING_PAYMENT",
        "READY_FOR_FULFILLMENT",
        "COMPLETED",
        "CANCELLED",
        "WAITING_FOR_PRODUCT", // legacy; treat as WAITING_FOR_ALLOCATION in demand/allocation
      ],
      default: "WAITING_FOR_ALLOCATION",
      index: true,
    },
    paymentStatus: {
      type: String,
      enum: ["PAID"],
      default: "PAID",
    },
    receiver_name: { type: String, trim: true },
    receiver_phone: { type: String, trim: true },
    receiver_address: { type: String, trim: true },
    /** Số tiền đã thanh toán lúc đặt cọc (VNPay). */
    depositPaid: { type: Number, default: 0, min: 0 },
    /** Tổng tiền đơn (estimatedPrice * quantityKg tại thời điểm đặt). */
    totalAmount: { type: Number, default: 0, min: 0 },
    /** Thời điểm thanh toán phần còn lại thành công (null = chưa thanh toán nốt). */
    remainingPaidAt: { type: Date, default: null },
  },
  { timestamps: true }
);

preOrderSchema.index({ userId: 1, createdAt: -1 });
preOrderSchema.index({ fruitTypeId: 1, status: 1 });

const PreOrderModel = mongoose.model("pre_orders", preOrderSchema);
module.exports = PreOrderModel;
