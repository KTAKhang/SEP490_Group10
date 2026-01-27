// routes/ChatRouter.js
const express = require("express");
const chatRouter = express.Router();
const ChatController = require("../controller/ChatController");
const { authUserMiddleware } = require("../middleware/authMiddleware");

chatRouter.post("/room", authUserMiddleware, ChatController.createOrGetRoom);
chatRouter.post("/message", authUserMiddleware, ChatController.sendMessage);
chatRouter.get("/room/:roomId/messages", authUserMiddleware, ChatController.getMessages);
chatRouter.get("/staff/rooms", authUserMiddleware, ChatController.getStaffRooms);

module.exports = chatRouter;
