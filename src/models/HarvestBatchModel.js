const mongoose = require("mongoose");


const harvestBatchSchema = new mongoose.Schema(
  {
    supplier: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "suppliers",
      required: [true, "Supplier is required"],
      index: true,
    },


    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "products",
      required: false,
      default: null,
      index: true,
    },
    /** True = pre-order harvest batch (product null, fruitTypeId required); receivedQuantity stays 0, received at Pre-order Import. */
    isPreOrderBatch: {
      type: Boolean,
      default: false,
      index: true,
    },
    /** Required when isPreOrderBatch is true; links to fruit_types for pre-order fulfillment. */
    fruitTypeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "fruit_types",
      required: false,
      default: null,
      index: true,
    },


    // ✅ BR-SUP-11: Harvest batch code (auto-generated, unique, required)
    batchCode: {
      type: String,
      trim: true,
      uppercase: true,
      unique: true,
      required: false, // ✅ Always populated on save via pre hook
      maxlength: [30, "Harvest batch code must be at most 30 characters"],
      immutable: true,
    },


    batchNumber: {
      type: String,
      required: [true, "Harvest batch number is required"],
      trim: true,
    },


    harvestDate: {
      type: Date,
      required: [true, "Harvest date is required"],
    },


    harvestDateStr: {
      type: String,
      match: [/^\d{4}-\d{2}-\d{2}$/, "harvestDateStr must be YYYY-MM-DD"],
    },
    // ✅ Quantity received into warehouse
    receivedQuantity: {
      type: Number,
      default: 0,
      min: 0,
      validate: {
        validator: Number.isInteger,
        message: "receivedQuantity must be an integer",
      },
    },
    location: {
      type: String,
      trim: true,
      maxlength: [200, "Harvest location must be at most 200 characters"],
      // ✅ BR-SUP-10: Location (growing area) recommended but optional
    },
    notes: {
      type: String,
      trim: true,
      maxlength: [500, "Notes must be at most 500 characters"],
      default: "",
    },


    // ✅ Linked inventory transaction IDs
    inventoryTransactionIds: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: "inventory_transactions",
      default: [],
    },
    /**
     * receiptEligible: Only batches with true may be selected for warehouse receipt.
     * false = cannot select this batch when creating a receipt.
     */
    receiptEligible: {
      type: Boolean,
      default: true,
    },
    /**
     * visibleInReceipt: Show/hide in batch picker when receiving stock.
     * false = hidden from dropdown (e.g. already received) to reduce clutter for warehouse staff.
     * Set false after the batch has been received.
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
// ✅ Unique for product batches: (supplier, product, batchNumber, harvestDate)
harvestBatchSchema.index(
  { supplier: 1, product: 1, batchNumber: 1, harvestDate: 1 },
  { unique: true, partialFilterExpression: { product: { $exists: true, $ne: null } } }
);
// ✅ Unique for pre-order batches: (supplier, fruitTypeId, batchNumber, harvestDate)
harvestBatchSchema.index(
  { supplier: 1, fruitTypeId: 1, batchNumber: 1, harvestDate: 1 },
  { unique: true, partialFilterExpression: { isPreOrderBatch: true } }
);
// Pre-save hook
harvestBatchSchema.pre("save", function (next) {
  // ✅ BR-SUP-12: harvestDate must not be after today
  if (this.isModified("harvestDate") && this.harvestDate) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const harvestDate = new Date(this.harvestDate);
    harvestDate.setHours(0, 0, 0, 0);
   
    if (harvestDate > today) {
      return next(new Error("Harvest date cannot be after today"));
    }
    // Sync harvestDateStr
    const d = new Date(this.harvestDate);
    const vnDate = new Date(d.toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" }));
    const year = vnDate.getFullYear();
    const month = String(vnDate.getMonth() + 1).padStart(2, "0");
    const day = String(vnDate.getDate()).padStart(2, "0");
    this.harvestDateStr = `${year}-${month}-${day}`;
  }
  // ✅ BR-SUP-11: Auto-generate batchCode on insert
  if (this.isNew) {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    this.batchCode = `HB-${timestamp}-${random}`;
  }
  // ✅ BR-SUP-11: batchCode is immutable after create
  if (!this.isNew && this.isModified("batchCode")) {
    return next(new Error("Harvest batch code cannot be changed after creation"));
  }
  // ✅ Validation: receivedQuantity >= 0
  if (this.isModified("receivedQuantity") && this.receivedQuantity !== undefined) {
    if (this.receivedQuantity < 0) {
      return next(new Error("receivedQuantity cannot be negative"));
    }
  }
  next();
});
const HarvestBatchModel = mongoose.model("harvest_batches", harvestBatchSchema);
module.exports = HarvestBatchModel;
