const mongoose = require("mongoose");

const productBatchHistorySchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "products",
      required: true,
      index: true,
    },

    // Số lô (tăng dần theo mỗi lần reset)
    batchNumber: {
      type: Number,
      required: true,
      min: 1,
    },

    // Số lượng kế hoạch
    plannedQuantity: {
      type: Number,
      required: true,
      min: 0,
    },

    // Số lượng đã nhập kho
    receivedQuantity: {
      type: Number,
      required: true,
      min: 0,
    },

    // Số lượng đã bán (tổng ISSUE transactions từ warehouseEntryDate đến completedDate)
    soldQuantity: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },

    // Số lượng vứt bỏ (hết hạn) = receivedQuantity - soldQuantity
    discardedQuantity: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },

    // Ngày nhập kho
    warehouseEntryDate: {
      type: Date,
      required: true,
    },

    warehouseEntryDateStr: {
      type: String,
      required: true,
      match: [/^\d{4}-\d{2}-\d{2}$/, "warehouseEntryDateStr phải có format YYYY-MM-DD"],
    },

    // Ngày hết hạn
    expiryDate: {
      type: Date,
      default: null,
    },

    expiryDateStr: {
      type: String,
      default: null,
      match: [/^\d{4}-\d{2}-\d{2}$/, "expiryDateStr phải có format YYYY-MM-DD"],
    },

    // Ngày hoàn thành lô (bán hết hoặc hết hạn)
    completedDate: {
      type: Date,
      required: true,
    },

    completedDateStr: {
      type: String,
      required: true,
      match: [/^\d{4}-\d{2}-\d{2}$/, "completedDateStr phải có format YYYY-MM-DD"],
    },

    // Lý do hoàn thành: "SOLD_OUT" | "EXPIRED"
    completionReason: {
      type: String,
      enum: ["SOLD_OUT", "EXPIRED"],
      required: true,
    },

    // Trạng thái: luôn là "COMPLETED"
    status: {
      type: String,
      enum: ["COMPLETED"],
      default: "COMPLETED",
    },
  },
  { timestamps: true }
);

// Index để query nhanh
productBatchHistorySchema.index({ product: 1, batchNumber: -1 });
productBatchHistorySchema.index({ product: 1, completedDate: -1 });
productBatchHistorySchema.index({ completionReason: 1 });

module.exports = mongoose.model("product_batch_histories", productBatchHistorySchema);
