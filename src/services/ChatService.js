const mongoose = require("mongoose");
const ChatRoom = require("../models/ChatRoomModel");
const Message = require("../models/MessageModel");
const { pickAvailableStaff } = require("../sockets/staffPool");

/**
 * Create or get room
 * 👉 KHÔNG cần staffId nữa
 */
const getOrCreateRoom = async (userId) => {
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new Error("Invalid userId");
  }

  // 1️⃣ Tìm room đã có
  let room = await ChatRoom.findOne({ user: userId });

  // 2️⃣ Chưa có → auto assign staff
  if (!room) {
    const staffId = pickAvailableStaff();
    if (!staffId) {
      throw new Error("Hiện không có staff online");
    }

    try {
      room = await ChatRoom.create({
        user: userId,
        staff: staffId,
        unreadByStaff: 0,
        unreadByUser: 0,
      });
    } catch (err) {
      // tránh race condition
      room = await ChatRoom.findOne({ user: userId });
    }
  }

  return room;
};

/**
 * Send message
 */
const sendMessage = async ({ roomId, senderId, senderRole, content }) => {
  if (
    !mongoose.Types.ObjectId.isValid(roomId) ||
    !mongoose.Types.ObjectId.isValid(senderId)
  ) {
    throw new Error("Invalid roomId or senderId");
  }

  if (!["customer", "feedbacked-staff", "admin"].includes(senderRole)) {
    throw new Error("Invalid senderRole");
  }

  const room = await ChatRoom.findById(roomId).populate(
    "user",
    "user_name avatar"
  );
  if (!room) throw new Error("Room not found");

  /* ======================
     1️⃣ CREATE MESSAGE
  ====================== */
  let message = await Message.create({
    room: roomId,
    sender: senderId,
    senderRole,
    content,
  });

  /* ======================
     2️⃣ UPDATE ROOM
  ====================== */
  const update = {
    lastMessage: content,
    updatedAt: new Date(),
  };

  if (senderRole === "customer") {
    update.unreadByStaff = (room.unreadByStaff || 0) + 1;
  } else {
    update.unreadByUser = (room.unreadByUser || 0) + 1;
  }

  await ChatRoom.findByIdAndUpdate(roomId, update);

  /* ======================
     3️⃣ POPULATE MESSAGE
  ====================== */
  message = await message.populate([
    { path: "sender", select: "user_name avatar" },
    {
      path: "room",
      populate: [
        { path: "user", select: "user_name avatar" },
        { path: "staff", select: "user_name avatar" },
      ],
    },
  ]);

  return message;
};

/**
 * Get messages by room (check quyền)
 */
const getMessagesByRoom = async (roomId, currentUserId) => {
  const room = await ChatRoom.findById(roomId);
  if (!room) throw new Error("Room not found");

  if (
    room.user.toString() !== currentUserId &&
    room.staff.toString() !== currentUserId
  ) {
    throw new Error("Forbidden");
  }

  return Message.find({ room: roomId })
    .populate("sender", "user_name avatar")
    .sort({ createdAt: 1 });
};

/**
 * Mark read
 */
const markAsRead = async (roomId, role) => {
  if (role === "customer") {
    await ChatRoom.findByIdAndUpdate(roomId, { unreadByUser: 0 });
  } else {
    await ChatRoom.findByIdAndUpdate(roomId, { unreadByStaff: 0 });
  }
};

/**
 * Get staff rooms
 */
const getRoomsByStaff = async (staffId) => {
  return ChatRoom.find({ staff: staffId })
    .populate("user", "user_name avatar email")
    .sort({ updatedAt: -1 });
};

module.exports = {
  getOrCreateRoom,
  sendMessage,
  getMessagesByRoom,
  getRoomsByStaff,
  markAsRead,
};
