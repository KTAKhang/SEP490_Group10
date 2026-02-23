/**
 * Admin Pre-order Controller
 *
 * HTTP layer for admin (and sales-staff) pre-order management. Delegates to PreOrderService.
 *
 * Handles:
 * - GET /pre-orders: list pre-orders with filters (status, keyword, sort, pagination)
 * - GET /pre-orders/:id: get pre-order detail
 * - PUT /pre-orders/:id/complete: mark pre-order as completed (delivery done)
 * - PUT /pre-orders/:id/refund: mark pre-order as refunded
 * - PUT /pre-orders/:id/cancel: mark pre-order as cancelled (admin only; customer cannot cancel)
 *
 * @module controller/AdminPreOrderController
 */
const PreOrderService = require("../services/PreOrderService");

/**
 * List pre-orders with optional status, keyword, sort and pagination.
 * @param {Object} req - Express request (query: status, page, limit, keyword, sortBy, sortOrder)
 * @param {Object} res - Express response
 */
const listPreOrders = async (req, res) => {
  try {
    const { status, page, limit, keyword, sortBy, sortOrder } = req.query;
    const response = await PreOrderService.getAdminPreOrderList({ status, page, limit, keyword, sortBy, sortOrder });
    return res.status(200).json(response);
  } catch (err) {
    return res.status(500).json({ status: "ERR", message: err.message });
  }
};

/**
 * Get a single pre-order by ID (populated customer and fruit type).
 * @param {Object} req - Express request (params.id)
 * @param {Object} res - Express response
 */
const getPreOrderDetail = async (req, res) => {
  try {
    const response = await PreOrderService.getAdminPreOrderDetail(req.params.id);
    return res.status(200).json(response);
  } catch (err) {
    return res.status(err.message === "Pre-order not found" ? 404 : 500).json({ status: "ERR", message: err.message });
  }
};

/**
 * Mark pre-order as completed (delivery done). Allowed only when status is READY_FOR_FULFILLMENT.
 * @param {Object} req - Express request (params.id)
 * @param {Object} res - Express response
 */
const markCompleted = async (req, res) => {
  try {
    const response = await PreOrderService.markPreOrderCompleted(req.params.id);
    return res.status(200).json(response);
  } catch (err) {
    return res.status(400).json({ status: "ERR", message: err.message });
  }
};

/**
 * Mark pre-order as refunded. Allowed from any status except already REFUND.
 * @param {Object} req - Express request (params.id)
 * @param {Object} res - Express response
 */
const markRefund = async (req, res) => {
  try {
    const response = await PreOrderService.markPreOrderRefunded(req.params.id);
    return res.status(200).json(response);
  } catch (err) {
    return res.status(400).json({ status: "ERR", message: err.message });
  }
};

/**
 * Mark pre-order as cancelled (admin only). Allowed only from WAITING_FOR_ALLOCATION, WAITING_FOR_NEXT_BATCH, ALLOCATED_WAITING_PAYMENT.
 * Customer cannot cancel pre-orders (business rule).
 */
const markCancel = async (req, res) => {
  try {
    const response = await PreOrderService.markPreOrderCancelled(req.params.id);
    return res.status(200).json(response);
  } catch (err) {
    return res.status(400).json({ status: "ERR", message: err.message });
  }
};

module.exports = { listPreOrders, getPreOrderDetail, markCompleted, markRefund, markCancel };
