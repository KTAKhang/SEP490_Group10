const mongoose = require("mongoose");

const categorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    description: { type: String, default: "", trim: true },
    image: { type: String, default: "", trim: true },
    imagePublicId: { type: String, default: "", trim: true },
    status: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("categories", categorySchema);
