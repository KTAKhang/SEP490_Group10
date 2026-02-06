const express = require("express");
const routerPayment = express.Router();
const paymentController = require("../controller/PaymentController");
const { authUserMiddleware } = require("../middleware/authMiddleware");

routerPayment.post("/vnpay/create", authUserMiddleware, paymentController.createVnpayPaymentUrl);
routerPayment.get("/vnpay/return", paymentController.vnpayReturn);

module.exports = routerPayment;