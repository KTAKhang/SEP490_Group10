const mongoose = require("mongoose");

const inventoryTransactionSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: "products", required: true, index: true },

    type: {
      type: String,
      enum: ["RECEIPT", "ISSUE", "RESERVE", "RELEASE", "ADJUST"],
      required: true,
      index: true,
    },

    // ✅ quantityG (gram) - luôn là số dương integer; hệ thống hiểu tăng/giảm theo type
    quantityG: {
      type: Number,
      required: true,
      min: 1,
      validate: {
        validator: Number.isInteger,
        message: "quantityG phải là số nguyên (gram)",
      },
    },

    // ai thao tác (user)
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "users", required: true, index: true },

    note: { type: String, default: "", trim: true },

    // tuỳ chọn: liên kết tới order/shipment/receipt bên nghiệp vụ sale
    referenceType: { type: String, default: "", trim: true },
    referenceId: { type: mongoose.Schema.Types.ObjectId, default: null },
  },
  { timestamps: true }
);

inventoryTransactionSchema.index({ product: 1, createdAt: -1 });

module.exports = mongoose.model("inventory_transactions", inventoryTransactionSchema);
