const mongoose = require("mongoose");

const harvestBatchSchema = new mongoose.Schema(
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

    // ✅ BR-SUP-11: Harvest Batch Code (tự động sinh, unique, required)
    batchCode: {
      type: String,
      trim: true,
      uppercase: true,
      unique: true,
      required: false, // ✅ Đảm bảo luôn có giá trị
      maxlength: [30, "Mã lô thu hoạch không được vượt quá 30 ký tự"],
      immutable: true,
    },

    batchNumber: {
      type: String,
      required: [true, "Số lô thu hoạch là bắt buộc"],
      trim: true,
    },

    harvestDate: {
      type: Date,
      required: [true, "Ngày thu hoạch là bắt buộc"],
    },

    harvestDateStr: {
      type: String,
      match: [/^\d{4}-\d{2}-\d{2}$/, "harvestDateStr phải có format YYYY-MM-DD"],
    },

    // ✅ Tracking số lượng đã nhập kho
    receivedQuantity: {
      type: Number,
      default: 0,
      min: 0,
      validate: {
        validator: Number.isInteger,
        message: "receivedQuantity phải là số nguyên",
      },
    },

    location: {
      type: String,
      trim: true,
      maxlength: [200, "Địa điểm thu hoạch không được vượt quá 200 ký tự"],
      // ✅ BR-SUP-10: Location (khu vực/vùng trồng) là recommended nhưng optional để linh hoạt
    },

    notes: {
      type: String,
      trim: true,
      maxlength: [500, "Ghi chú không được vượt quá 500 ký tự"],
      default: "",
    },

    // ✅ Liên kết với Inventory Transactions (array của transaction IDs)
    inventoryTransactionIds: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: "inventory_transactions",
      default: [],
    },

    /**
     * receiptEligible: Chỉ lô có status true mới được chọn để nhập hàng vào kho.
     * false = không thể chọn lô này khi tạo phiếu nhập kho.
     */
    receiptEligible: {
      type: Boolean,
      default: true,
    },

    /**
     * visibleInReceipt: Ẩn/hiện trong danh sách chọn lô khi nhập kho.
     * false = ẩn khỏi dropdown (tránh hiển thị lô đã nhập, giảm rối loạn cho nhân viên kho).
     * Được set false sau khi lô đã được nhập kho.
     */
    visibleInReceipt: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

// ✅ Enable virtuals in JSON output
harvestBatchSchema.set("toJSON", { virtuals: true });
harvestBatchSchema.set("toObject", { virtuals: true });

// Index
harvestBatchSchema.index({ supplier: 1, product: 1, harvestDate: -1 });
// ✅ Unique constraint: không cho trùng (supplier, product, batchNumber, harvestDate)
harvestBatchSchema.index({ supplier: 1, product: 1, batchNumber: 1, harvestDate: 1 }, { unique: true });

// Pre-save hook
harvestBatchSchema.pre("save", function (next) {
  // ✅ BR-SUP-12: Validation harvestDate không được lớn hơn ngày hiện tại
  if (this.isModified("harvestDate") && this.harvestDate) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const harvestDate = new Date(this.harvestDate);
    harvestDate.setHours(0, 0, 0, 0);
    
    if (harvestDate > today) {
      return next(new Error("Ngày thu hoạch không được lớn hơn ngày hiện tại"));
    }

    // Sync harvestDateStr
    const d = new Date(this.harvestDate);
    const vnDate = new Date(d.toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" }));
    const year = vnDate.getFullYear();
    const month = String(vnDate.getMonth() + 1).padStart(2, "0");
    const day = String(vnDate.getDate()).padStart(2, "0");
    this.harvestDateStr = `${year}-${month}-${day}`;
  }

  // ✅ BR-SUP-11: Tự động sinh batchCode khi tạo mới
  if (this.isNew) {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    this.batchCode = `HB-${timestamp}-${random}`;
  }

  // ✅ BR-SUP-11: Không cho chỉnh sửa batchCode sau khi tạo
  if (!this.isNew && this.isModified("batchCode")) {
    return next(new Error("Mã lô thu hoạch không thể chỉnh sửa sau khi tạo"));
  }

  // ✅ Validation: receivedQuantity >= 0
  if (this.isModified("receivedQuantity") && this.receivedQuantity !== undefined) {
    if (this.receivedQuantity < 0) {
      return next(new Error("receivedQuantity không được âm"));
    }
  }

  next();
});

const HarvestBatchModel = mongoose.model("harvest_batches", harvestBatchSchema);
module.exports = HarvestBatchModel;
