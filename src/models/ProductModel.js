const mongoose = require("mongoose");

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },

    short_desc: {
      type: String,
      default: "",
      trim: true,
      maxlength: [200, "short_desc must be at most 200 characters"],
    },

    price: { type: Number, required: true, min: 0 },

    // Admin set lúc tạo
    plannedQuantity: { type: Number, required: true, min: 0 },

    // Cộng dồn từ các phiếu nhập
    receivedQuantity: { type: Number, default: 0, min: 0 },

    // Tồn thực tế
    onHandQuantity: { type: Number, default: 0, min: 0 },

    // Giữ hàng cho đơn (nếu bạn có flow đặt hàng)
    reservedQuantity: { type: Number, default: 0, min: 0 },

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

    images: [{ type: String, trim: true }],
    imagePublicIds: [{ type: String, trim: true }],

    brand: { type: String, default: "", trim: true },

    detail_desc: {
      type: String,
      default: "",
      trim: true,
      maxlength: [1000, "detail_desc must be at most 1000 characters"],
    },

    status: { type: Boolean, default: true }, // bật/tắt hiển thị

    // Ngày nhập kho (tự động ghi nhận khi nhập kho lần đầu)
    warehouseEntryDate: {
      type: Date,
      default: null,
    },

    // Số ngày hạn sử dụng (nhân viên kho nhập khi nhập hàng)
    shelfLifeDays: {
      type: Number,
      default: null,
      min: [1, "Số ngày hạn sử dụng phải lớn hơn 0"],
    },

    // Ngày hết hạn (tính từ warehouseEntryDate + shelfLifeDays)
    expiryDate: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

// Virtual: available = onHand - reserved
productSchema.virtual("availableQuantity").get(function () {
  return Math.max(0, (this.onHandQuantity || 0) - (this.reservedQuantity || 0));
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

// Tự cập nhật trạng thái khi lưu
productSchema.pre("save", function (next) {
  const planned = this.plannedQuantity ?? 0;
  const received = this.receivedQuantity ?? 0;

  if (received <= 0) this.receivingStatus = "NOT_RECEIVED";
  else if (received < planned) this.receivingStatus = "PARTIAL";
  else this.receivingStatus = "RECEIVED";

  this.stockStatus = (this.onHandQuantity ?? 0) > 0 ? "IN_STOCK" : "OUT_OF_STOCK";

  // Safety: reserved không được vượt onHand
  if ((this.reservedQuantity ?? 0) > (this.onHandQuantity ?? 0)) {
    return next(new Error("reservedQuantity cannot exceed onHandQuantity"));
  }

  next();
});

module.exports = mongoose.model("products", productSchema);
