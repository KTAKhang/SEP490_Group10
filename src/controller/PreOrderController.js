const PreOrderService = require("../services/PreOrderService");

const createPaymentIntent = async (req, res) => {
  try {
    const userId = req.user._id;
    const { fruitTypeId, quantityKg, receiverInfo } = req.body;
    const ip = req.ip || req.connection?.remoteAddress || "127.0.0.1";
    if (!fruitTypeId || quantityKg == null) {
      return res.status(400).json({ success: false, message: "Missing fruitTypeId or quantityKg" });
    }
    const result = await PreOrderService.createPaymentIntentAndGetPayUrl({
      userId,
      fruitTypeId,
      quantityKg,
      ip,
      receiverInfo: receiverInfo || null,
    });
    return res.status(200).json(result);
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
};

const getMyPreOrders = async (req, res) => {
  try {
    const userId = req.user._id;
    const response = await PreOrderService.getMyPreOrders(userId);
    return res.status(200).json(response);
  } catch (err) {
    return res.status(500).json({ status: "ERR", message: err.message });
  }
};

const cancelPreOrder = async (req, res) => {
  try {
    const userId = req.user._id;
    const preOrderId = req.params.id;
    const response = await PreOrderService.cancelPreOrder(preOrderId, userId);
    return res.status(200).json(response);
  } catch (err) {
    return res.status(400).json({ status: "ERR", message: err.message });
  }
};

const createRemainingPayment = async (req, res) => {
  try {
    const userId = req.user._id;
    const preOrderId = req.params.id;
    const ip = req.ip || req.connection?.remoteAddress || "127.0.0.1";
    const result = await PreOrderService.createRemainingPaymentIntent(preOrderId, userId, ip);
    return res.status(200).json(result);
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
};

module.exports = {
  createPaymentIntent,
  getMyPreOrders,
  cancelPreOrder,
  createRemainingPayment,
};
