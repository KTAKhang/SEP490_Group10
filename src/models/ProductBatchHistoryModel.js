const mongoose = require("mongoose");


const productBatchHistorySchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "products",
      required: true,
      index: true,
    },

    // Snapshot tại thời điểm chốt lô (không đổi khi product được sửa sau này)
    productNameSnapshot: { type: String, trim: true, default: "" },
    productCategoryNameSnapshot: { type: String, trim: true, default: "" },
    productBrandSnapshot: { type: String, trim: true, default: "" },

    // ✅ Liên kết với Harvest Batch (nếu có)
    harvestBatch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "harvest_batches",
      default: null,
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
      match: [/^\d{4}-\d{2}-\d{2}$/, "warehouseEntryDateStr must be YYYY-MM-DD"],
    },


    // Ngày hết hạn
    expiryDate: {
      type: Date,
      default: null,
    },


    expiryDateStr: {
      type: String,
      default: null,
      match: [/^\d{4}-\d{2}-\d{2}$/, "expiryDateStr must be YYYY-MM-DD"],
    },


    // Ngày hoàn thành lô (bán hết hoặc hết hạn)
    completedDate: {
      type: Date,
      required: true,
    },


    completedDateStr: {
      type: String,
      required: true,
      match: [/^\d{4}-\d{2}-\d{2}$/, "completedDateStr must be YYYY-MM-DD"],
    },


    // Lý do hoàn thành: "SOLD_OUT" | "EXPIRED"
    completionReason: {
      type: String,
      enum: ["SOLD_OUT", "EXPIRED"],
      required: true,
    },
    // ✅ Giá nhập / giá bán tại thời điểm chốt lô (để tính doanh thu, lợi nhuận gộp, tổn thất)
    unitCostPrice: {
      type: Number,
      default: 0,
      min: 0,
    },
    unitSellPrice: {
      type: Number,
      default: 0,
      min: 0,
    },
    // ✅ Bán xả kho / giảm giá: doanh thu và số lượng từ đơn hàng trong kỳ lô
    actualRevenue: {
      type: Number,
      default: 0,
      min: 0,
    },
    clearanceQuantity: {
      type: Number,
      default: 0,
      min: 0,
    },
    clearanceRevenue: {
      type: Number,
      default: 0,
      min: 0,
    },
    fullPriceQuantity: {
      type: Number,
      default: 0,
      min: 0,
    },
    fullPriceRevenue: {
      type: Number,
      default: 0,
      min: 0,
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
// Index cho harvestBatch đã được khai báo ở field
module.exports = mongoose.model("product_batch_histories", productBatchHistorySchema);