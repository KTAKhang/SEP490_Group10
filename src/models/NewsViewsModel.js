const mongoose = require("mongoose");

const newsViewsSchema = new mongoose.Schema(
  {
    news_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "news",
      required: true,
      index: true,
    },
    ip_address: {
      type: String,
      required: true,
      index: true,
    },
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      default: null,
    },
    viewed_at: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  { timestamps: true }
);

// Compound index for checking duplicate views (news_id + ip_address + viewed_at)
newsViewsSchema.index({ news_id: 1, ip_address: 1, viewed_at: 1 });

module.exports = mongoose.model("newsviews", newsViewsSchema);
