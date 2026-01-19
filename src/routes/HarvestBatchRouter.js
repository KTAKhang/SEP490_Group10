const express = require("express");
const HarvestBatchRouter = express.Router();
const HarvestBatchController = require("../controller/HarvestBatchController");
const { qcStaffMiddleware } = require("../middleware/qcStaffMiddleware");

HarvestBatchRouter.post("/", qcStaffMiddleware, HarvestBatchController.createHarvestBatch);
HarvestBatchRouter.get("/", qcStaffMiddleware, HarvestBatchController.getHarvestBatches);
HarvestBatchRouter.get("/:id", qcStaffMiddleware, HarvestBatchController.getHarvestBatchById);
HarvestBatchRouter.put("/:id", qcStaffMiddleware, HarvestBatchController.updateHarvestBatch);
HarvestBatchRouter.delete("/:id", qcStaffMiddleware, HarvestBatchController.deleteHarvestBatch);

module.exports = HarvestBatchRouter;
