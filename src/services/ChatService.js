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
    throw new Error("Message cannot be empty.");
  }

  if (images.length > 3) {
    throw new Error("Maximum 3 images allowed");
  }

  const room = await ChatRoom.findById(roomId)

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

  /* ======================
   SEND NOTIFICATION
====================== */
  let receiverId = null;

  if (senderRole === "customer") {
    receiverId = room.staff.toString();
  } else {
    receiverId = room.user.toString();
  }
  const senderName = message.sender?.user_name || "Someone";

  setImmediate(async () => {
    try {
      await NotificationService.sendToUser(receiverId, {
        title: `💬 ${senderName}`,
        body: content
          ? content.slice(0, 100)
          : "📷 You received an image message",
        data: {
          type: "chat",
          roomId,
          action: "open_chat",
        },
      });
    } catch (err) {
      console.error("Send notification failed:", err.message);
    }
  });


  return message;
};

/**
 * Get messages by room (check quyền)
 */
const getMessagesByRoom = async (roomId, currentUserId, options = {}) => {
  const { limit = 6, before } = options;
  // validate roomId
  if (!roomId || !mongoose.Types.ObjectId.isValid(roomId)) {
    throw new Error("Invalid roomId");
  }

  // validate currentUserId
  if (!currentUserId || !mongoose.Types.ObjectId.isValid(currentUserId)) {
    throw new Error("Invalid currentUserId");
  }

  // validate limit
  const limitNum = parseInt(limit);
  if (isNaN(limitNum) || limitNum < 1 || limitNum > 50) {
    throw new Error("Limit must be between 1 and 50");
  }

  // validate before
  if (before && !mongoose.Types.ObjectId.isValid(before)) {
    throw new Error("Invalid before messageId");
  }

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
  // 1. Validate
  if (!staffId) {
    throw new Error("staffId is required");
  }

  if (!mongoose.Types.ObjectId.isValid(staffId)) {
    throw new Error("Invalid staffId");
  }

  // 2. Query
  return ChatRoom.find({ staff: staffId })
    .populate("user", "user_name avatar email")
    .sort({ updatedAt: -1 });
};

/**
 * Get staff rooms
 */
const getRoomsByUser = async (userId) => {
  if (!userId) {
    throw new Error("userId is required");
  }

  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new Error("Invalid userId");
  }

  return ChatRoom.find({ user: userId })
    .populate("user", "user_name avatar email")
    .populate("staff", "user_name avatar email")
    .sort({ updatedAt: -1 });
};

const getChatRoomsForAdmin = async (filters = {}) => {
  try {
    const {
      page = 1,
      limit = 10,
      search = "",
      sortBy = "updatedAt",
      sortOrder = "desc",
    } = filters;

    if (isNaN(page) || page < 1) {
      return {
        status: "ERR",
        message: "Page must be a positive number",
      };
    }

    if (isNaN(limit) || limit < 1 || limit > 100) {
      return {
        status: "ERR",
        message: "Limit must be between 1 and 100",
      };
    }

    if (!["asc", "desc"].includes(sortOrder)) {
      return {
        status: "ERR",
        message: "sortOrder must be 'asc' or 'desc'",
      };
    }

    if (search && search.length > 50) {
      return {
        status: "ERR",
        message: "Search too long (max 50 characters)",
      };
    }


    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit) || 10));
    const skip = (pageNum - 1) * limitNum;

    const query = {};

    const allowedSortFields = ["createdAt", "updatedAt"];
    const sortField = allowedSortFields.includes(sortBy)
      ? sortBy
      : "updatedAt";
    const sortDirection = sortOrder === "asc" ? 1 : -1;
    const sortObj = { [sortField]: sortDirection };

    let roomsQuery = ChatRoom.find(query)
      .populate({
        path: "user",
        select: "user_name email avatar",
      })
      .populate({
        path: "staff",
        select: "user_name email avatar",
      })
      .sort(sortObj)
      .skip(skip)
      .limit(limitNum)
      .lean();

    const rooms = await roomsQuery;

    // 🔎 Search theo tên user
    let filteredRooms = rooms;

    if (search) {
      const escaped = search
        .toString()
        .trim()
        .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

      const regex = new RegExp(escaped, "i");

      filteredRooms = rooms.filter(
        (room) =>
          room.user?.user_name?.match(regex) ||
          room.staff?.user_name?.match(regex)
      );
    }

    const total = await ChatRoom.countDocuments(query);

    return {
      status: "OK",
      message: "Fetched chat room list successfully",
      data: filteredRooms,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    };
  } catch (error) {
    return {
      status: "ERR",
      message: error.message,
    };
  }
};

const getRoomDetailForAdmin = async (roomId, options = {}) => {
  try {
    const { limit = 6, before } = options;

    // validate roomId
    if (!roomId || !mongoose.Types.ObjectId.isValid(roomId)) {
      return {
        status: "ERR",
        message: "Invalid roomId",
      };
    }

    // validate limit
    const limitNum = parseInt(limit);
    if (isNaN(limitNum) || limitNum < 1 || limitNum > 50) {
      return {
        status: "ERR",
        message: "Limit must be a number between 1 and 50",
      };
    }

    // validate before (optional)
    if (before && !mongoose.Types.ObjectId.isValid(before)) {
      return {
        status: "ERR",
        message: "Invalid before messageId",
      };
    }

    // 1️⃣ Kiểm tra room tồn tại
    const room = await ChatRoom.findById(roomId)
      .populate("user", "user_name email avatar")
      .populate("staff", "user_name email avatar")
      .lean();

    if (!room) {
      return {
        status: "ERR",
        message: "Room not found",
      };
    }

    // 2️⃣ Build query
    const query = { room: roomId };

    if (before) {
      const beforeMessage = await Message.findById(before);
      if (beforeMessage) {
        query.createdAt = { $lt: beforeMessage.createdAt };
      }
    }

    // 3️⃣ Lấy tin nhắn mới nhất trước
    const messages = await Message.find(query)
      .populate("sender", "user_name avatar role")
      .sort({ createdAt: -1 }) // Tin mới nhất trước
      .limit(parseInt(limit));

    // 4️⃣ Reverse lại để hiển thị đúng thứ tự chat
    const sortedMessages = messages.reverse();

    // 5️⃣ Check còn tin nhắn cũ hơn không
    const hasMore = messages.length === parseInt(limit);

    const oldestMessageId =
      sortedMessages.length > 0
        ? sortedMessages[0]._id
        : null;

    return {
      status: "OK",
      message: "Fetched room detail successfully",
      data: {
        room,
        messages: sortedMessages,
        hasMore,
        oldestMessageId,
      },
    };
  } catch (error) {
    return {
      status: "ERR",
      message: error.message,
    };
  }
};
module.exports = {
  getOrCreateRoom,
  sendMessage,
  getMessagesByRoom,
  getRoomsByStaff,
  markAsRead,
  getRoomsByUser,
  getChatRoomsForAdmin,
  getRoomDetailForAdmin
};
