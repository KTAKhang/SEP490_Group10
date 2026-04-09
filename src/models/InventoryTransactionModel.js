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

    // quantity is always positive; sign implied by type
    quantity: {
      type: Number,
      required: true,
      min: 1,
      validate: {
        validator: Number.isInteger,
        message: "quantity must be an integer",
      },
    },

    // actor (user)
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "users", required: true, index: true },

    note: { type: String, default: "", trim: true },

    // optional: link to order/shipment/receipt in sales flow
    referenceType: { type: String, default: "", trim: true },
    referenceId: { type: mongoose.Schema.Types.ObjectId, default: null },

    // ✅ Harvest batch when receiving from a harvest batch
    // NOTE: For RECEIPT, if product has a supplier, harvestBatch is required — validated in InventoryTransactionService.createReceipt
    harvestBatch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "harvest_batches",
      default: null,
      index: true,
    },
  },
  { timestamps: true }
);

// Index: product + time
inventoryTransactionSchema.index({ product: 1, createdAt: -1 });

// Composite index: RECEIPT by harvest batch (receipt history from harvest)
inventoryTransactionSchema.index({ harvestBatch: 1, type: 1, createdAt: -1 });

module.exports = mongoose.model("inventory_transactions", inventoryTransactionSchema);
