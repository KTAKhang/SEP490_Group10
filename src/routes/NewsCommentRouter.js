const express = require("express");
const NewsCommentController = require("../controller/NewsCommentController");
const {
  authAdminOrFeedbackedStaffMiddleware,
  authUserMiddleware,
  authOptionalMiddleware,
} = require("../middleware/authMiddleware");

const NewsCommentRouter = express.Router();

// Admin + feedbacked-staff: moderation comment - Phải đặt TRƯỚC route /:id để tránh conflict
NewsCommentRouter.put("/:id/moderate", authAdminOrFeedbackedStaffMiddleware, NewsCommentController.moderateComment);

// Public endpoints (có thể xem comment mà không cần đăng nhập)
NewsCommentRouter.get("/:newsId", authOptionalMiddleware, NewsCommentController.getComments);

// Authenticated users (customer, staff, admin) — quyền sửa/xóa từng comment do service kiểm soát
NewsCommentRouter.post("/:newsId", authUserMiddleware, NewsCommentController.createComment);
NewsCommentRouter.put("/:id", authUserMiddleware, NewsCommentController.updateComment);
NewsCommentRouter.delete("/:id", authUserMiddleware, NewsCommentController.deleteComment);

module.exports = NewsCommentRouter;
