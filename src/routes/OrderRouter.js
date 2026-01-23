const express = require("express");
const routerOrder = express.Router();
const orderController = require("../controller/OrderController");

const {
    authAdminMiddleware,
    authMiddleware,
    authUserMiddleware
} = require("../middleware/authMiddleware");

routerOrder.post("/create", authUserMiddleware, orderController.createOrder);

routerOrder.put("/update/:id", authAdminMiddleware, orderController.updateOrder);

routerOrder.put("/cancel/:id", authUserMiddleware, orderController.cancelOrder);

routerOrder.post("/retry-payment", authUserMiddleware, orderController.retryVnpayPayment);

module.exports = routerOrder;