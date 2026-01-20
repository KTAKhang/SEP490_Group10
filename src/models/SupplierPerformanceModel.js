const mongoose = require("mongoose");

const supplierPerformanceSchema = new mongoose.Schema(
  {
    supplier: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "suppliers",
      required: [true, "Nhà cung cấp là bắt buộc"],
      index: true,
    },

    // Kỳ đánh giá (tháng/năm)
    period: {
      type: String,
      required: [true, "Kỳ đánh giá là bắt buộc"],
      match: [/^\d{4}-\d{2}$/, "period phải có format YYYY-MM"],
      index: true,
    },

    // Các chỉ số hiệu suất
    metrics: {
      // Tỷ lệ đạt chất lượng
      qualityRate: {
        type: Number,
        min: 0,
        max: 100,
        default: 0,
      },

      // Tỷ lệ giao hàng đúng hạn
      onTimeDeliveryRate: {
        type: Number,
        min: 0,
        max: 100,
        default: 0,
      },

      // Số lượng sản phẩm cung cấp
      totalQuantitySupplied: {
        type: Number,
        min: 0,
        default: 0,
      },

      // Số lô đã cung cấp
      totalBatches: {
        type: Number,
        min: 0,
        default: 0,
      },

      // Số lô bị từ chối
      rejectedBatches: {
        type: Number,
        min: 0,
        default: 0,
      },

      // Điểm trung bình chất lượng
      averageQualityScore: {
        type: Number,
        min: 0,
        max: 100,
        default: 0,
      },
    },

    // Điểm tổng thể
    overallScore: {
      type: Number,
      min: 0,
      max: 100,
      default: 0,
    },

    // Xếp hạng
    rating: {
      type: String,
      enum: ["EXCELLENT", "GOOD", "FAIR", "POOR"],
      default: "FAIR",
    },

    // Ghi chú đánh giá
    notes: {
      type: String,
      trim: true,
      maxlength: [1000, "Ghi chú không được vượt quá 1000 ký tự"],
      default: "",
    },

    // Người đánh giá (qc_staff)
    evaluatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      required: true,
    },
  },
  { timestamps: true }
);

// Unique constraint: mỗi supplier chỉ có 1 bản ghi performance cho mỗi period
supplierPerformanceSchema.index({ supplier: 1, period: 1 }, { unique: true });
supplierPerformanceSchema.index({ overallScore: -1, period: -1 });

// Pre-save hook để tính overallScore và rating
supplierPerformanceSchema.pre("save", function (next) {
  const metrics = this.metrics || {};
  const qualityRate = metrics.qualityRate || 0;
  const onTimeDeliveryRate = metrics.onTimeDeliveryRate || 0;
  const averageQualityScore = metrics.averageQualityScore || 0;

  // Tính điểm tổng thể: (qualityRate * 0.4) + (onTimeDeliveryRate * 0.3) + (averageQualityScore * 0.3)
  this.overallScore = Math.round(
    qualityRate * 0.4 + onTimeDeliveryRate * 0.3 + averageQualityScore * 0.3
  );

  // Xác định rating
  if (this.overallScore >= 90) {
    this.rating = "EXCELLENT";
  } else if (this.overallScore >= 75) {
    this.rating = "GOOD";
  } else if (this.overallScore >= 60) {
    this.rating = "FAIR";
  } else {
    this.rating = "POOR";
  }

  next();
});

const SupplierPerformanceModel = mongoose.model("supplier_performances", supplierPerformanceSchema);
module.exports = SupplierPerformanceModel;
