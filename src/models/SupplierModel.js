const mongoose = require("mongoose");

/**
 * Supplier Schema
 * - Hỗ trợ nhiều sản phẩm cho 1 supplier
 * - Phù hợp hệ thống nông sản / truy xuất nguồn gốc
 */

const supplierSchema = new mongoose.Schema(
  {
    // ========================
    // Thông tin cơ bản
    // ========================
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

    // Mã nhà cung cấp (có thể nhập hoặc sinh tự động)
    code: {
      type: String,
      trim: true,
      uppercase: true,
      maxlength: [20, "Mã nhà cung cấp không được vượt quá 20 ký tự"],
    },

    // ========================
    // Thông tin liên hệ
    // ========================
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

    //  DANH SÁCH SẢN PHẨM CUNG CẤP (QUAN TRỌNG)
    suppliedProducts: [
      {
        product: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "products",
          required: true,
        },
        purchasePrice: {
          type: Number,
          min: 0,
          required: true,
        },
        isActive: {
          type: Boolean,
          default: true,
        },
      },
    ],

    // ========================
    // Thống kê & đánh giá
    // ========================
    performanceScore: {
      type: Number,
      min: 0,
      max: 100,
      default: 0,
    },

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

    // Ghi chú & trạng thái
    notes: {
      type: String,
      trim: true,
      maxlength: [1000, "Ghi chú không được vượt quá 1000 ký tự"],
      default: "",
    },

    status: {
      type: Boolean,
      default: true,
      index: true,
    },

    // Audit
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      required: true,
    },

    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
    },
  },
  { timestamps: true }
);


// INDEX & CONSTRAINTS

// Không cho trùng tên + số điện thoại (nếu có phone)
supplierSchema.index(
  { name: 1, phone: 1 },
  { unique: true, sparse: true }
);

// Không cho trùng mã nhà cung cấp (nếu có code)
supplierSchema.index(
  { code: 1 },
  { unique: true, sparse: true }
);

// Text search
supplierSchema.index({ name: "text" });


// VALIDATION


// Phải có ít nhất phone hoặc email
supplierSchema.pre("save", function (next) {
  if (!this.phone && !this.email) {
    return next(new Error("Phải có ít nhất số điện thoại hoặc email"));
  }
  next();
});


// EXPORT

const SupplierModel = mongoose.model("suppliers", supplierSchema);
module.exports = SupplierModel;
