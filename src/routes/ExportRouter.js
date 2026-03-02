/**
 * Export Router
 *
 * Routes for export endpoints (Excel, etc.). Auth: admin or sales-staff where applicable.
 */
const express = require("express");
const router = express.Router();
const ExportController = require("../controller/ExportController");
const { authAdminOrSalesStaffForOrderMiddleware } = require("../middleware/authMiddleware");

router.get("/sales-stats", authAdminOrSalesStaffForOrderMiddleware, ExportController.exportSalesStatsExcel);

module.exports = router;
