const mongoose = require("mongoose");

/**
 * PreOrderAllocation – Số kg admin đã phân bổ trả đơn cho từng FruitType.
 * Nguồn hàng lấy từ PreOrderStock (kho trả đơn), không dùng Product.
 */
const preOrderAllocationSchema = new mongoose.Schema(
  {
    fruitTypeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "fruit_types",
      required: true,
      unique: true,
      index: true,
    },
    allocatedKg: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  { timestamps: true }
);

const PreOrderAllocationModel = mongoose.model(
  "pre_order_allocations",
  preOrderAllocationSchema
);
module.exports = PreOrderAllocationModel;
