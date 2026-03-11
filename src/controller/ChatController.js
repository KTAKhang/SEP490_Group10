// controller/ChatController.js
const ChatService = require("../services/ChatService");

const createOrGetRoom = async (req, res) => {
  try {
    const userId = req.user._id;
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
      throw new Error("Message cannot be empty.");
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
    const { limit = 6, before } = req.query; 

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

const getChatRoomsAdmin = async (req, res) => {
  try {
    const response = await ChatService.getChatRoomsForAdmin(req.query);

    if (response.status === "ERR") {
      return res.status(400).json(response);
    }

    return res.status(200).json(response);
  } catch (error) {
    return res.status(500).json({
      status: "ERR",
      message: error.message || "Lấy danh sách phòng chat thất bại",
    });
  }
};
const getRoomDetailAdmin = async (req, res) => {
  try {
    const { roomId } = req.params;

    const response = await ChatService.getRoomDetailForAdmin(
      roomId,
      req.query
    );

    if (response.status === "ERR") {
      return res.status(400).json(response);
    }

    return res.status(200).json(response);
  } catch (error) {
    return res.status(500).json({
      status: "ERR",
      message: error.message || "Lấy chi tiết phòng chat thất bại",
    });
  }
};

module.exports = {
  createOrGetRoom,
  sendMessage,
  getMessages,
  getStaffRooms,
  markAsRead,
  getUserRooms,
  getChatRoomsAdmin,
  getRoomDetailAdmin
};
