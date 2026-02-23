const PreOrderService = require("../services/PreOrderService");

const createPaymentIntent = async (req, res) => {
  try {
    const userId = req.user._id;
    const { fruitTypeId, quantityKg, receiverInfo, returnUrl: bodyReturnUrl, platform: bodyPlatform } = req.body || {};
    const ip = req.ip || req.connection?.remoteAddress || "127.0.0.1";
    if (!fruitTypeId || quantityKg == null) {
      return res.status(400).json({ success: false, message: "Missing fruitTypeId or quantityKg" });
    }
    const platform = bodyPlatform || req.get("X-Platform") || undefined;
    const appReturnUrlDefault = process.env.VNP_RETURN_URL_APP || "shopapp://payment/vnpay/return";
    const returnUrl = bodyReturnUrl || (platform === "app" ? appReturnUrlDefault : null);
    const result = await PreOrderService.createPaymentIntentAndGetPayUrl({
      userId,
      fruitTypeId,
      quantityKg,
      ip,
      receiverInfo: receiverInfo || null,
      returnUrl: returnUrl || null,
      platform: platform || undefined,
    });
    return res.status(200).json(result);
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
};

const getMyPreOrders = async (req, res) => {
  try {
    const userId = req.user._id;
    const { page, limit, sortBy, sortOrder, status } = req.query;
    const response = await PreOrderService.getMyPreOrders(userId, { page, limit, sortBy, sortOrder, status });
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
    const platform = req.body?.platform || req.get("X-Platform") || undefined;
    const appReturnUrlDefault = process.env.VNP_RETURN_URL_APP || "shopapp://payment/vnpay/return";
    const returnUrl = req.body?.returnUrl || (platform === "app" ? appReturnUrlDefault : null);
    const result = await PreOrderService.createRemainingPaymentIntent(preOrderId, userId, ip, returnUrl || null, platform);
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
