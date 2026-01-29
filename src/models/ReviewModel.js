const mongoose = require("mongoose");

const reviewSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      required: true,
      index: true,
    },
    product_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "products",
      required: true,
      index: true,
    },
    order_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "orders",
      required: true,
      index: true,
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
      validate: {
        validator: Number.isInteger,
        message: "rating phải là số nguyên",
      },
    },
    comment: {
      type: String,
      trim: true,
      maxlength: [1000, "Comment không được vượt quá 1000 ký tự"],
      default: "",
    },
    images: {
      type: [{ type: String, trim: true }],
      validate: {
        validator: function (v) {
          return v.length <= 3;
        },
        message: "Số lượng ảnh review không được vượt quá 3",
      },
      default: [],
    },
    imagePublicIds: {
      type: [{ type: String, trim: true }],
      validate: {
        validator: function (v) {
          return v.length <= 3;
        },
        message: "Số lượng imagePublicIds không được vượt quá 3",
      },
      default: [],
    },
    status: {
      type: String,
      enum: ["VISIBLE", "HIDDEN"],
      default: "VISIBLE",
      index: true,
    },
    editedCount: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { timestamps: true }
);

reviewSchema.index({ order_id: 1, product_id: 1, user_id: 1 }, { unique: true });
reviewSchema.index({ product_id: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model("reviews", reviewSchema);
