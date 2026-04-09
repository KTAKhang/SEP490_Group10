const mongoose = require("mongoose");


const productBatchHistorySchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "products",
      required: true,
      index: true,
    },

    // Snapshot at batch close (unchanged if product is edited later)
    productNameSnapshot: { type: String, trim: true, default: "" },
    productCategoryNameSnapshot: { type: String, trim: true, default: "" },
    productBrandSnapshot: { type: String, trim: true, default: "" },
    // Full product payload at batch close (standalone copy, not a Product ref)
    productSnapshot: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },

    // ✅ Optional link to harvest batch
    harvestBatch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "harvest_batches",
      default: null,
      index: true,
    },


    // Batch sequence number (increments on each reset)
    batchNumber: {
      type: Number,
      required: true,
      min: 1,
    },


    // Planned quantity
    plannedQuantity: {
      type: Number,
      required: true,
      min: 0,
    },


    // Quantity received into warehouse
    receivedQuantity: {
      type: Number,
      required: true,
      min: 0,
    },


    // Quantity sold (sum of ISSUE txs from warehouseEntryDate through completedDate)
    soldQuantity: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },


    // Discarded quantity (e.g. expired) = receivedQuantity - soldQuantity
    discardedQuantity: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },


    // Warehouse entry date
    warehouseEntryDate: {
      type: Date,
      required: true,
    },


    warehouseEntryDateStr: {
      type: String,
      required: true,
      match: [/^\d{4}-\d{2}-\d{2}$/, "warehouseEntryDateStr must be YYYY-MM-DD"],
    },


    // Expiry date
    expiryDate: {
      type: Date,
      default: null,
    },


    expiryDateStr: {
      type: String,
      default: null,
      match: [/^\d{4}-\d{2}-\d{2}$/, "expiryDateStr must be YYYY-MM-DD"],
    },


    // Batch completion date (sold out or expired)
    completedDate: {
      type: Date,
      required: true,
    },


    completedDateStr: {
      type: String,
      required: true,
      match: [/^\d{4}-\d{2}-\d{2}$/, "completedDateStr must be YYYY-MM-DD"],
    },


    // Completion reason: "SOLD_OUT" | "EXPIRED"
    completionReason: {
      type: String,
      enum: ["SOLD_OUT", "EXPIRED"],
      required: true,
    },
    // ✅ Unit cost / sell price at batch close (revenue, gross margin, loss)
    unitCostPrice: {
      type: Number,
      default: 0,
      min: 0,
    },
    unitSellPrice: {
      type: Number,
      default: 0,
      min: 0,
    },
    // ✅ Clearance / discount: revenue and qty from orders in the batch period
    actualRevenue: {
      type: Number,
      default: 0,
      min: 0,
    },
    clearanceQuantity: {
      type: Number,
      default: 0,
      min: 0,
    },
    clearanceRevenue: {
      type: Number,
      default: 0,
      min: 0,
    },
    fullPriceQuantity: {
      type: Number,
      default: 0,
      min: 0,
    },
    fullPriceRevenue: {
      type: Number,
      default: 0,
      min: 0,
    },
    // Status: always "COMPLETED"
    status: {
      type: String,
      enum: ["COMPLETED"],
      default: "COMPLETED",
    },
  },
  { timestamps: true }
);
// Indexes for common queries
productBatchHistorySchema.index({ product: 1, batchNumber: -1 });
productBatchHistorySchema.index({ product: 1, completedDate: -1 });
productBatchHistorySchema.index({ completionReason: 1 });
// harvestBatch field index declared on the field above
module.exports = mongoose.model("product_batch_histories", productBatchHistorySchema);