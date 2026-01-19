const express = require("express");
const QualityVerificationRouter = express.Router();
const QualityVerificationController = require("../controller/QualityVerificationController");
const { qcStaffMiddleware } = require("../middleware/qcStaffMiddleware");

QualityVerificationRouter.post("/verify", qcStaffMiddleware, QualityVerificationController.verifyQuality);
QualityVerificationRouter.get("/verifications", qcStaffMiddleware, QualityVerificationController.getQualityVerifications);
QualityVerificationRouter.get("/verifications/:id", qcStaffMiddleware, QualityVerificationController.getQualityVerificationById);
QualityVerificationRouter.put("/verifications/:id", qcStaffMiddleware, QualityVerificationController.updateQualityVerification);
QualityVerificationRouter.delete("/verifications/:id", qcStaffMiddleware, QualityVerificationController.deleteQualityVerification);

module.exports = QualityVerificationRouter;
