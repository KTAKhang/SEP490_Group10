const express = require("express");
const routerOrder = express.Router();
const orderController = require("../controller/OrderController");

const {
    authAdminMiddleware,
    authMiddleware,
    authUserMiddleware
} = require("../middleware/authMiddleware");

// Admin: danh sách order + thống kê
routerOrder.get("/", authAdminMiddleware, orderController.getOrdersAdmin);
routerOrder.get("/stats", authAdminMiddleware, orderController.getOrderStatusStatsAdmin);

routerOrder.post("/create", authUserMiddleware, orderController.createOrder);

// Customer: Lịch sử mua hàng
routerOrder.get("/my-orders", authUserMiddleware, orderController.getMyOrders);
routerOrder.get("/my-orders/:id", authUserMiddleware, orderController.getMyOrderById);

// Admin: chi tiết order
routerOrder.get("/:id", authAdminMiddleware, orderController.getOrderDetailAdmin);

routerOrder.put("/update/:id", authAdminMiddleware, orderController.updateOrder);

routerOrder.put("/cancel/:id", authUserMiddleware, orderController.cancelOrder);

routerOrder.post("/retry-payment", authUserMiddleware, orderController.retryVnpayPayment);

module.exports = routerOrder;