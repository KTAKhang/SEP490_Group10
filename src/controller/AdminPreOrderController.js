const PreOrderService = require("../services/PreOrderService");

const listPreOrders = async (req, res) => {
  try {
    const { status, page, limit, keyword, sortBy, sortOrder } = req.query;
    const response = await PreOrderService.getAdminPreOrderList({ status, page, limit, keyword, sortBy, sortOrder });
    return res.status(200).json(response);
  } catch (err) {
    return res.status(500).json({ status: "ERR", message: err.message });
  }
};

const getPreOrderDetail = async (req, res) => {
  try {
    const response = await PreOrderService.getAdminPreOrderDetail(req.params.id);
    return res.status(200).json(response);
  } catch (err) {
    return res.status(err.message === "Không tìm thấy đơn đặt trước" ? 404 : 500).json({ status: "ERR", message: err.message });
  }
};

const markCompleted = async (req, res) => {
  try {
    const response = await PreOrderService.markPreOrderCompleted(req.params.id);
    return res.status(200).json(response);
  } catch (err) {
    return res.status(400).json({ status: "ERR", message: err.message });
  }
};

module.exports = { listPreOrders, getPreOrderDetail, markCompleted };
