const mongoose = require("mongoose");

const shopSchema = new mongoose.Schema(
  {
    shopName: {
      type: String,
      required: true,
      trim: true,
    },
    address: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      default: "",
      trim: true,
      lowercase: true,
    },
    phone: {
      type: String,
      default: "",
      trim: true,
    },
    description: {
      type: String,
      default: "",
      maxlength: [5000, "Description must be at most 5000 characters"],
    },
    workingHours: {
      type: String,
      default: "",
      trim: true,
    },
    images: [{ type: String, trim: true }],
    imagePublicIds: [{ type: String, trim: true }],
  },
  { timestamps: true }
);

// Pre-save hook to ensure only one shop exists
// Note: We don't need an index on _id because MongoDB already has a unique index on _id by default
shopSchema.pre("save", async function (next) {
  // Only allow saving if this is the first document or updating existing
  if (this.isNew) {
    const count = await this.constructor.countDocuments();
    if (count > 0) {
      return next(new Error("Only one shop record is allowed"));
    }
  }
  next();
});

module.exports = mongoose.model("shops", shopSchema);
