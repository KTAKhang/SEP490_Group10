const express = require("express");
const router = express.Router();
const FruitTypeController = require("../controller/FruitTypeController");
const PreOrderAllocationController = require("../controller/PreOrderAllocationController");
const AdminPreOrderController = require("../controller/AdminPreOrderController");
const { authAdminOrSalesStaffForOrderMiddleware } = require("../middleware/authMiddleware");
const { uploadFruitTypeImage } = require("../middleware/uploadMiddleware");

// Admin + Sales-staff: quản lý pre-order (deposit orders, demand, fruit types, allocations)
router.get("/pre-orders", authAdminOrSalesStaffForOrderMiddleware, AdminPreOrderController.listPreOrders);
router.get("/pre-orders/:id", authAdminOrSalesStaffForOrderMiddleware, AdminPreOrderController.getPreOrderDetail);
router.put("/pre-orders/:id/complete", authAdminOrSalesStaffForOrderMiddleware, AdminPreOrderController.markCompleted);
router.put("/pre-orders/:id/refund", authAdminOrSalesStaffForOrderMiddleware, AdminPreOrderController.markRefund);

router.get("/demand", authAdminOrSalesStaffForOrderMiddleware, PreOrderAllocationController.getDemand);
router.get("/allocations", authAdminOrSalesStaffForOrderMiddleware, PreOrderAllocationController.listAllocations);
router.post("/allocations", authAdminOrSalesStaffForOrderMiddleware, PreOrderAllocationController.upsertAllocation);

router.get("/fruit-types", authAdminOrSalesStaffForOrderMiddleware, FruitTypeController.listAdmin);
router.get("/fruit-types/:id", authAdminOrSalesStaffForOrderMiddleware, FruitTypeController.getById);
router.post("/fruit-types", authAdminOrSalesStaffForOrderMiddleware, uploadFruitTypeImage, FruitTypeController.create);
router.put("/fruit-types/:id", authAdminOrSalesStaffForOrderMiddleware, uploadFruitTypeImage, FruitTypeController.update);
router.delete("/fruit-types/:id", authAdminOrSalesStaffForOrderMiddleware, FruitTypeController.remove);

module.exports = router;
