const mongoose = require("mongoose");

const newsSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Tiêu đề là bắt buộc"],
      trim: true,
      minlength: [10, "Tiêu đề phải có ít nhất 10 ký tự"],
      maxlength: [200, "Tiêu đề không được vượt quá 200 ký tự"],
    },
    content: {
      type: String,
      required: [true, "Nội dung là bắt buộc"],
      trim: true,
      minlength: [100, "Nội dung phải có ít nhất 100 ký tự"],
    },
    excerpt: {
      type: String,
      trim: true,
      minlength: [50, "Excerpt phải có ít nhất 50 ký tự"],
      maxlength: [500, "Excerpt không được vượt quá 500 ký tự"],
    },
    thumbnail_url: {
      type: String,
      required: [true, "Ảnh thumbnail là bắt buộc"],
      trim: true,
    },
    thumbnailPublicId: {
      type: String,
      trim: true,
    },
    author_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      required: [true, "Author là bắt buộc"],
      index: true,
    },
    status: {
      type: String,
      enum: ["DRAFT", "PUBLISHED"],
      default: "DRAFT",
      index: true,
    },
    view_count: {
      type: Number,
      default: 0,
      min: 0,
    },
    is_featured: {
      type: Boolean,
      default: false,
      index: true,
    },
    published_at: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

// Index for trending query
newsSchema.index({ status: 1, published_at: -1, view_count: -1 });

// Auto-generate excerpt from content if not provided
newsSchema.pre("save", function (next) {
  // Strip HTML tags helper
  const stripHTML = (html) => {
    if (!html) return "";
    return html.replace(/<[^>]*>/g, "").trim();
  };

  // Auto-generate excerpt if not provided and content exists
  if (!this.excerpt && this.content) {
    const plainText = stripHTML(this.content);
    if (plainText.length > 200) {
      this.excerpt = plainText.substring(0, 200) + "...";
    } else {
      this.excerpt = plainText;
    }
  }

  // Set published_at when status changes to PUBLISHED
  if (this.status === "PUBLISHED" && !this.published_at) {
    this.published_at = new Date();
  }

  // Clear published_at when status changes to DRAFT
  if (this.status === "DRAFT" && this.published_at) {
    this.published_at = null;
  }

  next();
});

module.exports = mongoose.model("news", newsSchema);
