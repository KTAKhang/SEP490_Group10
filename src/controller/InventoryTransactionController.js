const InventoryTransactionService = require("../services/InventoryTransactionService");

/**
 * BR-WH-02: Admin xem toàn bộ lịch sử nhập kho; Warehouse staff chỉ xem của chính mình.
 * Trả về true nếu user hiện tại là warehouse staff (không phải Admin).
 */
const isWarehouseStaffOnly = (req) => {
  const role = (req.user?.role || req.user?.role_id?.name || "")
    .toString()
    .toLowerCase()
    .replace(/_/g, "-");
  return role === "warehouse-staff";
};

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
 *
 * BR-WH-02: Warehouse staff bị giới hạn chỉ xem các phiếu do chính họ tạo;
 * Admin xem toàn bộ. Tham số createdBy trên query bị bỏ qua nếu là warehouse staff.
 */
const getReceiptHistory = async (req, res) => {
  try {
    const filters = { ...req.query };
    if (isWarehouseStaffOnly(req)) {
      filters.createdBy = req.user._id.toString();
    }
    const response = await InventoryTransactionService.getReceiptHistory(filters);
    if (response.status === "ERR") return res.status(400).json(response);
    return res.status(200).json(response);
  } catch (error) {
    return res.status(500).json({ status: "ERR", message: error.message });
  }
};

/**
 * Lấy lịch sử tất cả transactions
 * GET /inventory/transactions
 *
 * BR-WH-02: Warehouse staff chỉ xem các transactions do chính họ tạo;
 * Admin xem toàn bộ.
 */
const getTransactionHistory = async (req, res) => {
  try {
    const filters = { ...req.query };
    if (isWarehouseStaffOnly(req)) {
      filters.createdBy = req.user._id.toString();
    }
    const response = await InventoryTransactionService.getTransactionHistory(filters);
    if (response.status === "ERR") return res.status(400).json(response);
    return res.status(200).json(response);
  } catch (error) {
    return res.status(500).json({ status: "ERR", message: error.message });
  }
};

/**
 * Lấy chi tiết một phiếu nhập hàng theo ID
 * GET /inventory/receipts/:id
 *
 * BR-WH-02: Warehouse staff chỉ được xem chi tiết phiếu do chính họ tạo;
 * Admin xem mọi phiếu.
 */
const getReceiptById = async (req, res) => {
  try {
    const { id } = req.params;
    const response = await InventoryTransactionService.getReceiptById(id);
    if (response.status === "ERR") return res.status(404).json(response);

    if (isWarehouseStaffOnly(req)) {
      const ownerId =
        response?.data?.createdBy?._id?.toString?.() ||
        response?.data?.createdBy?.toString?.();
      if (!ownerId || ownerId !== req.user._id.toString()) {
        return res.status(403).json({
          status: "ERR",
          message: "You can only view receipts you created.",
        });
      }
    }
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

