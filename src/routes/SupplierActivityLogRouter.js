const express = require("express");
const SupplierActivityLogRouter = express.Router();
const SupplierController = require("../controller/SupplierController");
const { authAdminMiddleware } = require("../middleware/authMiddleware");

// ✅ Admin only - Xem Activity Log của QC Staff
SupplierActivityLogRouter.get("/:supplierId", authAdminMiddleware, SupplierController.getActivityLog);

module.exports = SupplierActivityLogRouter;
