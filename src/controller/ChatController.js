// controller/ChatController.js
const ChatService = require("../services/ChatService");

const createOrGetRoom = async (req, res) => {
  try {
    const userId = req.user._id; // ❗ lấy từ token
    const { staffId } = req.body;

    const room = await ChatService.getOrCreateRoom(userId, staffId);
    res.json({ status: "OK", data: room });
  } catch (err) {
    res.status(400).json({ status: "ERR", message: err.message });
  }
};

const sendMessage = async (req, res) => {
  try {
    const senderId = req.user._id;
    const senderRole = req.user.role_id.name;

    const { roomId, content, images, imagePublicIds } = req.body;
    if (!content && (!images || images.length === 0)) {
      throw new Error("Message must have content or at least one image");
    }
    const message = await ChatService.sendMessage({
      roomId,
      senderId,
      senderRole,
      content,
      images,
      imagePublicIds,
    });

    res.json({ status: "OK", data: message });
  } catch (err) {
    res.status(400).json({ status: "ERR", message: err.message });
  }
};

const getMessages = async (req, res) => {
  try {
    const { roomId } = req.params;
    const { limit = 6, before } = req.query; // before: messageId để load tin nhắn cũ hơn

    const result = await ChatService.getMessagesByRoom(
      roomId,
      req.user._id.toString(),
      {
        limit: parseInt(limit),
        before,
      },
    );

    res.json({ status: "OK", data: result });
  } catch (err) {
    res.status(403).json({ status: "ERR", message: err.message });
  }
};

const markAsRead = async (req, res) => {
  try {
    const { roomId } = req.params;
    const markAsRead = await ChatService.markAsRead(
      roomId,
      req.user.role_id.name,
    );

    res.json({ status: "OK", data: markAsRead });
  } catch (err) {
    res.status(403).json({ status: "ERR", message: err.message });
  }
};

const getStaffRooms = async (req, res) => {
  try {
    const rooms = await ChatService.getRoomsByStaff(req.user._id);
    res.json({ status: "OK", data: rooms });
  } catch (err) {
    res.status(500).json({ status: "ERR", message: err.message });
  }
};

const getUserRooms = async (req, res) => {
  try {
    const rooms = await ChatService.getRoomsByUser(req.user._id);
    res.json({ status: "OK", data: rooms });
  } catch (err) {
    res.status(500).json({ status: "ERR", message: err.message });
  }
};

module.exports = {
  createOrGetRoom,
  sendMessage,
  getMessages,
  getStaffRooms,
  markAsRead,
  getUserRooms,
};
