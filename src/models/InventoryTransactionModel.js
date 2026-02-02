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

    // quantity luôn là số dương; hệ thống hiểu tăng/giảm theo type
    quantity: {
      type: Number,
      required: true,
      min: 1,
      validate: {
        validator: Number.isInteger,
        message: "quantity phải là số nguyên",
      },
    },

    // ai thao tác (user)
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "users", required: true, index: true },

    note: { type: String, default: "", trim: true },

    // tuỳ chọn: liên kết tới order/shipment/receipt bên nghiệp vụ sale
    referenceType: { type: String, default: "", trim: true },
    referenceId: { type: mongoose.Schema.Types.ObjectId, default: null },

    // ✅ Liên kết với Harvest Batch (nếu nhập hàng từ lô thu hoạch)
    // LƯU Ý: Đối với RECEIPT transactions, nếu sản phẩm có supplier thì harvestBatch là BẮT BUỘC
    // Validation được xử lý ở service level (InventoryTransactionService.createReceipt)
    harvestBatch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "harvest_batches",
      default: null,
      index: true,
    },
  },
  { timestamps: true }
);

// Index cho query theo product và thời gian
inventoryTransactionSchema.index({ product: 1, createdAt: -1 });

// Index composite cho query RECEIPT transactions theo harvest batch (optimize query lịch sử nhập hàng từ lô thu hoạch)
inventoryTransactionSchema.index({ harvestBatch: 1, type: 1, createdAt: -1 });

module.exports = mongoose.model("inventory_transactions", inventoryTransactionSchema);
