const mongoose = require("mongoose");

const categorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      minlength: [1, "Category name cannot be empty"],
      maxlength: [100, "Category name must be at most 100 characters"],
    },
    description: {
      type: String,
      default: "",
      trim: true,
      maxlength: [500, "Category description must be at most 500 characters"],
    },
    image: { type: String, default: "", trim: true, maxlength: [2000, "Image URL must be at most 2000 characters"] },
    imagePublicId: { type: String, default: "", trim: true, maxlength: [500, "imagePublicId must be at most 500 characters"] },
    status: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("categories", categorySchema);
