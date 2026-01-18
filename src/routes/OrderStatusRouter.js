const express = require("express");
const routerOrderStatus = express.Router();
const orderStatusController = require("../controller/OrderStatusController");
const {
    authMiddleware,
    authAdminMiddleware,
    authUserMiddleware,
} = require("../middleware/authMiddleware");


routerOrderStatus.get("/", authUserMiddleware, orderStatusController.getAllOrderStatus);

module.exports = routerOrderStatus;