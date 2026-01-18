const ProductBatchService = require("../services/ProductBatchService");

/**
 * Reset product để nhập lô mới (thủ công bởi admin)
 * PATCH /admin/products/:id/reset-batch
 */
const resetProductBatch = async (req, res) => {
  try {
    const { id } = req.params;
    const { completionReason = "SOLD_OUT" } = req.body; // "SOLD_OUT" | "EXPIRED"

    const response = await ProductBatchService.resetProductForNewBatch(id, completionReason);
    
    if (response.status === "ERR") {
      return res.status(400).json(response);
    }
    
    return res.status(200).json(response);
  } catch (error) {
    return res.status(500).json({ status: "ERR", message: error.message });
  }
};

/**
 * Lấy lịch sử lô hàng của một sản phẩm
 * GET /admin/products/:id/batch-history
 */
const getProductBatchHistory = async (req, res) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 20 } = req.query;

    const response = await ProductBatchService.getProductBatchHistory(id, { page, limit });
    
    if (response.status === "ERR") {
      return res.status(400).json(response);
    }
    
    return res.status(200).json(response);
  } catch (error) {
    return res.status(500).json({ status: "ERR", message: error.message });
  }
};

/**
 * (Admin only) Chạy thủ công auto-reset expired products
 * POST /admin/products/batch/auto-reset-expired
 */
const manualAutoResetExpired = async (req, res) => {
  try {
    const response = await ProductBatchService.autoResetExpiredProducts();
    
    if (response.status === "ERR") {
      return res.status(400).json(response);
    }
    
    return res.status(200).json(response);
  } catch (error) {
    return res.status(500).json({ status: "ERR", message: error.message });
  }
};

module.exports = {
  resetProductBatch,
  getProductBatchHistory,
  manualAutoResetExpired,
};
