const express = require("express");
const SupplierRouter = express.Router();
const SupplierController = require("../controller/SupplierController");
const { authAdminMiddleware } = require("../middleware/authMiddleware");

// Import các router đã tách
const HarvestBatchRouter = require("./HarvestBatchRouter");
const QualityVerificationRouter = require("./QualityVerificationRouter");
const SupplierPerformanceRouter = require("./SupplierPerformanceRouter");

// ✅ QUAN TRỌNG: Routes cụ thể PHẢI đứng TRƯỚC routes động /:id
// Express match routes theo thứ tự từ trên xuống, nên /:id sẽ match mọi thứ nếu đặt trước

// ============================================
// 1. Admin routes (specific routes)
// ============================================
SupplierRouter.get("/for-brand", authAdminMiddleware, SupplierController.getSuppliersForBrand);

// ============================================
// 2. Harvest Batch routes (PHẢI TRƯỚC /:id)
// ============================================
SupplierRouter.use("/harvest-batch", HarvestBatchRouter);

// ============================================
// 3. Quality Verification routes (PHẢI TRƯỚC /:id)
// ============================================
SupplierRouter.use("/quality", QualityVerificationRouter);

// ============================================
// 4. Performance routes (PHẢI TRƯỚC /:id)
// ============================================
SupplierRouter.use("/performance", SupplierPerformanceRouter);

// ============================================
// 5. General supplier routes với sub-routes (TRƯỚC /:id)
// ============================================
SupplierRouter.put("/:id/cooperation-status", authAdminMiddleware, SupplierController.updateCooperationStatus);
// ✅ Activity Log đã được tách ra router riêng cho Admin (xem SupplierActivityLogRouter)

// ============================================
// 6. General supplier routes (SAU tất cả routes cụ thể)
// ============================================
SupplierRouter.post("/", authAdminMiddleware, SupplierController.createSupplier);
SupplierRouter.get("/", authAdminMiddleware, SupplierController.getSuppliers);
SupplierRouter.put("/:id", authAdminMiddleware, SupplierController.updateSupplier);
SupplierRouter.delete("/:id", authAdminMiddleware, SupplierController.deleteSupplier);
SupplierRouter.get("/:id", authAdminMiddleware, SupplierController.getSupplierById); // ← Dynamic route CUỐI CÙNG

module.exports = SupplierRouter;
