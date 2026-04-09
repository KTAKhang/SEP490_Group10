const mongoose = require("mongoose");

/**
 * Supplier schema
 * - Multiple products per supplier
 * - Fits produce / traceability workflows
 */

const supplierSchema = new mongoose.Schema(
  {
    // ========================
    // Core fields
    // ========================
    name: {
      type: String,
      required: [true, "Supplier name is required"],
      trim: true,
      minlength: [2, "Supplier name must be at least 2 characters"],
      maxlength: [100, "Supplier name must be at most 100 characters"],
      index: true,
    },

    type: {
      type: String,
      enum: ["FARM", "COOPERATIVE", "BUSINESS"],
      required: [true, "Supplier type is required"],
      index: true,
    },

    // Supplier code (auto-generated, not user-editable)
    code: {
      type: String,
      trim: true,
      uppercase: true,
      maxlength: [20, "Supplier code must be at most 20 characters"],
      immutable: true,
    },

    // ========================
    // Contact
    // ========================
    contactPerson: {
      type: String,
      trim: true,
      maxlength: [50, "Contact person name must be at most 50 characters"],
    },

    phone: {
      type: String,
      trim: true,
      match: [/^[0-9+\-\s()]+$/, "Invalid phone number format"],
    },

    email: {
      type: String,
      trim: true,
      lowercase: true,
      match: [/\S+@\S+\.\S+/, "Invalid email format"],
    },

    address: {
      type: String,
      trim: true,
      maxlength: [500, "Address must be at most 500 characters"],
    },

    // Cooperation status
    cooperationStatus: {
      type: String,
      enum: ["ACTIVE", "TERMINATED"],
      default: "ACTIVE",
      index: true,
    },

    // Map productId -> purchasePrice (ProductService, SupplierService)
    purchaseCosts: {
      type: Map,
      of: Number,
      default: () => new Map(),
    },

    // Supplied products (line items)
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
    // Stats
    // ========================
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

    // Notes & active flag
    notes: {
      type: String,
      trim: true,
      maxlength: [1000, "Notes must be at most 1000 characters"],
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

// Unique name + phone when phone is present
supplierSchema.index(
  { name: 1, phone: 1 },
  { unique: true, sparse: true }
);

// Unique supplier code when present
supplierSchema.index(
  { code: 1 },
  { unique: true, sparse: true }
);

// Text search
supplierSchema.index({ name: "text" });


// VALIDATION


// At least phone or email (pre-save); create flow also requires both via SupplierService.createSupplier
const buildSupplierCode = async (supplierDoc) => {
  const typePrefix = {
    FARM: "F",
    COOPERATIVE: "C",
    BUSINESS: "B",
  }[supplierDoc.type] || "S";

  const today = new Date();
  const dateStr = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}`;

  const Model = supplierDoc.constructor;
  const lastSupplier = await Model.findOne({
    code: { $regex: `^${typePrefix}${dateStr}` },
  })
    .sort({ code: -1 })
    .select("code")
    .lean();

  let sequence = 1;
  if (lastSupplier?.code) {
    const lastSeq = parseInt(lastSupplier.code.slice(-3)) || 0;
    sequence = lastSeq + 1;
  }

  let code = `${typePrefix}${dateStr}${String(sequence).padStart(3, "0")}`;
  while (await Model.findOne({ code }).select("_id").lean()) {
    sequence += 1;
    code = `${typePrefix}${dateStr}${String(sequence).padStart(3, "0")}`;
  }

  return code;
};

supplierSchema.pre("save", async function (next) {
  const phoneOk = this.phone != null && String(this.phone).trim() !== "";
  const emailOk = this.email != null && String(this.email).trim() !== "";
  if (this.isNew) {
    if (!phoneOk || !emailOk) {
      return next(new Error("Phone number and email are both required"));
    }
  } else if (!phoneOk && !emailOk) {
    return next(new Error("At least one phone number or email is required"));
  }

  if (this.isNew) {
    this.code = await buildSupplierCode(this);
  }

  if (!this.isNew && this.isModified("code")) {
    return next(new Error("Supplier code cannot be modified after creation"));
  }

  next();
});


// EXPORT

const SupplierModel = mongoose.model("suppliers", supplierSchema);
module.exports = SupplierModel;
