const express = require("express");
const InventoryTransactionController = require("../controller/InventoryTransactionController");
const { inventoryWarehouseMiddleware } = require("../middleware/inventoryMiddleware");

const InventoryRouter = express.Router();

// Warehouse staff: nhập kho (RECEIPT) -> tạo transaction + update product (atomic)
InventoryRouter.post("/receipts", inventoryWarehouseMiddleware, InventoryTransactionController.createReceipt);

module.exports = InventoryRouter;

