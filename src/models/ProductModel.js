const mongoose = require("mongoose");

// ✅ Helper: Format Date thành string YYYY-MM-DD theo timezone Asia/Ho_Chi_Minh (DRY)
const makeVNDateStr = (date) => {
  if (!date) return null;
  const d = new Date(date);
  const vnDate = new Date(d.toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" }));
  const year = vnDate.getFullYear();
  const month = String(vnDate.getMonth() + 1).padStart(2, "0");
  const day = String(vnDate.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },

    short_desc: {
      type: String,
      default: "",
      trim: true,
      maxlength: [200, "short_desc must be at most 200 characters"],
    },

    // ✅ Giá theo VNĐ/kg (integer để tránh float)
    pricePerKg: {
      type: Number,
      required: true,
      min: 0,
      validate: {
        validator: Number.isInteger,
        message: "pricePerKg phải là số nguyên (VNĐ/kg)",
      },
    },

    // ✅ Bước mua tối thiểu (gram) - ví dụ: 100g (0.1kg) hoặc 500g (0.5kg)
    minOrderQuantityG: {
      type: Number,
      default: 100, // Mặc định 0.1kg
      min: 1,
      validate: {
        validator: Number.isInteger,
        message: "minOrderQuantityG phải là số nguyên (gram)",
      },
    },

    // ✅ Bước nhảy khi mua (gram) - ví dụ: 100g (chỉ mua được 0.1kg, 0.2kg, 0.3kg...)
    stepQuantityG: {
      type: Number,
      default: 100, // Mặc định 0.1kg
      min: 1,
      validate: {
        validator: Number.isInteger,
        message: "stepQuantityG phải là số nguyên (gram)",
      },
    },

    // ✅ Admin set lúc tạo (gram - integer)
    plannedQuantityG: {
      type: Number,
      required: true,
      min: 0,
      validate: {
        validator: Number.isInteger,
        message: "plannedQuantityG phải là số nguyên (gram)",
      },
    },

    // ✅ Cộng dồn từ các phiếu nhập (gram)
    receivedQuantityG: {
      type: Number,
      default: 0,
      min: 0,
      validate: {
        validator: Number.isInteger,
        message: "receivedQuantityG phải là số nguyên (gram)",
      },
    },

    // ✅ Tồn thực tế (gram)
    onHandQuantityG: {
      type: Number,
      default: 0,
      min: 0,
      validate: {
        validator: Number.isInteger,
        message: "onHandQuantityG phải là số nguyên (gram)",
      },
    },

    // ✅ Giữ hàng cho đơn (gram)
    reservedQuantityG: {
      type: Number,
      default: 0,
      min: 0,
      validate: {
        validator: Number.isInteger,
        message: "reservedQuantityG phải là số nguyên (gram)",
      },
    },

    receivingStatus: {
      type: String,
      enum: ["NOT_RECEIVED", "PARTIAL", "RECEIVED"], // Chưa nhập / Chưa đủ / Đã nhập đủ
      default: "NOT_RECEIVED",
      index: true,
    },

    stockStatus: {
      type: String,
      enum: ["IN_STOCK", "OUT_OF_STOCK"],
      default: "OUT_OF_STOCK",
      index: true,
    },

    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "categories",
      required: true,
      index: true,
    },

    images: {
      type: [{ type: String, trim: true }],
      validate: {
        validator: function (v) {
          return v.length <= 10;
        },
        message: "Số lượng ảnh không được vượt quá 10",
      },
    },
    imagePublicIds: {
      type: [{ type: String, trim: true }],
      validate: {
        validator: function (v) {
          return v.length <= 10;
        },
        message: "Số lượng imagePublicIds không được vượt quá 10",
      },
    },

    brand: { type: String, default: "", trim: true },

    detail_desc: {
      type: String,
      default: "",
      trim: true,
      maxlength: [1000, "detail_desc must be at most 1000 characters"],
    },

    status: { type: Boolean, default: true }, // bật/tắt hiển thị

    // Ngày nhập kho (tự động ghi nhận khi nhập kho lần đầu) - Date object
    warehouseEntryDate: {
      type: Date,
      default: null,
    },

    // ✅ Date-only string (YYYY-MM-DD) theo timezone Asia/Ho_Chi_Minh để tránh timezone issues
    warehouseEntryDateStr: {
      type: String,
      default: null,
      match: [/^\d{4}-\d{2}-\d{2}$/, "warehouseEntryDateStr phải có format YYYY-MM-DD"],
    },

    // Số ngày hạn sử dụng (nhân viên kho nhập khi nhập hàng)
    shelfLifeDays: {
      type: Number,
      default: null,
      min: [1, "Số ngày hạn sử dụng phải lớn hơn 0"],
      validate: {
        validator: function (v) {
          return v === null || Number.isInteger(v);
        },
        message: "shelfLifeDays phải là số nguyên",
      },
    },

    // Ngày hết hạn (tính từ warehouseEntryDate + shelfLifeDays) - Date object
    expiryDate: {
      type: Date,
      default: null,
    },

    // ✅ Date-only string (YYYY-MM-DD) theo timezone Asia/Ho_Chi_Minh để tránh timezone issues
    expiryDateStr: {
      type: String,
      default: null,
      match: [/^\d{4}-\d{2}-\d{2}$/, "expiryDateStr phải có format YYYY-MM-DD"],
    },
  },
  { timestamps: true }
);

// Virtual: available = onHand - reserved (gram)
productSchema.virtual("availableQuantityG").get(function () {
  return Math.max(0, (this.onHandQuantityG || 0) - (this.reservedQuantityG || 0));
});

// Virtual: availableQuantityKg (hiển thị cho UI)
productSchema.virtual("availableQuantityKg").get(function () {
  const availableG = this.availableQuantityG;
  return availableG / 1000;
});

// Method: Tính lại expiryDate từ warehouseEntryDate + shelfLifeDays
productSchema.methods.calculateExpiryDate = function () {
  if (this.warehouseEntryDate && this.shelfLifeDays) {
    const expiry = new Date(this.warehouseEntryDate);
    expiry.setDate(expiry.getDate() + this.shelfLifeDays);
    this.expiryDate = expiry;
  } else {
    this.expiryDate = null;
  }
};

// Tự cập nhật trạng thái khi lưu - Chuẩn hóa logic (dùng gram)
productSchema.pre("save", function (next) {
  const planned = this.plannedQuantityG ?? 0;
  const received = this.receivedQuantityG ?? 0;
  const onHand = this.onHandQuantityG ?? 0;
  const reserved = this.reservedQuantityG ?? 0;

  // ✅ Đảm bảo invariant: 0 ≤ onHandQuantityG ≤ receivedQuantityG ≤ plannedQuantityG
  if (onHand < 0) {
    return next(new Error("onHandQuantityG không được âm"));
  }
  if (received < 0) {
    return next(new Error("receivedQuantityG không được âm"));
  }
  if (onHand > received) {
    return next(new Error("onHandQuantityG không được vượt receivedQuantityG"));
  }
  if (received > planned) {
    return next(new Error("receivedQuantityG không được vượt plannedQuantityG"));
  }

  // ✅ Chuẩn hóa receivingStatus
  if (received === 0) {
    this.receivingStatus = "NOT_RECEIVED";
  } else if (received < planned) {
    this.receivingStatus = "PARTIAL";
  } else {
    // received === planned
    this.receivingStatus = "RECEIVED";
  }

  // ✅ Chuẩn hóa stockStatus
  if (onHand > 0) {
    this.stockStatus = "IN_STOCK";
  } else {
    // onHand === 0
    this.stockStatus = "OUT_OF_STOCK";
  }

  // ✅ Safety: reserved không được vượt onHand
  if (reserved > onHand) {
    return next(new Error("reservedQuantityG cannot exceed onHandQuantityG"));
  }

  // ✅ Validate minOrderQuantityG phải là bội của stepQuantityG (để đảm bảo logic bước nhảy đúng)
  if (this.minOrderQuantityG && this.stepQuantityG) {
    if (this.minOrderQuantityG % this.stepQuantityG !== 0) {
      return next(new Error("Số lượng đặt tối thiểu phải là bội của bước nhảy"));
    }
  }

  // ✅ Validate images.length === imagePublicIds.length
  const imagesLength = Array.isArray(this.images) ? this.images.length : 0;
  const imagePublicIdsLength = Array.isArray(this.imagePublicIds) ? this.imagePublicIds.length : 0;
  if (imagesLength !== imagePublicIdsLength) {
    return next(new Error("Số lượng images và imagePublicIds phải bằng nhau"));
  }

  // ✅ Tự động sync date string fields từ Date objects khi Date thay đổi
  // Xử lý cả case Date bị set về null
  if (this.isModified("warehouseEntryDate")) {
    this.warehouseEntryDateStr = this.warehouseEntryDate ? makeVNDateStr(this.warehouseEntryDate) : null;
  } else if (this.warehouseEntryDate && !this.warehouseEntryDateStr) {
    // Fallback: sync nếu Date có nhưng Str chưa có (cho data cũ)
    this.warehouseEntryDateStr = makeVNDateStr(this.warehouseEntryDate);
  }

  if (this.isModified("expiryDate")) {
    this.expiryDateStr = this.expiryDate ? makeVNDateStr(this.expiryDate) : null;
  } else if (this.expiryDate && !this.expiryDateStr) {
    // Fallback: sync nếu Date có nhưng Str chưa có (cho data cũ)
    this.expiryDateStr = makeVNDateStr(this.expiryDate);
  }

  next();
});

module.exports = mongoose.model("products", productSchema);
