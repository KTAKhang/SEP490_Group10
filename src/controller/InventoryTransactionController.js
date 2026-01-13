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

module.exports = {
  createReceipt,
};

