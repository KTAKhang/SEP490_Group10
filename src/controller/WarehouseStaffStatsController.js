/**
 * Warehouse Staff Stats Controller
 *
 * HTTP layer cho trang thống kê warehouse staff.
 * GET /inventory/stats/warehouse?page=1&limit=20
 *
 * @module controller/WarehouseStaffStatsController
 */

const WarehouseStaffStatsService = require("../services/WarehouseStaffStatsService");

/**
 * GET /inventory/stats/warehouse
 * Query: page, limit (cho lịch sử nhập kho cá nhân)
 */
const getWarehouseStats = async (req, res) => {
  try {
    const staffId = req.user._id;
    const page = req.query.page;
    const limit = req.query.limit;

    const response = await WarehouseStaffStatsService.getWarehouseStaffStats(staffId, { page, limit });
    if (response.status === "ERR") {
      return res.status(400).json(response);
    }
    return res.status(200).json(response);
  } catch (error) {
    return res.status(500).json({
      status: "ERR",
      message: error.message || "Failed to fetch warehouse stats",
    });
  }
};

module.exports = {
  getWarehouseStats,
};
