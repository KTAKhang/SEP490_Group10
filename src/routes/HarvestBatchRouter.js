const express = require("express");
const HarvestBatchRouter = express.Router();
const HarvestBatchController = require("../controller/HarvestBatchController");
const { authAdminMiddleware } = require("../middleware/authMiddleware");
const { inventoryAdminOrWarehouseMiddleware } = require("../middleware/inventoryMiddleware");

// Admin only: Tạo / Sửa / Xóa harvest batch (warehouse-staff không được dùng)
HarvestBatchRouter.post("/", authAdminMiddleware, HarvestBatchController.createHarvestBatch);
HarvestBatchRouter.put("/:id", authAdminMiddleware, HarvestBatchController.updateHarvestBatch);
HarvestBatchRouter.delete("/:id", authAdminMiddleware, HarvestBatchController.deleteHarvestBatch);

// Admin + warehouse-staff: CHỈ xem list và xem chi tiết (theo dõi harvest batch đang tồn tại)
HarvestBatchRouter.get("/", inventoryAdminOrWarehouseMiddleware, HarvestBatchController.getHarvestBatches);
HarvestBatchRouter.get("/:id", inventoryAdminOrWarehouseMiddleware, HarvestBatchController.getHarvestBatchById);

module.exports = HarvestBatchRouter;
