const FeedbackedStaffDashboardService = require("../services/FeedbackedStaffDashboardService");

/**
 * GET /api/feedbacked-staff/dashboard
 * Trả về thống kê và dữ liệu gần đây cho trang dashboard của feedbacked-staff (và admin).
 * Middleware: authAdminOrFeedbackedStaffMiddleware
 */
const getDashboard = async (req, res) => {
  try {
    const userId = req.user?._id?.toString?.() || req.user?._id;
    const response = await FeedbackedStaffDashboardService.getDashboardStats(userId);
    if (response.status === "ERR") {
      return res.status(400).json(response);
    }
    return res.status(200).json(response);
  } catch (error) {
    return res.status(500).json({ status: "ERR", message: error.message });
  }
};

module.exports = {
  getDashboard,
};
