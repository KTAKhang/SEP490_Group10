/**
 * author: KhoaNDCE170420
 * Discount Controller - Handles HTTP requests for discount management
 */
const DiscountService = require("../services/DiscountService");

/**
 * Create discount code (SALES-STAFF)
 * POST /api/discounts
 */
const createDiscountController = async (req, res) => {
    try {
        const createdBy = req.user._id;
        const response = await DiscountService.createDiscount(req.body, createdBy);
        const code = response?.status === "OK" ? 201 : 400;
        return res.status(code).json(response);
    } catch (error) {
        return res.status(500).json({
            status: "ERR",
            message: error.message,
        });
    }
};

/**
 * Update discount code (SALES-STAFF)
 * PUT /api/discounts/:discountId
 */
const updateDiscountController = async (req, res) => {
    try {
        const { discountId } = req.params;
        const updatedBy = req.user._id;
        const response = await DiscountService.updateDiscount(discountId, req.body, updatedBy);
        const code = response?.status === "OK" ? 200 : 400;
        return res.status(code).json(response);
    } catch (error) {
        return res.status(500).json({
            status: "ERR",
            message: error.message,
        });
    }
};

/**
 * Approve discount code (ADMIN)
 * PUT /api/discounts/:discountId/approve
 */
const approveDiscountController = async (req, res) => {
    try {
        const { discountId } = req.params;
        const response = await DiscountService.approveDiscount(discountId);
        const code = response?.status === "OK" ? 200 : 400;
        return res.status(code).json(response);
    } catch (error) {
        return res.status(500).json({
            status: "ERR",
            message: error.message,
        });
    }
};

/**
 * Reject discount code (ADMIN)
 * PUT /api/discounts/:discountId/reject
 */
const rejectDiscountController = async (req, res) => {
    try {
        const { discountId } = req.params;
        const { rejectionReason } = req.body;
        const response = await DiscountService.rejectDiscount(discountId, rejectionReason);
        const code = response?.status === "OK" ? 200 : 400;
        return res.status(code).json(response);
    } catch (error) {
        return res.status(500).json({
            status: "ERR",
            message: error.message,
        });
    }
};

/**
 * Deactivate discount code (ADMIN)
 * PUT /api/discounts/:discountId/deactivate
 */
const deactivateDiscountController = async (req, res) => {
    try {
        const { discountId } = req.params;
        const response = await DiscountService.deactivateDiscount(discountId);
        const code = response?.status === "OK" ? 200 : 400;
        return res.status(code).json(response);
    } catch (error) {
        return res.status(500).json({
            status: "ERR",
            message: error.message,
        });
    }
};

/**
 * Activate discount code (ADMIN)
 * PUT /api/discounts/:discountId/activate
 */
const activateDiscountController = async (req, res) => {
    try {
        const { discountId } = req.params;
        const response = await DiscountService.activateDiscount(discountId);
        const code = response?.status === "OK" ? 200 : 400;
        return res.status(code).json(response);
    } catch (error) {
        return res.status(500).json({
            status: "ERR",
            message: error.message,
        });
    }
};

/**
 * Update discount code (ADMIN)
 * PUT /api/discounts/:discountId/admin
 */
const updateDiscountByAdminController = async (req, res) => {
    try {
        const { discountId } = req.params;
        const response = await DiscountService.updateDiscountByAdmin(discountId, req.body);
        const code = response?.status === "OK" ? 200 : 400;
        return res.status(code).json(response);
    } catch (error) {
        return res.status(500).json({
            status: "ERR",
            message: error.message,
        });
    }
};

/**
 * Get discount list (STAFF/ADMIN)
 * GET /api/discounts
 */
const getDiscountsController = async (req, res) => {
    try {
        const response = await DiscountService.getDiscounts(req.query);
        const code = response?.status === "OK" ? 200 : 400;
        return res.status(code).json(response);
    } catch (error) {
        return res.status(500).json({
            status: "ERR",
            message: error.message,
        });
    }
};

/**
 * Get discount details by ID (STAFF/ADMIN)
 * GET /api/discounts/:discountId
 */
const getDiscountByIdController = async (req, res) => {
    try {
        const { discountId } = req.params;
        const response = await DiscountService.getDiscountById(discountId);
        const code = response?.status === "OK" ? 200 : 404;
        return res.status(code).json(response);
    } catch (error) {
        return res.status(500).json({
            status: "ERR",
            message: error.message,
        });
    }
};

/**
 * Get valid discount codes for customer (CUSTOMER)
 * GET /api/discounts/customer/valid
 */
const getValidDiscountsForCustomerController = async (req, res) => {
    try {
        const response = await DiscountService.getValidDiscountsForCustomer();
        const code = response?.status === "OK" ? 200 : 400;
        return res.status(code).json(response);
    } catch (error) {
        return res.status(500).json({
            status: "ERR",
            message: error.message,
        });
    }
};

/**
 * Validate discount code (CUSTOMER)
 * POST /api/discounts/customer/validate
 */
const validateDiscountCodeController = async (req, res) => {
    try {
        const { code, orderValue } = req.body;
        const userId = req.user._id;
        const response = await DiscountService.validateDiscountCode(code, userId, orderValue);
        const statusCode = response?.status === "OK" ? 200 : 400;
        return res.status(statusCode).json(response);
    } catch (error) {
        return res.status(500).json({
            status: "ERR",
            message: error.message,
        });
    }
};

/**
 * Apply discount code (CUSTOMER)
 * POST /api/discounts/customer/apply
 */
const applyDiscountCodeController = async (req, res) => {
    try {
        const { discountId, orderValue, orderId } = req.body;
        const userId = req.user._id;
        const response = await DiscountService.applyDiscountCode(discountId, userId, orderValue, orderId);
        const code = response?.status === "OK" ? 200 : 400;
        return res.status(code).json(response);
    } catch (error) {
        return res.status(500).json({
            status: "ERR",
            message: error.message,
        });
    }
};

/**
 * Get discount usage history (CUSTOMER)
 * GET /api/discounts/customer/history
 */
const getDiscountUsageHistoryController = async (req, res) => {
    try {
        const userId = req.user._id;
        const response = await DiscountService.getDiscountUsageHistory(userId);
        const code = response?.status === "OK" ? 200 : 400;
        return res.status(code).json(response);
    } catch (error) {
        return res.status(500).json({
            status: "ERR",
            message: error.message,
        });
    }
};

module.exports = {
    createDiscountController,
    updateDiscountController,
    approveDiscountController,
    rejectDiscountController,
    deactivateDiscountController,
    activateDiscountController,
    updateDiscountByAdminController,
    getDiscountsController,
    getDiscountByIdController,
    getValidDiscountsForCustomerController,
    validateDiscountCodeController,
    applyDiscountCodeController,
    getDiscountUsageHistoryController,
};
