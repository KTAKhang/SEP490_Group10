const mongoose = require("mongoose");

/**
 * Lô nhập hàng trả đơn đặt trước – tách biệt Product.
 * Admin tạo lô: chọn fruitType + lô thu hoạch (từ Harvest Batch quản lý tại /admin/harvest-batches).
 * Warehouse nhập theo lô cho tới Fully received, sau đó admin trả đơn từ demand.
 */
const preOrderHarvestBatchSchema = new mongoose.Schema(
  {
    /** Lô thu hoạch đã quản lý tại admin/harvest-batches – khi set thì supplierId/harvestDate/batchNumber lấy từ đó. */
    harvestBatchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "harvest_batches",
      default: null,
      index: true,
    },
    fruitTypeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "fruit_types",
      required: true,
      index: true,
    },
    supplierId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "suppliers",
      required: true,
      index: true,
    },
    batchCode: {
      type: String,
      trim: true,
      uppercase: true,
      unique: true,
      immutable: true,
      maxlength: [30, "Mã lô không được vượt quá 30 ký tự"],
    },
    batchNumber: {
      type: String,
      trim: true,
    },
    harvestDate: {
      type: Date,
      required: [true, "Ngày thu hoạch là bắt buộc"],
    },
    quantityKg: {
      type: Number,
      required: [true, "Số lượng (kg) là bắt buộc"],
      min: [1, "Số lượng phải lớn hơn 0"],
    },
    receivedKg: {
      type: Number,
      default: 0,
      min: 0,
    },
    notes: {
      type: String,
      trim: true,
      maxlength: [500, "Ghi chú không được vượt quá 500 ký tự"],
      default: "",
    },
  },
  { timestamps: true }
);

preOrderHarvestBatchSchema.virtual("remainingKg").get(function () {
  return Math.max(0, (this.quantityKg || 0) - (this.receivedKg || 0));
});

preOrderHarvestBatchSchema.virtual("status").get(function () {
  const r = this.receivedKg ?? 0;
  const q = this.quantityKg ?? 0;
  if (r <= 0) return "NOT_RECEIVED";
  if (r >= q) return "FULLY_RECEIVED";
  return "PARTIAL";
});

preOrderHarvestBatchSchema.set("toJSON", { virtuals: true });
preOrderHarvestBatchSchema.set("toObject", { virtuals: true });

preOrderHarvestBatchSchema.index({ fruitTypeId: 1, harvestDate: -1 });
preOrderHarvestBatchSchema.index({ supplierId: 1, harvestDate: -1 });

preOrderHarvestBatchSchema.pre("save", function (next) {
  if (this.isNew) {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    this.batchCode = `POHB-${timestamp}-${random}`;
  }
  if (this.isModified("receivedKg") && this.receivedKg !== undefined) {
    if (this.receivedKg < 0) return next(new Error("receivedKg không được âm"));
    if (this.receivedKg > (this.quantityKg || 0)) {
      return next(new Error("receivedKg không được lớn hơn quantityKg"));
    }
  }
  next();
});

const PreOrderHarvestBatchModel = mongoose.model(
  "pre_order_harvest_batches",
  preOrderHarvestBatchSchema
);
module.exports = PreOrderHarvestBatchModel;
