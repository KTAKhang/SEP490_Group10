// models/ChatRoomModel.js
const mongoose = require("mongoose");

const chatRoomSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      required: true,
    },
    staff: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      required: true,
    },
    lastMessage: String,

    unreadByStaff: {
      type: Number,
      default: 0,
    },
    unreadByUser: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

// ❗ Không cho tạo trùng room
chatRoomSchema.index({ user: 1, staff: 1 }, { unique: true });

module.exports = mongoose.model("chat_rooms", chatRoomSchema);
