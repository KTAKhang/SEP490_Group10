const express = require("express");
const HarvestBatchRouter = express.Router();
const HarvestBatchController = require("../controller/HarvestBatchController");
const { authAdminMiddleware } = require("../middleware/authMiddleware");
const { inventoryAdminOrWarehouseOrSalesStaffMiddleware } = require("../middleware/inventoryMiddleware");

// Admin only: Tạo / Sửa / Xóa harvest batch (warehouse-staff, sales-staff không được dùng)
HarvestBatchRouter.post("/", authAdminMiddleware, HarvestBatchController.createHarvestBatch);
HarvestBatchRouter.put("/:id", authAdminMiddleware, HarvestBatchController.updateHarvestBatch);
HarvestBatchRouter.delete("/:id", authAdminMiddleware, HarvestBatchController.deleteHarvestBatch);

// Admin + warehouse-staff + sales-staff: CHỈ xem list và xem chi tiết (sales-staff cần cho trang Pre-order Receive stock)
HarvestBatchRouter.get("/", inventoryAdminOrWarehouseOrSalesStaffMiddleware, HarvestBatchController.getHarvestBatches);
HarvestBatchRouter.get("/:id", inventoryAdminOrWarehouseOrSalesStaffMiddleware, HarvestBatchController.getHarvestBatchById);

module.exports = HarvestBatchRouter;
