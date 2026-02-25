const express = require("express");
const ContactController = require("../controller/ContactController");
const ContactRouter = express.Router();
const multer = require("multer");
const { contactAuthMiddleware, contactAdminMiddleware, contactAdminOrFeedbackedStaffMiddleware } = require("../middleware/contactMiddleware");

// Cấu hình multer để xử lý file upload
const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB
    },
});

// ===== CONTACT ROUTES =====

// Tạo Contact mới
ContactRouter.post("/", contactAuthMiddleware, ContactController.createContact);

// Lấy danh sách Contact (có filter: status, category, pagination: page, limit)
ContactRouter.get("/", contactAuthMiddleware, ContactController.getContacts);

// Lấy chi tiết Contact
ContactRouter.get("/:id", contactAuthMiddleware, ContactController.getContactById);

// Cập nhật trạng thái Contact (Admin hoặc Customer Support)
ContactRouter.patch("/:id/status", contactAdminOrFeedbackedStaffMiddleware, ContactController.updateContactStatus);

// ===== REPLY ROUTES =====

// Tạo Reply cho Contact
ContactRouter.post("/:id/replies", contactAuthMiddleware, ContactController.createReply);

// Lấy danh sách Reply của Contact
ContactRouter.get("/:id/replies", contactAuthMiddleware, ContactController.getReplies);

// Cập nhật Reply (Admin hoặc Customer Support, chỉ reply của chính mình)
ContactRouter.put("/:id/replies/:replyId", contactAdminOrFeedbackedStaffMiddleware, ContactController.updateReply);

// Xóa Reply (Admin hoặc Customer Support, chỉ reply của chính mình)
ContactRouter.delete("/:id/replies/:replyId", contactAdminOrFeedbackedStaffMiddleware, ContactController.deleteReply);

// ===== ATTACHMENT ROUTES =====

// Upload Attachment cho Contact
ContactRouter.post(
    "/:id/attachments",
    contactAuthMiddleware,
    upload.single("file"),
    ContactController.uploadAttachment
);

// Lấy danh sách Attachment của Contact
ContactRouter.get("/:id/attachments", contactAuthMiddleware, ContactController.getAttachments);

// Xóa Attachment
ContactRouter.delete(
    "/:id/attachments/:attachmentId",
    contactAuthMiddleware,
    ContactController.deleteAttachment
);

module.exports = ContactRouter;
