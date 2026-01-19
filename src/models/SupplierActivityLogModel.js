const mongoose = require("mongoose");

const supplierActivityLogSchema = new mongoose.Schema(
  {
    supplier: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "suppliers",
      required: [true, "Nhà cung cấp là bắt buộc"],
      index: true,
    },

    action: {
      type: String,
      enum: [
        "CREATED",
        "UPDATED",
        "HARVEST_BATCH_CREATED",
        "QUALITY_VERIFIED",
        "PURCHASE_COST_UPDATED",
        "PERFORMANCE_EVALUATED",
        "COOPERATION_STATUS_CHANGED",
        "STATUS_CHANGED",
      ],
      required: [true, "Hành động là bắt buộc"],
      index: true,
    },

    description: {
      type: String,
      trim: true,
      maxlength: [500, "Mô tả không được vượt quá 500 ký tự"],
      default: "",
    },

    // Dữ liệu liên quan (có thể là productId, batchId, etc.)
    relatedEntity: {
      type: String,
      enum: ["PRODUCT", "HARVEST_BATCH", "QUALITY_VERIFICATION", "PERFORMANCE", "SUPPLIER"],
      default: "SUPPLIER",
    },

    relatedEntityId: {
      type: mongoose.Schema.Types.ObjectId,
      index: true,
    },

    // Dữ liệu thay đổi (old value -> new value)
    changes: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
      default: new Map(),
    },

    // Người thực hiện
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      required: true,
    },
  },
  { timestamps: true }
);

// Index
supplierActivityLogSchema.index({ supplier: 1, createdAt: -1 });
supplierActivityLogSchema.index({ action: 1, createdAt: -1 });
supplierActivityLogSchema.index({ performedBy: 1, createdAt: -1 });

const SupplierActivityLogModel = mongoose.model("supplier_activity_logs", supplierActivityLogSchema);
module.exports = SupplierActivityLogModel;
