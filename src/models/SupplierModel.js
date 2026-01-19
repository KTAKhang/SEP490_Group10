const mongoose = require("mongoose");

const supplierSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Tên nhà cung cấp là bắt buộc"],
      trim: true,
      minlength: [2, "Tên nhà cung cấp phải có ít nhất 2 ký tự"],
      maxlength: [100, "Tên nhà cung cấp không được vượt quá 100 ký tự"],
      index: true,
    },
    
    type: {
      type: String,
      enum: ["FARM", "COOPERATIVE", "BUSINESS"],
      required: [true, "Loại nhà cung cấp là bắt buộc"],
      index: true,
    },

    // ✅ Mã nhà cung cấp (tự động sinh hoặc nhập thủ công)
    code: {
      type: String,
      trim: true,
      uppercase: true,
      maxlength: [20, "Mã nhà cung cấp không được vượt quá 20 ký tự"],
      // ✅ sparse và unique được định nghĩa trong index ở dưới
    },

    // Thông tin liên hệ
    contactPerson: {
      type: String,
      trim: true,
      maxlength: [50, "Tên người liên hệ không được vượt quá 50 ký tự"],
    },
    
    phone: {
      type: String,
      trim: true,
      match: [/^[0-9+\-\s()]+$/, "Số điện thoại không hợp lệ"],
    },
    
    email: {
      type: String,
      trim: true,
      lowercase: true,
      match: [/\S+@\S+\.\S+/, "Định dạng email không hợp lệ"],
    },
    
    address: {
      type: String,
      trim: true,
      maxlength: [500, "Địa chỉ không được vượt quá 500 ký tự"],
    },

    // Trạng thái hợp tác
    cooperationStatus: {
      type: String,
      enum: ["ACTIVE", "SUSPENDED", "TERMINATED"],
      default: "ACTIVE",
      index: true,
    },

    // Giá mua từ nhà cung cấp (có thể khác nhau theo sản phẩm)
    // Lưu trữ dưới dạng object: { productId: price }
    purchaseCosts: {
      type: Map,
      of: {
        type: Number,
        min: 0,
      },
      default: new Map(),
    },

    // Đánh giá hiệu suất (tính toán từ các metrics)
    performanceScore: {
      type: Number,
      min: 0,
      max: 100,
      default: 0,
    },

    // Thống kê
    totalBatches: {
      type: Number,
      default: 0,
      min: 0,
    },

    totalProductsSupplied: {
      type: Number,
      default: 0,
      min: 0,
    },

    // Ghi chú
    notes: {
      type: String,
      trim: true,
      maxlength: [1000, "Ghi chú không được vượt quá 1000 ký tự"],
      default: "",
    },

    // Trạng thái (active/inactive)
    status: {
      type: Boolean,
      default: true,
      index: true,
    },

    // Người tạo (qc_staff)
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      required: true,
    },

    // Người cập nhật cuối cùng
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
    },
  },
  { timestamps: true }
);

// ✅ Unique constraints theo BR-SUP-03: Tên + số điện thoại, hoặc Mã nhà cung cấp
supplierSchema.index({ name: 1, phone: 1 }, { unique: true, sparse: true }); // sparse: chỉ unique khi phone có giá trị
supplierSchema.index({ code: 1 }, { unique: true, sparse: true }); // sparse: chỉ unique khi code có giá trị

// Index cho tìm kiếm
supplierSchema.index({ name: "text" });
supplierSchema.index({ cooperationStatus: 1, status: 1 });

// ✅ Pre-save validation: BR-SUP-02 - Phải có phone hoặc email (ít nhất 1)
supplierSchema.pre("save", function (next) {
  if (!this.phone && !this.email) {
    return next(new Error("Phải có ít nhất số điện thoại hoặc email"));
  }
  next();
});

const SupplierModel = mongoose.model("suppliers", supplierSchema);
module.exports = SupplierModel;
