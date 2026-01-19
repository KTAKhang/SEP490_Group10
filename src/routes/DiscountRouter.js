/**
 * author : KhoaNDCE170420
 * Discount Router - Routes for discount management
 * Role-based access control:
 * - sales-staff: Create, Update (PENDING only)
 * - admin: Approve, Reject, Activate, Deactivate, Update (unused only), View all
 * - customer: View valid discounts, Validate, Apply, View history
 */
const express = require("express");
const router = express.Router();
const {
    authAdminMiddleware,
    authSalesStaffMiddleware,
    authStaffOrAdminMiddleware,
    authUserMiddleware,
} = require("../middleware/authMiddleware");
const {
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
} = require("../controller/DiscountController");

// ===== SALES-STAFF ROUTES =====
// Create discount code 
router.post("/", authSalesStaffMiddleware, createDiscountController);

// Update discount code 
router.put("/:discountId", authSalesStaffMiddleware, updateDiscountController);

// ===== ADMIN ROUTES =====
// Approve discount code 
router.put("/:discountId/approve", authAdminMiddleware, approveDiscountController);

// Reject discount code 
router.put("/:discountId/reject", authAdminMiddleware, rejectDiscountController);

// Deactivate discount code 
router.put("/:discountId/deactivate", authAdminMiddleware, deactivateDiscountController);

// Activate discount code   
router.put("/:discountId/activate", authAdminMiddleware, activateDiscountController);

// Update discount code 
router.put("/:discountId/admin", authAdminMiddleware, updateDiscountByAdminController);

// ===== STAFF/ADMIN ROUTES =====
// Get discount list (staff/admin)
router.get("/", authStaffOrAdminMiddleware, getDiscountsController);

// Get discount details by ID (staff/admin)
router.get("/:discountId", authStaffOrAdminMiddleware, getDiscountByIdController);

// ===== CUSTOMER ROUTES =====
// Get valid discount codes for customer
router.get("/customer/valid", authUserMiddleware, getValidDiscountsForCustomerController);

// Validate discount code
router.post("/customer/validate", authUserMiddleware, validateDiscountCodeController);

// Apply discount code (when order is created)
router.post("/customer/apply", authUserMiddleware, applyDiscountCodeController);

// Get discount usage history
router.get("/customer/history", authUserMiddleware, getDiscountUsageHistoryController);

module.exports = router;
