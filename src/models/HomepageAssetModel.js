const mongoose = require("mongoose");

/**
 * Schema cho bảng HomepageAsset
 * Quản lý các hình ảnh cho homepage
 */
const homepageAssetSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: [true, "Key là bắt buộc"],
      unique: true,
      trim: true,
      enum: {
        values: [
          "heroBackground",
          "trustAvatar1",
          "trustAvatar2",
          "trustAvatar3",
          "testimonialImage",
          "testimonialImage2",
          "ctaImage",
          "logo",
        ],
        message:
          "Key phải là một trong các giá trị: heroBackground, trustAvatar1, trustAvatar2, trustAvatar3, testimonialImage, testimonialImage2, ctaImage, logo",
      },
    },
    imageUrl: {
      type: String,
      required: [true, "Image URL là bắt buộc"],
      trim: true,
      validate: {
        validator: function (value) {
          // Validate URL format
          try {
            new URL(value);
            return true;
          } catch {
            return false;
          }
        },
        message: "Image URL phải là một URL hợp lệ",
      },
    },
    altText: {
      type: String,
      trim: true,
      maxlength: [200, "Alt text không được vượt quá 200 ký tự"],
      default: "",
    },
  },
  {
    timestamps: true, // Tự động tạo createdAt và updatedAt
  }
);

// Không cần định nghĩa index riêng vì unique: true đã tự động tạo unique index

const HomepageAssetModel = mongoose.model("homepage_assets", homepageAssetSchema);
module.exports = HomepageAssetModel;
