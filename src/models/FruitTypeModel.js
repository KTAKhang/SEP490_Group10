const mongoose = require("mongoose");

/**
 * FruitType - Pre-order item type (e.g. "Cam Sành").
 * NOT a Product. NOT tied to HarvestBatch or Supplier.
 * Used only for pre-order business commitment.
 */
const fruitTypeSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: [100, "Tên không được vượt quá 100 ký tự"],
    },
    description: {
      type: String,
      default: "",
      trim: true,
      maxlength: [500, "Mô tả không được vượt quá 500 ký tự"],
    },
    estimatedPrice: {
      type: Number,
      required: true,
      min: 0,
    },
    minOrderKg: {
      type: Number,
      required: true,
      min: 0,
    },
    maxOrderKg: {
      type: Number,
      required: true,
      min: 0,
    },
    estimatedHarvestDate: {
      type: Date,
      default: null,
    },
    allowPreOrder: {
      type: Boolean,
      default: true,
    },
    /** Phần trăm tiền cọc khi đặt (50 = cọc nửa giá, 100 = thanh toán full lúc đặt). */
    depositPercent: {
      type: Number,
      default: 50,
      min: 0,
      max: 100,
    },
    status: {
      type: String,
      enum: ["ACTIVE", "INACTIVE"],
      default: "ACTIVE",
      index: true,
    },
    image: { type: String, trim: true, default: null },
    imagePublicId: { type: String, trim: true, default: null },
  },
  { timestamps: true }
);

const FruitTypeModel = mongoose.model("fruit_types", fruitTypeSchema);
module.exports = FruitTypeModel;
