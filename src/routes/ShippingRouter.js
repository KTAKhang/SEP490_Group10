const express = require("express");
const routerShipping = express.Router();
const shippingController = require("../controller/ShippingController");
const { authUserMiddleware } = require("../middleware/authMiddleware");

routerShipping.post("/check", authUserMiddleware, shippingController.checkShippingFee);

module.exports = routerShipping;