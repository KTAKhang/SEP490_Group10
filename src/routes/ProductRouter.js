const express = require("express");
const ProductController = require("../controller/ProductController");
const { inventoryAdminMiddleware, inventoryAdminOrWarehouseMiddleware } = require("../middleware/inventoryMiddleware");
const { uploadProductImages } = require("../middleware/uploadMiddleware");

const ProductRouter = express.Router();

// Admin: CRUD Product
ProductRouter.post("/", inventoryAdminMiddleware, uploadProductImages, ProductController.createProduct);

// Admin và Warehouse staff: Xem thống kê sản phẩm
ProductRouter.get("/stats", inventoryAdminOrWarehouseMiddleware, ProductController.getProductStats);

// Admin và Warehouse staff: Xem danh sách sản phẩm
ProductRouter.get("/", inventoryAdminOrWarehouseMiddleware, ProductController.getProducts);

// Admin và Warehouse staff: Xem chi tiết sản phẩm
ProductRouter.get("/:id", inventoryAdminOrWarehouseMiddleware, ProductController.getProductById);

// Admin và Warehouse staff: Cập nhật hạn sử dụng
ProductRouter.patch("/:id/expiry-date", inventoryAdminOrWarehouseMiddleware, ProductController.updateProductExpiryDate);

// Admin: Update và Delete Product
ProductRouter.put("/:id", inventoryAdminMiddleware, uploadProductImages, ProductController.updateProductAdmin);
ProductRouter.delete("/:id", inventoryAdminMiddleware, ProductController.deleteProduct);

module.exports = ProductRouter;

