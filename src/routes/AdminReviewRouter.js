const express = require("express");
const AdminReviewController = require("../controller/AdminReviewController");
const { authAdminMiddleware } = require("../middleware/authMiddleware");

const AdminReviewRouter = express.Router();

// Admin: danh sách review + ẩn/hiện
AdminReviewRouter.get("/", authAdminMiddleware, AdminReviewController.getReviewsAdmin);
AdminReviewRouter.put("/:id/visibility", authAdminMiddleware, AdminReviewController.updateReviewVisibility);

module.exports = AdminReviewRouter;
