// routes/ChatRouter.js
const express = require("express");
const chatRouter = express.Router();
const ChatController = require("../controller/ChatController");
const {
  authUserMiddleware,
  authAdminMiddleware,
  customerOrFeedbackStaffMiddleware
} = require("../middleware/authMiddleware");
const { uploadChatImages } = require("../middleware/uploadMiddleware");

chatRouter.post("/room", authUserMiddleware, ChatController.createOrGetRoom);
chatRouter.post(
  "/message",
  customerOrFeedbackStaffMiddleware,
  uploadChatImages,
  ChatController.sendMessage,
);
chatRouter.get(
  "/room/:roomId/messages",
  customerOrFeedbackStaffMiddleware,
  ChatController.getMessages,
);
chatRouter.get(
  "/staff/rooms",
  customerOrFeedbackStaffMiddleware,
  ChatController.getStaffRooms,
);
chatRouter.get("/user/rooms", customerOrFeedbackStaffMiddleware, ChatController.getUserRooms);
chatRouter.get(
  "/room/:roomId/mark-as-read",
  customerOrFeedbackStaffMiddleware,
  ChatController.markAsRead,
);
chatRouter.get(
  "/admin/rooms",
  authAdminMiddleware,
  ChatController.getChatRoomsAdmin,
);
chatRouter.get(
  "/admin/room/:roomId",
  authAdminMiddleware,
  ChatController.getRoomDetailAdmin,
);
module.exports = chatRouter;
