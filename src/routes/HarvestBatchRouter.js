const express = require("express");
const HarvestBatchRouter = express.Router();
const HarvestBatchController = require("../controller/HarvestBatchController");
const { authAdminMiddleware } = require("../middleware/authMiddleware");
const { inventoryAdminOrWarehouseMiddleware } = require("../middleware/inventoryMiddleware");

// Admin: CRUD Harvest Batch
HarvestBatchRouter.post("/", authAdminMiddleware, HarvestBatchController.createHarvestBatch);
HarvestBatchRouter.put("/:id", authAdminMiddleware, HarvestBatchController.updateHarvestBatch);
HarvestBatchRouter.delete("/:id", authAdminMiddleware, HarvestBatchController.deleteHarvestBatch);

// Admin và Warehouse staff: Xem danh sách và chi tiết harvest batches
// (Warehouse staff cần để chọn lô thu hoạch khi nhập hàng vào kho)
HarvestBatchRouter.get("/", inventoryAdminOrWarehouseMiddleware, HarvestBatchController.getHarvestBatches);
HarvestBatchRouter.get("/:id", inventoryAdminOrWarehouseMiddleware, HarvestBatchController.getHarvestBatchById);

module.exports = HarvestBatchRouter;
