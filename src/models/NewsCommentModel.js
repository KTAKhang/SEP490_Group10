const mongoose = require("mongoose");

const newsCommentSchema = new mongoose.Schema(
  {
    news_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "news",
      required: [true, "News ID là bắt buộc"],
      index: true,
    },
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      required: [true, "User ID là bắt buộc"],
      index: true,
    },
    parent_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "news_comments",
      default: null,
      index: true,
    },
    content: {
      type: String,
      required: [true, "Nội dung comment là bắt buộc"],
      trim: true,
      minlength: [5, "Nội dung comment phải có ít nhất 5 ký tự"],
      maxlength: [1000, "Nội dung comment không được vượt quá 1000 ký tự"],
      validate: {
        validator: function (value) {
          // Không cho phép HTML tags hoặc ký tự định dạng
          return !/<[^>]*>/.test(value);
        },
        message: "Comment không được chứa HTML tags hoặc ký tự định dạng",
      },
    },
    status: {
      type: String,
      enum: ["VISIBLE", "HIDDEN", "DELETED"],
      default: "VISIBLE",
      index: true,
    },
    is_edited: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

// Compound index for querying comments by news and parent
newsCommentSchema.index({ news_id: 1, parent_id: 1, createdAt: 1 });

// Index for spam prevention (user_id + news_id + createdAt)
newsCommentSchema.index({ user_id: 1, news_id: 1, createdAt: -1 });

module.exports = mongoose.model("news_comments", newsCommentSchema);
