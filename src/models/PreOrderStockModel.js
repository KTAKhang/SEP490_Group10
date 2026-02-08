const mongoose = require("mongoose");

/**
 * Kho trả đơn đặt trước – tồn theo từng FruitType, tách biệt Product.
 * receivedKg cộng dồn từ PreOrderReceive (warehouse staff nhập).
 * Admin phân bổ trả đơn từ đây, không lấy từ Product.
 */
const preOrderStockSchema = new mongoose.Schema(
  {
    fruitTypeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "fruit_types",
      required: true,
      unique: true,
      index: true,
    },
    receivedKg: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { timestamps: true }
);

const PreOrderStockModel = mongoose.model("pre_order_stocks", preOrderStockSchema);
module.exports = PreOrderStockModel;
