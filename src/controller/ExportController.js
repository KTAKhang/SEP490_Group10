/**
 * Export Controller
 *
 * HTTP layer for export endpoints (Excel, etc.).
 * Uses ExportService; others can add more export types.
 *
 * @module controller/ExportController
 */

const ExportService = require("../services/ExportService");

/**
 * GET /admin/export/sales-stats — Excel file of sales staff dashboard stats.
 * Auth: admin or sales-staff (order permission).
 */
const exportSalesStatsExcel = async (req, res) => {
  try {
    const buffer = await ExportService.exportSalesStatsToExcel();
    const filename = `sales-stats-${new Date().toISOString().slice(0, 16).replace("T", "-").replace(":", "-")}.xlsx`;
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ status: "ERR", message: err.message });
  }
};

module.exports = {
  exportSalesStatsExcel,
};
