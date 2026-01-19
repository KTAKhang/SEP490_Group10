const mongoose = require("mongoose");

/**
 * Supplier Activity Log
 * Ghi lại toàn bộ hoạt động liên quan tới Supplier
 * Dùng cho audit, timeline, báo cáo
 */

const ACTIONS = [
  "CREATED",
  "UPDATED",
  "HARVEST_BATCH_CREATED",
  "HARVEST_BATCH_UPDATED",
  "HARVEST_BATCH_DELETED",
  "QUALITY_VERIFIED",
  "PURCHASE_COST_UPDATED",
  "PERFORMANCE_EVALUATED",
  "COOPERATION_STATUS_CHANGED",
  "STATUS_CHANGED",
];

const RELATED_ENTITIES = [
  "SUPPLIER",
  "PRODUCT",
  "HARVEST_BATCH",
  "QUALITY_VERIFICATION",
  "PERFORMANCE",
];

const supplierActivityLogSchema = new mongoose.Schema(
  {
    // ========================
    // Supplier liên quan
    // ========================
    supplier: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "suppliers",
      required: [true, "Nhà cung cấp là bắt buộc"],
      index: true,
    },

    // ========================
    // Hành động
    // ========================
    action: {
      type: String,
      enum: ACTIONS,
      required: [true, "Hành động là bắt buộc"],
      index: true,
    },

    // ========================
    // Mô tả
    // ========================
    description: {
      type: String,
      trim: true,
      maxlength: [500, "Mô tả không được vượt quá 500 ký tự"],
      default: "",
    },

    // ========================
    // Thực thể liên quan
    // ========================
    relatedEntity: {
      type: String,
      enum: RELATED_ENTITIES,
      default: "SUPPLIER",
    },

    relatedEntityId: {
      type: mongoose.Schema.Types.ObjectId,
      index: true,
    },

    // ========================
    // Dữ liệu thay đổi
    // ========================
    changes: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
      default: new Map(),
    },

    // ========================
    // Người thực hiện
    // ========================
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      required: [true, "Người thực hiện là bắt buộc"],
      index: true,
    },
  },
  { timestamps: true }
);

// ========================
// INDEX TỐI ƯU QUERY
// ========================
supplierActivityLogSchema.index({ supplier: 1, createdAt: -1 });
supplierActivityLogSchema.index({ action: 1, createdAt: -1 });
supplierActivityLogSchema.index({ performedBy: 1, createdAt: -1 });
supplierActivityLogSchema.index({ relatedEntity: 1, relatedEntityId: 1 });

// ========================
// EXPORT
// ========================
const SupplierActivityLogModel = mongoose.model(
  "supplier_activity_logs",
  supplierActivityLogSchema
);

module.exports = SupplierActivityLogModel;
