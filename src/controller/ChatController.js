// controller/ChatController.js
const ChatService = require("../services/ChatService");

const createOrGetRoom = async (req, res) => {
  try {
    const userId = req.user._id; // ❗ lấy từ token


    const room = await ChatService.getOrCreateRoom(userId);
    res.json({ status: "OK", data: room });
  } catch (err) {
    res.status(400).json({ status: "ERR", message: err.message });
  }
};

const sendMessage = async (req, res) => {
  try {
    const senderId = req.user._id;
    const senderRole = req.user.role; // customer / staff / admin
    const { roomId, content } = req.body;

    const message = await ChatService.sendMessage({
      roomId,
      senderId,
      senderRole,
      content,
    });

    res.json({ status: "OK", data: message });
  } catch (err) {
    res.status(400).json({ status: "ERR", message: err.message });
  }
};

const getMessages = async (req, res) => {
  try {
    const { roomId } = req.params;
    const messages = await ChatService.getMessagesByRoom(
      roomId,
      req.user._id.toString()
    );

    res.json({ status: "OK", data: messages });
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

module.exports = {
  createOrGetRoom,
  sendMessage,
  getMessages,
  getStaffRooms,
};
