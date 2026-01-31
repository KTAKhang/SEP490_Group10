const express = require("express");
const router = express.Router();
const FruitTypeController = require("../controller/FruitTypeController");
const PreOrderAllocationController = require("../controller/PreOrderAllocationController");
const AdminPreOrderController = require("../controller/AdminPreOrderController");
const { authAdminMiddleware } = require("../middleware/authMiddleware");
const { uploadFruitTypeImage } = require("../middleware/uploadMiddleware");

router.get("/pre-orders", authAdminMiddleware, AdminPreOrderController.listPreOrders);
router.get("/pre-orders/:id", authAdminMiddleware, AdminPreOrderController.getPreOrderDetail);

router.get("/demand", authAdminMiddleware, PreOrderAllocationController.getDemand);
router.get("/allocations", authAdminMiddleware, PreOrderAllocationController.listAllocations);
router.post("/allocations", authAdminMiddleware, PreOrderAllocationController.upsertAllocation);

router.get("/fruit-types", authAdminMiddleware, FruitTypeController.listAdmin);
router.get("/fruit-types/:id", authAdminMiddleware, FruitTypeController.getById);
router.post("/fruit-types", authAdminMiddleware, uploadFruitTypeImage, FruitTypeController.create);
router.put("/fruit-types/:id", authAdminMiddleware, uploadFruitTypeImage, FruitTypeController.update);

module.exports = router;
