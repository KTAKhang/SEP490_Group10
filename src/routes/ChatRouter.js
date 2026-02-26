// routes/ChatRouter.js
const express = require("express");
const chatRouter = express.Router();
const ChatController = require("../controller/ChatController");
const { authUserMiddleware } = require("../middleware/authMiddleware");
const { uploadChatImages } = require("../middleware/uploadMiddleware");

chatRouter.post("/room", authUserMiddleware, ChatController.createOrGetRoom);
chatRouter.post("/message", authUserMiddleware,uploadChatImages, ChatController.sendMessage);
chatRouter.get("/room/:roomId/messages", authUserMiddleware, ChatController.getMessages);
chatRouter.get("/staff/rooms", authUserMiddleware, ChatController.getStaffRooms);
chatRouter.get("/user/rooms", authUserMiddleware, ChatController.getUserRooms);
chatRouter.get("/room/:roomId/mark-as-read", authUserMiddleware, ChatController.markAsRead);

module.exports = chatRouter;
