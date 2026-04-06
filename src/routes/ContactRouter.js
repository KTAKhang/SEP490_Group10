const express = require("express");
const ContactController = require("../controller/ContactController");
const ContactRouter = express.Router();
const multer = require("multer");
const { authUserMiddleware, authAdminOrFeedbackedStaffMiddleware } = require("../middleware/authMiddleware");

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
ContactRouter.post("/", authUserMiddleware, ContactController.createContact);

// Lấy danh sách Contact (có filter: status, category, pagination: page, limit)
ContactRouter.get("/", authUserMiddleware, ContactController.getContacts);

// Lấy chi tiết Contact
ContactRouter.get("/:id", authUserMiddleware, ContactController.getContactById);

// Cập nhật trạng thái Contact (chỉ Admin/feedbacked-staff)
ContactRouter.patch("/:id/status", authAdminOrFeedbackedStaffMiddleware, ContactController.updateContactStatus);

// ===== REPLY ROUTES =====

// Tạo Reply cho Contact
ContactRouter.post("/:id/replies", authUserMiddleware, ContactController.createReply);

// Lấy danh sách Reply của Contact
ContactRouter.get("/:id/replies", authUserMiddleware, ContactController.getReplies);

// Cập nhật Reply (chỉ Admin/feedbacked-staff, chỉ reply của chính mình)
ContactRouter.put("/:id/replies/:replyId", authAdminOrFeedbackedStaffMiddleware, ContactController.updateReply);

// Xóa Reply (chỉ Admin/feedbacked-staff, chỉ reply của chính mình)
ContactRouter.delete("/:id/replies/:replyId", authAdminOrFeedbackedStaffMiddleware, ContactController.deleteReply);

// ===== ATTACHMENT ROUTES =====

// Upload Attachment cho Contact
ContactRouter.post(
    "/:id/attachments",
    authUserMiddleware,
    upload.single("file"),
    ContactController.uploadAttachment
);

// Lấy danh sách Attachment của Contact
ContactRouter.get("/:id/attachments", authUserMiddleware, ContactController.getAttachments);

// Xóa Attachment
ContactRouter.delete(
    "/:id/attachments/:attachmentId",
    authUserMiddleware,
    ContactController.deleteAttachment
);

module.exports = ContactRouter;
