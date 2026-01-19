const express = require("express");
const CategoryController = require("../controller/CategoryController");
const { inventoryAdminMiddleware, inventoryAdminOrWarehouseMiddleware } = require("../middleware/inventoryMiddleware");
const { uploadCategoryImage } = require("../middleware/uploadMiddleware");

const CategoryRouter = express.Router();

// Admin: CRUD Category
CategoryRouter.post("/", inventoryAdminMiddleware, uploadCategoryImage, CategoryController.createCategory);

// Admin và Warehouse staff: Xem thống kê danh mục
CategoryRouter.get("/stats", inventoryAdminOrWarehouseMiddleware, CategoryController.getCategoryStats);

// Admin và Warehouse staff: Xem danh sách categories
CategoryRouter.get("/", inventoryAdminOrWarehouseMiddleware, CategoryController.getCategories);

// Admin và Warehouse staff: Xem chi tiết category
CategoryRouter.get("/:id", inventoryAdminOrWarehouseMiddleware, CategoryController.getCategoryById);

// Admin: Update và Delete Category
CategoryRouter.put("/:id", inventoryAdminMiddleware, uploadCategoryImage, CategoryController.updateCategory);
CategoryRouter.delete("/:id", inventoryAdminMiddleware, CategoryController.deleteCategory);

module.exports = CategoryRouter;

