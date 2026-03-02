const express = require("express");
const NewsCommentController = require("../controller/NewsCommentController");
const { newsAuthMiddleware, newsOptionalAuthMiddleware } = require("../middleware/newsMiddleware");
const { authAdminOrFeedbackedStaffMiddleware } = require("../middleware/authMiddleware");

const NewsCommentRouter = express.Router();

// Admin + feedbacked-staff: moderation comment - Phải đặt TRƯỚC route /:id để tránh conflict
NewsCommentRouter.put("/:id/moderate", authAdminOrFeedbackedStaffMiddleware, NewsCommentController.moderateComment);

// Public endpoints (có thể xem comment mà không cần đăng nhập)
NewsCommentRouter.get("/:newsId", newsOptionalAuthMiddleware, NewsCommentController.getComments);

// User endpoints (cần đăng nhập)
NewsCommentRouter.post("/:newsId", newsAuthMiddleware, NewsCommentController.createComment);
NewsCommentRouter.put("/:id", newsAuthMiddleware, NewsCommentController.updateComment);
NewsCommentRouter.delete("/:id", newsAuthMiddleware, NewsCommentController.deleteComment);

module.exports = NewsCommentRouter;
