const express = require("express");
const InventoryTransactionController = require("../controller/InventoryTransactionController");
const { inventoryWarehouseMiddleware, inventoryAdminOrWarehouseMiddleware } = require("../middleware/inventoryMiddleware");

const InventoryRouter = express.Router();

// Warehouse staff: nhập kho (RECEIPT) -> tạo transaction + update product (atomic)
InventoryRouter.post("/receipts", inventoryWarehouseMiddleware, InventoryTransactionController.createReceipt);

// Admin và Warehouse staff: Xem lịch sử nhập hàng
InventoryRouter.get("/receipts", inventoryAdminOrWarehouseMiddleware, InventoryTransactionController.getReceiptHistory);

// Admin và Warehouse staff: Xem chi tiết một phiếu nhập hàng (phải đặt sau /receipts để tránh conflict)
InventoryRouter.get("/receipts/:id", inventoryAdminOrWarehouseMiddleware, InventoryTransactionController.getReceiptById);

// Xuất kho (ISSUE) - có thể được gọi từ order service hoặc sale service
// Lưu ý: Nếu ISSUE được tạo ở service khác, cần gọi autoResetSoldOutProduct sau khi tạo ISSUE
InventoryRouter.post("/issues", inventoryWarehouseMiddleware, InventoryTransactionController.createIssue);

// Admin và Warehouse staff: Xem lịch sử tất cả transactions
InventoryRouter.get("/transactions", inventoryAdminOrWarehouseMiddleware, InventoryTransactionController.getTransactionHistory);

module.exports = InventoryRouter;

