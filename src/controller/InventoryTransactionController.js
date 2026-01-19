const InventoryTransactionService = require("../services/InventoryTransactionService");

/**
 * Warehouse staff: tạo phiếu nhập kho (RECEIPT)
 * POST /inventory/receipts
 */
const createReceipt = async (req, res) => {
  try {
    const userId = req.user._id;
    const response = await InventoryTransactionService.createReceipt(userId, req.body);
    if (response.status === "ERR") return res.status(400).json(response);
    return res.status(201).json(response);
  } catch (error) {
    return res.status(500).json({ status: "ERR", message: error.message });
  }
};

/**
 * Tạo phiếu xuất kho (ISSUE) - có thể được gọi từ order service hoặc sale service
 * POST /inventory/issues
 */
const createIssue = async (req, res) => {
  try {
    const userId = req.user._id;
    const response = await InventoryTransactionService.createIssue(userId, req.body);
    if (response.status === "ERR") return res.status(400).json(response);
    return res.status(201).json(response);
  } catch (error) {
    return res.status(500).json({ status: "ERR", message: error.message });
  }
};

/**
 * Lấy lịch sử nhập hàng (RECEIPT transactions)
 * GET /inventory/receipts
 */
const getReceiptHistory = async (req, res) => {
  try {
    const response = await InventoryTransactionService.getReceiptHistory(req.query);
    if (response.status === "ERR") return res.status(400).json(response);
    return res.status(200).json(response);
  } catch (error) {
    return res.status(500).json({ status: "ERR", message: error.message });
  }
};

/**
 * Lấy lịch sử tất cả transactions
 * GET /inventory/transactions
 */
const getTransactionHistory = async (req, res) => {
  try {
    const response = await InventoryTransactionService.getTransactionHistory(req.query);
    if (response.status === "ERR") return res.status(400).json(response);
    return res.status(200).json(response);
  } catch (error) {
    return res.status(500).json({ status: "ERR", message: error.message });
  }
};

/**
 * Lấy chi tiết một phiếu nhập hàng theo ID
 * GET /inventory/receipts/:id
 */
const getReceiptById = async (req, res) => {
  try {
    const { id } = req.params;
    const response = await InventoryTransactionService.getReceiptById(id);
    if (response.status === "ERR") return res.status(404).json(response);
    return res.status(200).json(response);
  } catch (error) {
    return res.status(500).json({ status: "ERR", message: error.message });
  }
};

module.exports = {
  createReceipt,
  createIssue,
  getReceiptHistory,
  getTransactionHistory,
  getReceiptById,
};

