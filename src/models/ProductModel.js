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
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: [200, "Product name must be at most 200 characters"],
    },


    short_desc: {
      type: String,
      default: "",
      trim: true,
      maxlength: [200, "short_desc must be at most 200 characters"],
    },


    price: { type: Number, required: true, min: 0 }, // Giá bán


    // ✅ Giá nhập hàng (từ supplier) - tự động sync từ Supplier.purchaseCosts
    purchasePrice: {
      type: Number,
      default: 0,
      min: 0,
    },


    // Admin set lúc tạo
    plannedQuantity: {
      type: Number,
      required: true,
      min: 0,
      validate: {
        validator: Number.isInteger,
        message: "plannedQuantity must be an integer",
      },
    },


    // Cộng dồn từ các phiếu nhập
    receivedQuantity: {
      type: Number,
      default: 0,
      min: 0,
      validate: {
        validator: Number.isInteger,
        message: "receivedQuantity must be an integer",
      },
    },


    // Tồn thực tế
    onHandQuantity: {
      type: Number,
      default: 0,
      min: 0,
      validate: {
        validator: Number.isInteger,
        message: "onHandQuantity must be an integer",
      },
    },


    // ✅ Số kg đã phân bổ cho đặt trước (pre-order). Dùng để hiển thị "trừ" khỏi stock khả dụng.
    preOrderAllocatedKg: {
      type: Number,
      default: 0,
      min: 0,
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
        message: "Number of images must not exceed 10",
      },
    },
    imagePublicIds: {
      type: [{ type: String, trim: true }],
      validate: {
        validator: function (v) {
          return v.length <= 10;
        },
        message: "Number of imagePublicIds must not exceed 10",
      },
    },


    // Đánh giá sản phẩm
    avgRating: {
      type: Number,
      default: 0,
      min: 0,
      max: 5,
    },
    reviewCount: {
      type: Number,
      default: 0,
      min: 0,
    },


    brand: { type: String, required: true, trim: true }, // ✅ Bắt buộc phải có brand (tên nhà cung cấp)
    // ✅ Liên kết đến Supplier (tự động set khi admin chọn brand)
    supplier: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "suppliers",
      index: true,
    },


    // Số lô (tăng dần mỗi lần reset để nhập lô mới)
    batchNumber: {
      type: Number,
      default: 1,
      min: 1,
    },


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
      match: [/^\d{4}-\d{2}-\d{2}$/, "warehouseEntryDateStr must be in YYYY-MM-DD format"],
    },


    // Ngày hết hạn (nhân viên kho nhập khi nhập hàng) - Date object
    expiryDate: {
      type: Date,
      default: null,
    },


    // ✅ Date-only string (YYYY-MM-DD) theo timezone Asia/Ho_Chi_Minh để tránh timezone issues
    expiryDateStr: {
      type: String,
      default: null,
      match: [/^\d{4}-\d{2}-\d{2}$/, "expiryDateStr must be in YYYY-MM-DD format"],
    },
    // ✅ Giá sắp hết hạn: còn ≤ nearExpiryDaysThreshold ngày thì bán với giá giảm (effectivePrice = price * (1 - nearExpiryDiscountPercent/100))
    nearExpiryDaysThreshold: {
      type: Number,
      default: 7,
      min: 0,
      validate: { validator: Number.isInteger, message: "nearExpiryDaysThreshold must be an integer" },
    },
    nearExpiryDiscountPercent: {
      type: Number,
      default: 50,
      min: 0,
      max: 100,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true }, // ✅ Enable virtuals khi convert sang JSON
    toObject: { virtuals: true }, // ✅ Enable virtuals khi convert sang Object
  }
);
// ✅ Unique constraint: không cho phép trùng (name + brand)
productSchema.index({ name: 1, brand: 1 }, { unique: true });
// Virtual: profit = price - purchasePrice
productSchema.virtual("profit").get(function () {
  return Math.max(0, (this.price || 0) - (this.purchasePrice || 0));
});
// Virtual: profitMargin = (price - purchasePrice) / price * 100 (%)
productSchema.virtual("profitMargin").get(function () {
  const price = this.price || 0;
  const purchasePrice = this.purchasePrice || 0;
  if (price === 0) return 0;
  return Math.round(((price - purchasePrice) / price) * 100 * 100) / 100; // Làm tròn 2 chữ số thập phân
});
// Tự cập nhật trạng thái khi lưu - Chuẩn hóa logic
productSchema.pre("save", async function (next) {
  try {
    const planned = this.plannedQuantity ?? 0;
    const received = this.receivedQuantity ?? 0;
    const onHand = this.onHandQuantity ?? 0;
    // ✅ Đảm bảo invariant: 0 ≤ onHandQuantity ≤ receivedQuantity ≤ plannedQuantity
    if (onHand < 0) {
      return next(new Error("onHandQuantity cannot be negative"));
    }
    if (received < 0) {
      return next(new Error("receivedQuantity cannot be negative"));
    }
    if (onHand > received) {
      return next(new Error("onHandQuantity cannot exceed receivedQuantity"));
    }
    if (received > planned) {
      return next(new Error("receivedQuantity cannot exceed plannedQuantity"));
    }
    // ✅ Chuẩn hóa receivingStatus
    if (received === 0) {
      this.receivingStatus = "NOT_RECEIVED";
    } else if (received < planned) {
      this.receivingStatus = "PARTIAL";
    } else {
      this.receivingStatus = "RECEIVED";
    }
    // ✅ Chuẩn hóa stockStatus
    if (onHand > 0) {
      this.stockStatus = "IN_STOCK";
    } else {
      this.stockStatus = "OUT_OF_STOCK";
    }
    const imagesLength = Array.isArray(this.images) ? this.images.length : 0;
    const imagePublicIdsLength = Array.isArray(this.imagePublicIds) ? this.imagePublicIds.length : 0;
    if (imagesLength !== imagePublicIdsLength) {
      return next(new Error("Number of images and imagePublicIds must match"));
    }
    // ✅ Unique (name + brand): reject duplicate before save
    if (this.isModified("name") || this.isModified("brand")) {
      const nameStr = (this.name && this.name.toString()) ? this.name.toString().trim() : "";
      const brandStr = (this.brand && this.brand.toString()) ? this.brand.toString().trim() : "";
      if (nameStr && brandStr) {
        const existing = await this.constructor.findOne({
          name: nameStr,
          brand: brandStr,
          _id: { $ne: this._id },
        });
        if (existing) {
          return next(new Error("Product name with this brand already exists"));
        }
      }
    }
    if (this.isModified("warehouseEntryDate")) {
      this.warehouseEntryDateStr = this.warehouseEntryDate ? makeVNDateStr(this.warehouseEntryDate) : null;
    } else if (this.warehouseEntryDate && !this.warehouseEntryDateStr) {
      this.warehouseEntryDateStr = makeVNDateStr(this.warehouseEntryDate);
    }
    if (this.isModified("expiryDate")) {
      this.expiryDateStr = this.expiryDate ? makeVNDateStr(this.expiryDate) : null;
    } else if (this.expiryDate && !this.expiryDateStr) {
      this.expiryDateStr = makeVNDateStr(this.expiryDate);
    }
    next();
  } catch (err) {
    next(err);
  }
});
module.exports = mongoose.model("products", productSchema);