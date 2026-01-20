const mongoose = require("mongoose");

const qualityVerificationSchema = new mongoose.Schema(
  {
    supplier: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "suppliers",
      required: [true, "Nhà cung cấp là bắt buộc"],
      index: true,
    },

    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "products",
      required: [true, "Sản phẩm là bắt buộc"],
      index: true,
    },

    harvestBatch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "harvest_batches",
      // ✅ Index được định nghĩa ở dưới với unique constraint
    },

    // Kết quả kiểm tra
    verificationResult: {
      type: String,
      enum: ["PASSED", "FAILED", "CONDITIONAL"],
      required: [true, "Kết quả kiểm tra là bắt buộc"],
    },

    // Các tiêu chí kiểm tra
    criteria: {
      appearance: {
        type: Number,
        min: 0,
        max: 10,
        default: 0,
      },
      freshness: {
        type: Number,
        min: 0,
        max: 10,
        default: 0,
      },
      size: {
        type: Number,
        min: 0,
        max: 10,
        default: 0,
      },
      color: {
        type: Number,
        min: 0,
        max: 10,
        default: 0,
      },
      defects: {
        type: Number,
        min: 0,
        max: 10,
        default: 0, // 0 = không có lỗi, 10 = nhiều lỗi
      },
    },

    // Điểm tổng thể
    overallScore: {
      type: Number,
      min: 0,
      max: 100,
      default: 0,
    },

    // Số lượng đạt chuẩn
    approvedQuantity: {
      type: Number,
      min: 0,
      default: 0,
      validate: {
        validator: Number.isInteger,
        message: "approvedQuantity phải là số nguyên",
      },
    },

    // Số lượng không đạt chuẩn
    rejectedQuantity: {
      type: Number,
      min: 0,
      default: 0,
      validate: {
        validator: Number.isInteger,
        message: "rejectedQuantity phải là số nguyên",
      },
    },

    // Ghi chú
    notes: {
      type: String,
      trim: true,
      maxlength: [1000, "Ghi chú không được vượt quá 1000 ký tự"],
      default: "",
    },

    // Người kiểm tra (qc_staff)
    verifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      required: true,
    },

    // Ngày kiểm tra
    verifiedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

// Index
qualityVerificationSchema.index({ supplier: 1, product: 1, verifiedAt: -1 });
qualityVerificationSchema.index({ verificationResult: 1, verifiedAt: -1 });
// ✅ Unique constraint: mỗi harvestBatch chỉ có 1 quality verification (BR-SUP-16)
qualityVerificationSchema.index({ harvestBatch: 1 }, { unique: true, sparse: true });

// Pre-save hook để tính overallScore
qualityVerificationSchema.pre("save", function (next) {
  const criteria = this.criteria || {};
  const appearance = criteria.appearance || 0;
  const freshness = criteria.freshness || 0;
  const size = criteria.size || 0;
  const color = criteria.color || 0;
  const defects = criteria.defects || 0; // defects càng cao thì điểm càng thấp
  
  // Tính điểm: (appearance + freshness + size + color) / 4 * 10 - defects
  const baseScore = (appearance + freshness + size + color) / 4 * 10;
  this.overallScore = Math.max(0, Math.min(100, baseScore - defects * 2));
  
  next();
});

const QualityVerificationModel = mongoose.model("quality_verifications", qualityVerificationSchema);
module.exports = QualityVerificationModel;
