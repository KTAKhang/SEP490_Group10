const express = require("express");
const InventoryTransactionController = require("../controller/InventoryTransactionController");
const PreOrderStockController = require("../controller/PreOrderStockController");
const PreOrderHarvestBatchController = require("../controller/PreOrderHarvestBatchController");
const WarehouseStaffStatsController = require("../controller/WarehouseStaffStatsController");
const {
  inventoryWarehouseMiddleware,
  inventoryAdminOrWarehouseMiddleware,
  inventoryAdminMiddleware,
  inventoryAdminOrSalesStaffMiddleware,
  inventoryAdminOrWarehouseOrSalesStaffMiddleware,
} = require("../middleware/inventoryMiddleware");

const InventoryRouter = express.Router();

// ----- Thống kê warehouse staff (cá nhân + chung kho) -----
InventoryRouter.get("/stats/warehouse", inventoryWarehouseMiddleware, WarehouseStaffStatsController.getWarehouseStats);

// ----- Lô nhập hàng trả đơn (Admin + Sales-staff tạo lô; Admin + Warehouse + Sales-staff xem) -----
InventoryRouter.post(
  "/preorder-batches",
  inventoryAdminOrSalesStaffMiddleware,
  PreOrderHarvestBatchController.createBatch
);
InventoryRouter.get(
  "/preorder-batches",
  inventoryAdminOrWarehouseOrSalesStaffMiddleware,
  PreOrderHarvestBatchController.listBatches
);
InventoryRouter.get(
  "/preorder-batches/:id",
  inventoryAdminOrWarehouseOrSalesStaffMiddleware,
  PreOrderHarvestBatchController.getBatchById
);

// ----- Kho trả đơn đặt trước (tách riêng Product) -----
InventoryRouter.get("/preorder-stock", inventoryAdminOrWarehouseMiddleware, PreOrderStockController.listStock);
InventoryRouter.post("/preorder-stock/simulate-import", inventoryAdminOrWarehouseMiddleware, PreOrderStockController.simulateImport);
InventoryRouter.post("/preorder-stock/receive", inventoryWarehouseMiddleware, PreOrderStockController.createReceive);
InventoryRouter.post(
  "/preorder-stock/receive-by-batch",
  inventoryWarehouseMiddleware,
  PreOrderStockController.createReceiveByBatch
);
InventoryRouter.get("/preorder-stock/receives", inventoryAdminOrWarehouseMiddleware, PreOrderStockController.listReceives);

// Admin và Warehouse staff: nhập kho (RECEIPT) -> tạo transaction + update product (atomic)
InventoryRouter.post("/receipts", inventoryAdminOrWarehouseMiddleware, InventoryTransactionController.createReceipt);

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

