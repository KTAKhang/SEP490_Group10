/**
 * Customer Routes - Định nghĩa các route cho quản lý khách hàng
 */
const express = require("express");
const router = express.Router();
const CustomerController = require("../controller/CustomerController");
const { authAdminMiddleware } = require("../middleware/authMiddleware");

// Apply admin authentication middleware to all customer routes
router.use(authAdminMiddleware);

/**
 * @route   GET /customers/search
 * @desc    Tìm kiếm khách hàng theo từ khóa
 * @query   keyword, page, limit, status, sortBy, sortOrder
 * @access  Admin
 * @note    Route này phải đặt TRƯỚC route /:id để tránh conflict
 */
router.get("/search", CustomerController.searchCustomers);

/**
 * @route   GET /customers/filter
 * @desc    Lọc khách hàng theo tiêu chí
 * @query   status, isGoogleAccount, page, limit, sortBy, sortOrder
 * @access  Admin
 */
router.get("/filter", CustomerController.filterCustomers);

/**
 * @route   GET /customers
 * @desc    Lấy danh sách khách hàng với phân trang và sắp xếp
 * @query   page, limit, status, sortBy, sortOrder
 * @access  Admin
 */
router.get("/", CustomerController.getCustomers);

/**
 * @route   PATCH /customers/:id/status
 * @desc    Cập nhật trạng thái active/inactive của khách hàng
 * @params  id - Customer ID
 * @body    { status: true/false hoặc "active"/"inactive" }
 * @access  Admin
 */
router.patch("/:id/status", CustomerController.updateCustomerStatus);

/**
 * @route   GET /customers/:id
 * @desc    Lấy thông tin chi tiết một khách hàng
 * @params  id - Customer ID
 * @access  Admin
 */
router.get("/:id", CustomerController.getCustomerDetails);

module.exports = router;