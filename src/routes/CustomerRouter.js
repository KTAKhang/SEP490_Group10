/**
 * author: KhoaNDCE170420
 * Customer Router - routes for customer management
 */
const express = require("express");
const router = express.Router();
const CustomerController = require("../controller/CustomerController");
const { authAdminMiddleware } = require("../middleware/authMiddleware");

// Apply admin authentication middleware to all customer routes
router.use(authAdminMiddleware);

/**
 * @route   GET /customers/search
 * @desc    Search customers by keyword
 * @query   keyword, page, limit, status, sortBy, sortOrder
 * @access  Admin
 * 
 */
router.get("/search", CustomerController.searchCustomers);

/**
 * @route   GET /customers/filter
 * @desc    Filter customers by criteria
 * @query   status, isGoogleAccount, page, limit, sortBy, sortOrder
 * @access  Admin
 */
router.get("/filter", CustomerController.filterCustomers);

/**
 * @route   GET /customers
 * @desc    Get list of customers with pagination and sorting
 * @query   page, limit, status, sortBy, sortOrder
 * @access  Admin
 */
router.get("/", CustomerController.getCustomers);

/**
 * @route   PATCH /customers/:id/status
 * @desc    Update customer's active/inactive status
 * @params  id - Customer ID
 * @body    { status: true/false or "active"/"inactive" }
 * @access  Admin
 */
router.patch("/:id/status", CustomerController.updateCustomerStatus);

/**
 * @route   GET /customers/:id
 * @desc    Get detailed information of a customer
 * @params  id - Customer ID
 * @access  Admin
 */
router.get("/:id", CustomerController.getCustomerDetails);

module.exports = router;