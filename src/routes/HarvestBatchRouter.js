const express = require("express");
const HarvestBatchRouter = express.Router();
const HarvestBatchController = require("../controller/HarvestBatchController");
const { authAdminMiddleware } = require("../middleware/authMiddleware");

HarvestBatchRouter.post("/", authAdminMiddleware, HarvestBatchController.createHarvestBatch);
HarvestBatchRouter.get("/", authAdminMiddleware, HarvestBatchController.getHarvestBatches);
HarvestBatchRouter.get("/:id", authAdminMiddleware, HarvestBatchController.getHarvestBatchById);
HarvestBatchRouter.put("/:id", authAdminMiddleware, HarvestBatchController.updateHarvestBatch);
HarvestBatchRouter.delete("/:id", authAdminMiddleware, HarvestBatchController.deleteHarvestBatch);

module.exports = HarvestBatchRouter;
