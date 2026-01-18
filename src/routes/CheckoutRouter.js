const express = require("express");
const routerCheckout = express.Router();
const checkoutController = require("../controller/CheckoutController");
const { authUserMiddleware } = require("../middleware/authMiddleware");

// Giữ hàng khi checkout
routerCheckout.post("/hold", authUserMiddleware, checkoutController.checkoutHold);
routerCheckout.post("/cancel", authUserMiddleware, checkoutController.cancelCheckout);

module.exports = routerCheckout;
