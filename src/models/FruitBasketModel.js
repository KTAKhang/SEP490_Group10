const mongoose = require("mongoose");

const fruitBasketItemSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "products",
      required: true,
    },
    quantity: {
      type: Number,
      default: 1,
      min: 1,
      max: 10,
      validate: {
        validator: Number.isInteger,
        message: "quantity phải là số nguyên",
      },
    },
  },
  { _id: false }
);

const fruitBasketSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Tên giỏ trái cây là bắt buộc"],
      trim: true,
      maxlength: [150, "Tên giỏ trái cây không được vượt quá 150 ký tự"],
    },
    short_desc: {
      type: String,
      default: "",
      trim: true,
      maxlength: [200, "short_desc must be at most 200 characters"],
    },
    detail_desc: {
      type: String,
      default: "",
      trim: true,
      maxlength: [1000, "detail_desc must be at most 1000 characters"],
    },
    images: {
      type: [{ type: String, trim: true }],
      validate: {
        validator: function (v) {
          return v.length <= 10;
        },
        message: "Số lượng ảnh không được vượt quá 10",
      },
    },
    imagePublicIds: {
      type: [{ type: String, trim: true }],
      validate: {
        validator: function (v) {
          return v.length <= 10;
        },
        message: "Số lượng imagePublicIds không được vượt quá 10",
      },
    },
    items: {
      type: [fruitBasketItemSchema],
      validate: {
        validator: function (v) {
          return Array.isArray(v) && v.length >= 1 && v.length <= 5;
        },
        message: "Giỏ trái cây phải có từ 1 đến 5 loại trái cây",
      },
    },
    status: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

// Unique constraint: không cho trùng tên giỏ trái cây
fruitBasketSchema.index({ name: 1 }, { unique: true });

module.exports = mongoose.model("fruit_baskets", fruitBasketSchema);
