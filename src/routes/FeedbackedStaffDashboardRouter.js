const express = require("express");
const FeedbackedStaffDashboardController = require("../controller/FeedbackedStaffDashboardController");
const { authAdminOrFeedbackedStaffMiddleware } = require("../middleware/authMiddleware");

const router = express.Router();

// Dashboard cho feedbacked-staff (và admin): thống kê reviews, news comments, chat, news
router.get("/dashboard", authAdminOrFeedbackedStaffMiddleware, FeedbackedStaffDashboardController.getDashboard);

module.exports = router;
