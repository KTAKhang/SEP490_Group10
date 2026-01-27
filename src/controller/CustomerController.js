/**
 * author: KhoaNDCE170420
 * Customer Controller - handles requests for customer management
 */
const CustomerService = require("../services/CustomerService");

const CustomerController = {
    /**
     * Get list of customers
     * GET /customers
     * Query params: page, limit, status, sortBy, sortOrder
     */
    async getCustomers(req, res) {
        try {
            const result = await CustomerService.getCustomers(req.query);
            
            if (result.status === "OK") {
                return res.status(200).json(result);
            }
            return res.status(400).json(result);
        } catch (error) {
            return res.status(500).json({
                status: "ERR",
                message: error.message
            });
        }
    },

    /**
     * Get detailed information of a customer
     * GET customers/:id
     */
    async getCustomerDetails(req, res) {
        try {
            const { id } = req.params;
            const result = await CustomerService.getCustomerDetails(id);
            
            if (result.status === "OK") {
                return res.status(200).json(result);
            }
            return res.status(404).json(result);
        } catch (error) {
            return res.status(500).json({
                status: "ERR",
                message: error.message
            });
        }
    },

    /**
     * Update customer's active/inactive status
     * PATCH /customers/:id/status
     * Body: { status: true/false or "active"/"inactive" }
     */
    async updateCustomerStatus(req, res) {
        try {
            const { id } = req.params;
            const { status } = req.body;
            
            if (status === undefined || status === null) {
                return res.status(400).json({
                    status: "ERR",
                    message: "Status is required"
                });
            }

            const result = await CustomerService.updateCustomerStatus(id, status);
            
            if (result.status === "OK") {
                return res.status(200).json(result);
            }
            return res.status(400).json(result);
        } catch (error) {
            return res.status(500).json({
                status: "ERR",
                message: error.message
            });
        }
    },

    /**
     * Search customers
     * GET /customers/search
     * Query params: keyword, page, limit, status, sortBy, sortOrder
     */
    async searchCustomers(req, res) {
        try {
            const { keyword, ...queryParams } = req.query;
            
            if (!keyword || keyword.trim() === "") {
                return res.status(400).json({
                    status: "ERR",
                    message: "Search keyword is required"
                });
            }

            const result = await CustomerService.searchCustomers(keyword, queryParams);
            
            if (result.status === "OK") {
                return res.status(200).json(result);
            }
            return res.status(400).json(result);
        } catch (error) {
            return res.status(500).json({
                status: "ERR",
                message: error.message
            });
        }
    },

    /**
     * Filter customers by criteria
     * GET /customers/filter
     * Query params: status, isGoogleAccount, page, limit, sortBy, sortOrder
     */
    async filterCustomers(req, res) {
        try {
            const result = await CustomerService.filterCustomers(req.query);
            
            if (result.status === "OK") {
                return res.status(200).json(result);
            }
            return res.status(400).json(result);
        } catch (error) {
            return res.status(500).json({
                status: "ERR",
                message: error.message
            });
        }
    },

    /**
     * Get all orders for a customer
     * GET /customers/:id/orders
     */
    async getCustomerOrders(req, res) {
        try {
            const { id } = req.params;
            const result = await CustomerService.getCustomerOrders(id);
            
            if (result.status === "OK") {
                return res.status(200).json(result);
            }
            return res.status(404).json(result);
        } catch (error) {
            return res.status(500).json({
                status: "ERR",
                message: error.message
            });
        }
    }
};

module.exports = CustomerController;