const mongoose = require("mongoose");

const shippingRuleSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ["IN_PROVINCE", "OUT_PROVINCE"],
    required: true,
  },

  province: {
    type: String,
    required: true, // ví dụ: "Cần Thơ"
  },

  baseWeight: {
    type: Number,
    required: true, // kg (ví dụ: 1kg)
  },

  basePrice: {
    type: Number,
    required: true, // tiền cho baseWeight
  },

  extraPricePerKg: {
    type: Number,
    required: true, // tiền mỗi kg vượt
  },

}, { timestamps: true });

module.exports = mongoose.model("shipping_rules", shippingRuleSchema);
