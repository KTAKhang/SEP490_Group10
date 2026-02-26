const mongoose = require("mongoose");
const ChatRoom = require("../models/ChatRoomModel");
const Message = require("../models/MessageModel");
const NotificationService = require("./NotificationService");

/**
 * Create or get room
 * 👉 KHÔNG cần staffId nữa
 */
const getOrCreateRoom = async (userId, staffId) => {
  // Validate userId
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new Error("Invalid userId");
  }

  // Validate staffId
  if (!staffId || !mongoose.Types.ObjectId.isValid(staffId)) {
    throw new Error("Invalid staffId");
  }

  // 1️⃣ Tìm room giữa USER và STAFF cụ thể này
  let room = await ChatRoom.findOne({ 
    user: userId,
    staff: staffId  // 🔥 QUAN TRỌNG: phải tìm theo CẢ user VÀ staff
  });

  // 2️⃣ Chưa có → tạo mới
  if (!room) {
    try {
      room = await ChatRoom.create({
        user: userId,
        staff: staffId,
        unreadByStaff: 0,
        unreadByUser: 0,
      });
      
      console.log("✅ Created new room:", {
        roomId: room._id,
        userId,
        staffId
      });
    } catch (err) {
      console.error("❌ Error creating room:", err);
      
      // Tránh race condition - thử tìm lại
      room = await ChatRoom.findOne({ 
        user: userId,
        staff: staffId 
      });
      
      if (!room) {
        throw new Error("Failed to create or find room");
      }
    }
  }

  return room;
};

/**
 * Send message
 */
const sendMessage = async ({
  roomId,
  senderId,
  senderRole,
  content,
  images = [],
  imagePublicIds = [],
}) => {
  /* ======================
     VALIDATION
  ====================== */
  if (
    !mongoose.Types.ObjectId.isValid(roomId) ||
    !mongoose.Types.ObjectId.isValid(senderId)
  ) {
    throw new Error("Invalid roomId or senderId");
  }

  if (!["customer", "feedbacked-staff", "admin"].includes(senderRole)) {
    throw new Error("Invalid senderRole");
  }

  if (!content && images.length === 0) {
    throw new Error("Message must have content or images");
  }

  if (images.length > 3) {
    throw new Error("Maximum 3 images allowed");
  }

  const room = await ChatRoom.findById(roomId).populate(
    "user",
    "user_name avatar"
  );

  if (!room) throw new Error("Room not found");

  /* ======================
     DETERMINE TYPE
  ====================== */
  let type = "text";

  if (images.length > 0 && content) type = "mixed";
  else if (images.length > 0) type = "image";

  /* ======================
     1️⃣ CREATE MESSAGE
  ====================== */
  let message = await Message.create({
    room: roomId,
    sender: senderId,
    senderRole,
    content,
    images,
    imagePublicIds,
    type,
  });

  /* ======================
     2️⃣ UPDATE ROOM
  ====================== */

  // Nếu có text thì lấy text làm lastMessage
  // Nếu chỉ có ảnh thì hiển thị "[Image]"
  let lastMessageText = content;

  if (!content && images.length > 0) {
    lastMessageText = "📷 Image";
  }

  const update = {
    lastMessage: lastMessageText,
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
const getMessagesByRoom = async (roomId, currentUserId, options = {}) => {
  const { limit = 6, before } = options;
  
  const room = await ChatRoom.findById(roomId);
  if (!room) throw new Error("Room not found");

  if (
    room.user.toString() !== currentUserId &&
    room.staff.toString() !== currentUserId
  ) {
    throw new Error("Forbidden");
  }

  // Build query
  const query = { room: roomId };
  
  // Nếu có before, chỉ lấy tin nhắn cũ hơn message đó
  if (before) {
    const beforeMessage = await Message.findById(before);
    if (beforeMessage) {
      query.createdAt = { $lt: beforeMessage.createdAt };
    }
  }

  // Lấy tin nhắn mới nhất trước (sort desc), sau đó reverse lại
  const messages = await Message.find(query)
    .populate("sender", "user_name avatar")
    .sort({ createdAt: -1 }) // Lấy tin mới nhất trước
    .limit(limit);

  // Đảo ngược để tin cũ nhất ở đầu, mới nhất ở cuối
  const sortedMessages = messages.reverse();

  // Check xem còn tin nhắn cũ hơn không
  const hasMore = messages.length === limit;
  const oldestMessageId = sortedMessages.length > 0 
    ? sortedMessages[0]._id 
    : null;

  return {
    messages: sortedMessages,
    hasMore,
    oldestMessageId, // Dùng để load more
    total: sortedMessages.length
  };
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

/**
 * Get staff rooms
 */
const getRoomsByUser = async (userId) => {
  return ChatRoom.find({ user: userId })
    .populate("user", "user_name avatar email")
    .populate("staff", "user_name avatar email")
    .sort({ updatedAt: -1 });
};
module.exports = {
  getOrCreateRoom,
  sendMessage,
  getMessagesByRoom,
  getRoomsByStaff,
  markAsRead,
  getRoomsByUser
};
