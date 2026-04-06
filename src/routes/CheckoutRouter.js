const express = require("express");
const routerCheckout = express.Router();
const checkoutController = require("../controller/CheckoutController");
const { authUserMiddleware,customerMiddleware } = require("../middleware/authMiddleware");

// Giữ hàng khi checkout
routerCheckout.post("/hold", customerMiddleware, checkoutController.checkoutHold);
routerCheckout.post("/cancel", customerMiddleware, checkoutController.cancelCheckout);

module.exports = routerCheckout;
