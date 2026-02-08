const express = require("express");
const AdminReviewController = require("../controller/AdminReviewController");
const { authAdminOrFeedbackedStaffMiddleware } = require("../middleware/authMiddleware");

const AdminReviewRouter = express.Router();

// Admin + feedbacked-staff: full quyền quản lý review (danh sách, ẩn/hiện)
AdminReviewRouter.get("/", authAdminOrFeedbackedStaffMiddleware, AdminReviewController.getReviewsAdmin);
AdminReviewRouter.put("/:id/visibility", authAdminOrFeedbackedStaffMiddleware, AdminReviewController.updateReviewVisibility);

module.exports = AdminReviewRouter;
