const express = require("express");
const NewsCommentController = require("../controller/NewsCommentController");
const {
  authAdminOrFeedbackedStaffMiddleware,
  authStaffOrAdminMiddleware,
  authOptionalMiddleware,
} = require("../middleware/authMiddleware");

const NewsCommentRouter = express.Router();

// Admin + feedbacked-staff: moderation comment - Phải đặt TRƯỚC route /:id để tránh conflict
NewsCommentRouter.put("/:id/moderate", authAdminOrFeedbackedStaffMiddleware, NewsCommentController.moderateComment);

// Public endpoints (có thể xem comment mà không cần đăng nhập)
NewsCommentRouter.get("/:newsId", authOptionalMiddleware, NewsCommentController.getComments);

// User endpoints (cần đăng nhập)
NewsCommentRouter.post("/:newsId", authStaffOrAdminMiddleware, NewsCommentController.createComment);
NewsCommentRouter.put("/:id", authStaffOrAdminMiddleware, NewsCommentController.updateComment);
NewsCommentRouter.delete("/:id", authStaffOrAdminMiddleware, NewsCommentController.deleteComment);

module.exports = NewsCommentRouter;
