const express = require("express");
const router = express.Router();
const FruitTypeController = require("../controller/FruitTypeController");
const PreOrderController = require("../controller/PreOrderController");
const { authUserMiddleware } = require("../middleware/authMiddleware");

router.get("/fruit-types", FruitTypeController.listAvailable);
router.get("/fruit-types/:id", FruitTypeController.getAvailableById);
router.post("/create-payment-intent", authUserMiddleware, PreOrderController.createPaymentIntent);
router.get("/my-pre-orders", authUserMiddleware, PreOrderController.getMyPreOrders);
router.put("/cancel/:id", authUserMiddleware, PreOrderController.cancelPreOrder);
router.post("/create-remaining-payment/:id", authUserMiddleware, PreOrderController.createRemainingPayment);

module.exports = router;
