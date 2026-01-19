const express = require("express");
const ProductController = require("../controller/ProductController");
const ProductBatchController = require("../controller/ProductBatchController");
const { inventoryAdminMiddleware, inventoryAdminOrWarehouseMiddleware, inventoryAdminOrWarehouseOrQcStaffMiddleware } = require("../middleware/inventoryMiddleware");
const { uploadProductImages } = require("../middleware/uploadMiddleware");

const ProductRouter = express.Router();

// Admin: CRUD Product
ProductRouter.post("/", inventoryAdminMiddleware, uploadProductImages, ProductController.createProduct);

// Admin và Warehouse staff: Xem thống kê sản phẩm
ProductRouter.get("/stats", inventoryAdminOrWarehouseMiddleware, ProductController.getProductStats);

// Admin, Warehouse staff và QC Staff: Xem danh sách sản phẩm (QC Staff cần để update purchase cost)
ProductRouter.get("/", inventoryAdminOrWarehouseOrQcStaffMiddleware, ProductController.getProducts);

// Admin, Warehouse staff và QC Staff: Xem chi tiết sản phẩm (QC Staff cần để update purchase cost)
ProductRouter.get("/:id", inventoryAdminOrWarehouseOrQcStaffMiddleware, ProductController.getProductById);

// Admin và Warehouse staff: Cập nhật hạn sử dụng
ProductRouter.patch("/:id/expiry-date", inventoryAdminOrWarehouseMiddleware, ProductController.updateProductExpiryDate);

// Admin: Update và Delete Product
ProductRouter.put("/:id", inventoryAdminMiddleware, uploadProductImages, ProductController.updateProductAdmin);
ProductRouter.delete("/:id", inventoryAdminMiddleware, ProductController.deleteProduct);

// Admin: Batch management
ProductRouter.patch("/:id/reset-batch", inventoryAdminMiddleware, ProductBatchController.resetProductBatch);
ProductRouter.get("/:id/batch-history", inventoryAdminOrWarehouseMiddleware, ProductBatchController.getProductBatchHistory);
ProductRouter.post("/batch/mark-expired", inventoryAdminMiddleware, ProductBatchController.manualMarkExpired);
ProductRouter.get("/batch/pending-reset", inventoryAdminMiddleware, ProductBatchController.getPendingResetProducts);
ProductRouter.post("/:id/confirm-reset", inventoryAdminMiddleware, ProductBatchController.confirmResetProduct);

module.exports = ProductRouter;

//