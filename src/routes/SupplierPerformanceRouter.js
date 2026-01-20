const express = require("express");
const SupplierPerformanceRouter = express.Router();
const SupplierPerformanceController = require("../controller/SupplierPerformanceController");
const { qcStaffMiddleware } = require("../middleware/qcStaffMiddleware");

SupplierPerformanceRouter.post("/evaluate", qcStaffMiddleware, SupplierPerformanceController.evaluatePerformance);
SupplierPerformanceRouter.get("/", qcStaffMiddleware, SupplierPerformanceController.getPerformances);
SupplierPerformanceRouter.get("/:id", qcStaffMiddleware, SupplierPerformanceController.getPerformanceById);
SupplierPerformanceRouter.delete("/:id", qcStaffMiddleware, SupplierPerformanceController.deletePerformance);

module.exports = SupplierPerformanceRouter;
