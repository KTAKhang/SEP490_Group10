const express = require("express");
const routerOrder = express.Router();
const orderController = require("../controller/OrderController");


const {
    authAdminOrSalesStaffForOrderMiddleware,
    authUserMiddleware
} = require("../middleware/authMiddleware");
// Admin + Sales-staff: danh sách order + thống kê + danh sách log thay đổi trạng thái
routerOrder.get("/", authAdminOrSalesStaffForOrderMiddleware, orderController.getOrdersAdmin);
routerOrder.get("/stats", authAdminOrSalesStaffForOrderMiddleware, orderController.getOrderStatusStatsAdmin);
routerOrder.get("/status-logs", authAdminOrSalesStaffForOrderMiddleware, orderController.getOrderStatusLogs);
routerOrder.post("/create", authUserMiddleware, orderController.createOrder);
// Customer: Lịch sử mua hàng
routerOrder.get("/my-orders", authUserMiddleware, orderController.getMyOrders);
routerOrder.get("/my-orders/:id", authUserMiddleware, orderController.getMyOrderById);
// Admin + Sales-staff: chi tiết order + log thay đổi trạng thái + cập nhật trạng thái
routerOrder.get("/:id/status-logs", authAdminOrSalesStaffForOrderMiddleware, orderController.getOrderStatusLogs);
routerOrder.get("/:id", authAdminOrSalesStaffForOrderMiddleware, orderController.getOrderDetailAdmin);
routerOrder.put("/update/:id", authAdminOrSalesStaffForOrderMiddleware, orderController.updateOrder);
routerOrder.put("/:id/payment-refund-done", authAdminOrSalesStaffForOrderMiddleware, orderController.confirmRefundPayment);
routerOrder.put("/cancel/:id", authUserMiddleware, orderController.cancelOrder);
routerOrder.post("/retry-payment", authUserMiddleware, orderController.retryVnpayPayment);
module.exports = routerOrder;