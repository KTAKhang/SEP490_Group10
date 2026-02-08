const mongoose = require("mongoose");

/**
 * Phiếu nhập kho trả đơn đặt trước (history).
 * - Khi nhập theo lô: preOrderHarvestBatchId có giá trị, fruitTypeId lấy từ batch.
 * - Legacy: có thể chỉ có fruitTypeId (nhập trực tiếp, cộng PreOrderStock).
 */
const preOrderReceiveSchema = new mongoose.Schema(
  {
    preOrderHarvestBatchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "pre_order_harvest_batches",
      default: null,
      index: true,
    },
    fruitTypeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "fruit_types",
      index: true,
    },
    quantityKg: {
      type: Number,
      required: true,
      min: 0,
    },
    receivedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      required: true,
      index: true,
    },
    note: { type: String, trim: true, default: "" },
  },
  { timestamps: true }
);

preOrderReceiveSchema.index({ createdAt: -1 });
preOrderReceiveSchema.index({ preOrderHarvestBatchId: 1, createdAt: -1 });

const PreOrderReceiveModel = mongoose.model("pre_order_receives", preOrderReceiveSchema);
module.exports = PreOrderReceiveModel;
