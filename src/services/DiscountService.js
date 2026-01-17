/**
 * Author: KhoaNDCE170420
 * Business logic layer for discount / promotion code management.
 *
 * This service handles all discount-related operations for:
 * - Sales Staff: create & update discount codes in PENDING state
 * - Admin: approve, reject, activate, deactivate, and update discounts
 * - Customer: view, validate, and apply discount codes
 *
 * Core responsibilities:
 * - Enforce discount lifecycle (PENDING → APPROVED / REJECTED)
 * - Validate discount rules (date, usage limit, order value)
 * - Track discount usage per user
 * - Prevent invalid updates once discounts are used
 */

const DiscountModel = require("../models/DiscountModel");
const DiscountUsageModel = require("../models/DiscountUsage");
const UserModel = require("../models/UserModel");
const RoleModel = require("../models/RolesModel");

const DiscountService = {
    /**
     * Create a new discount code (SALES-STAFF only)
     *
     * Business rules:
     * - Newly created discounts must start with status = "PENDING"
     * - Discount is inactive until approved by Admin
     * - Discount code must be unique
     * - Discount percentage must be between 1 and 100
     *
     * @param {Object} data - Discount creation data
     * @param {String} createdBy - User ID of sales staff
     * @returns {Object} Result object
     */
    async createDiscount(data, createdBy) {
        try {
            const {
                code,
                discountPercent,
                minOrderValue,
                maxDiscountAmount,
                startDate,
                endDate,
                usageLimit,
                description,
            } = data;

            // Validate required fields
            if (!code || !discountPercent || !minOrderValue || !maxDiscountAmount || !startDate || !endDate) {
                return { status: "ERR", message: "Missing required fields" };
            }

            // Validate date range
            const start = new Date(startDate);
            const end = new Date(endDate);

            if (start >= end) {
                return { status: "ERR", message: "End date must be after start date" };
            }

            // Check duplicate discount code
            const existingDiscount = await DiscountModel.findOne({ code: code.toUpperCase() });
            if (existingDiscount) {
                return { status: "ERR", message: "Discount code already exists" };
            }

            // Validate discount percentage
            if (discountPercent < 1 || discountPercent > 100) {
                return { status: "ERR", message: "Discount percentage must be between 1 and 100" };
            }

            // Create new discount in PENDING state
            const newDiscount = new DiscountModel({
                code: code.toUpperCase(),
                discountPercent,
                minOrderValue,
                maxDiscountAmount,
                startDate: start,
                endDate: end,
                usageLimit: usageLimit || null,
                usedCount: 0,
                status: "PENDING",
                isActive: false,
                createdBy,
                description: description || "",
            });

            await newDiscount.save();

            return {
                status: "OK",
                message: "Discount code created successfully. Waiting for admin approval.",
                data: newDiscount,
            };
        } catch (error) {
            return { status: "ERR", message: error.message };
        }
    },

    /**
     * Update discount code (SALES-STAFF only)
     *
     * Business rules:
     * - Only discounts with status = "PENDING" can be updated
     * - Approved or rejected discounts are immutable by staff
     *
     * @param {String} discountId - Discount ID
     * @param {Object} data - Fields to update
     * @param {String} updatedBy - User ID
     * @returns {Object} Result object
     */
    async updateDiscount(discountId, data, updatedBy) {
        try {
            const discount = await DiscountModel.findById(discountId);
            if (!discount) {
                return { status: "ERR", message: "Discount not found" };
            }

            if (discount.status !== "PENDING") {
                return {
                    status: "ERR",
                    message: "Cannot update discount. Only PENDING discounts can be updated.",
                };
            }

            // Validate updated date range
            if (data.startDate || data.endDate) {
                const start = data.startDate ? new Date(data.startDate) : discount.startDate;
                const end = data.endDate ? new Date(data.endDate) : discount.endDate;

                if (start >= end) {
                    return { status: "ERR", message: "End date must be after start date" };
                }
            }

            // Apply allowed updates
            if (data.code) discount.code = data.code.toUpperCase();
            if (data.discountPercent !== undefined) discount.discountPercent = data.discountPercent;
            if (data.minOrderValue !== undefined) discount.minOrderValue = data.minOrderValue;
            if (data.maxDiscountAmount !== undefined) discount.maxDiscountAmount = data.maxDiscountAmount;
            if (data.startDate) discount.startDate = new Date(data.startDate);
            if (data.endDate) discount.endDate = new Date(data.endDate);
            if (data.usageLimit !== undefined) discount.usageLimit = data.usageLimit;
            if (data.description !== undefined) discount.description = data.description;

            // Validate discount percentage again after update
            if (discount.discountPercent < 1 || discount.discountPercent > 100) {
                return { status: "ERR", message: "Discount percentage must be between 1 and 100" };
            }

            await discount.save();

            return {
                status: "OK",
                message: "Discount code updated successfully",
                data: discount,
            };
        } catch (error) {
            return { status: "ERR", message: error.message };
        }
    },

    /**
     * Approve discount code (for admin only)
     *
     * Business rules:
     * - Only Admin can approve discounts
     * - Approved discounts become active and usable by customers
     *
     * @param {String} discountId - Discount ID
     * @returns {Object} Result object
     */
    async approveDiscount(discountId) {
        try {
            const discount = await DiscountModel.findById(discountId);
            if (!discount) {
                return { status: "ERR", message: "Discount not found" };
            }

            if (discount.status === "APPROVED") {
                return { status: "ERR", message: "Discount is already approved" };
            }

            discount.status = "APPROVED";
            discount.isActive = true;
            discount.rejectionReason = null;

            await discount.save();

            return {
                status: "OK",
                message: "Discount code approved successfully",
                data: discount,
            };
        } catch (error) {
            return { status: "ERR", message: error.message };
        }
    },

    /**
     * Reject discount code (for admin only)
     *
     * Business rules:
     * - Admin must provide a rejection reason
     * - Rejected discounts cannot be used by customers
     *
     * @param {String} discountId - Discount ID
     * @param {String} rejectionReason - Reason for rejection
     * @returns {Object} Result object
     */
    async rejectDiscount(discountId, rejectionReason) {
        try {
            if (!rejectionReason || rejectionReason.trim().length === 0) {
                return { status: "ERR", message: "Rejection reason is required" };
            }

            const discount = await DiscountModel.findById(discountId);
            if (!discount) {
                return { status: "ERR", message: "Discount not found" };
            }

            if (discount.status === "REJECTED") {
                return { status: "ERR", message: "Discount is already rejected" };
            }

            discount.status = "REJECTED";
            discount.isActive = false;
            discount.rejectionReason = rejectionReason.trim();

            await discount.save();

            return {
                status: "OK",
                message: "Discount code rejected successfully",
                data: discount,
            };
        } catch (error) {
            return { status: "ERR", message: error.message };
        }
    },

    /**
     * Deactivate an approved discount (for admin only)
     *
     * Use case:
     * - Temporarily stop a discount due to business reasons
     *
     * @param {String} discountId
     * @returns {Object}
     */
    async deactivateDiscount(discountId) {
        try {
            const discount = await DiscountModel.findById(discountId);
            if (!discount) {
                return { status: "ERR", message: "Discount not found" };
            }

            if (discount.status !== "APPROVED") {
                return { status: "ERR", message: "Only approved discounts can be deactivated" };
            }

            discount.isActive = false;
            await discount.save();

            return {
                status: "OK",
                message: "Discount code deactivated successfully",
                data: discount,
            };
        } catch (error) {
            return { status: "ERR", message: error.message };
        }
    },

    /**
     * Activate an approved discount (for admin only)
     *
     * @param {String} discountId
     * @returns {Object}
     */
    async activateDiscount(discountId) {
        try {
            const discount = await DiscountModel.findById(discountId);
            if (!discount) {
                return { status: "ERR", message: "Discount not found" };
            }

            if (discount.status !== "APPROVED") {
                return { status: "ERR", message: "Only approved discounts can be activated" };
            }

            discount.isActive = true;
            await discount.save();

            return {
                status: "OK",
                message: "Discount code activated successfully",
                data: discount,
            };
        } catch (error) {
            return { status: "ERR", message: error.message };
        }
    },

    /**
     * Update discount by Admin (for admin only)
     *
     * Business rules:
     * - Admin can only update discounts that have NEVER been used
     * - Once used, discount becomes immutable
     *
     * @param {String} discountId
     * @param {Object} data
     * @returns {Object}
     */
    async updateDiscountByAdmin(discountId, data) {
        try {
            const discount = await DiscountModel.findById(discountId);
            if (!discount) {
                return { status: "ERR", message: "Discount not found" };
            }

            const usageCount = await DiscountUsageModel.countDocuments({ discountId });
            if (usageCount > 0) {
                return {
                    status: "ERR",
                    message: "Cannot update discount. This discount has already been used by customers.",
                };
            }

            if (data.startDate || data.endDate) {
                const start = data.startDate ? new Date(data.startDate) : discount.startDate;
                const end = data.endDate ? new Date(data.endDate) : discount.endDate;

                if (start >= end) {
                    return { status: "ERR", message: "End date must be after start date" };
                }
            }

            if (data.code) discount.code = data.code.toUpperCase();
            if (data.discountPercent !== undefined) discount.discountPercent = data.discountPercent;
            if (data.minOrderValue !== undefined) discount.minOrderValue = data.minOrderValue;
            if (data.maxDiscountAmount !== undefined) discount.maxDiscountAmount = data.maxDiscountAmount;
            if (data.startDate) discount.startDate = new Date(data.startDate);
            if (data.endDate) discount.endDate = new Date(data.endDate);
            if (data.usageLimit !== undefined) discount.usageLimit = data.usageLimit;
            if (data.description !== undefined) discount.description = data.description;

            if (discount.discountPercent < 1 || discount.discountPercent > 100) {
                return { status: "ERR", message: "Discount percentage must be between 1 and 100" };
            }

            await discount.save();

            return {
                status: "OK",
                message: "Discount code updated successfully",
                data: discount,
            };
        } catch (error) {
            return { status: "ERR", message: error.message };
        }
    },

    /**
     * Get discount list with pagination and filters
     *
     * @param {Object} query
     * @returns {Object}
     */
    async getDiscounts(query = {}) {
        try {
            const { page = 1, limit = 10, status, isActive, sortBy = "createdAt", sortOrder = "desc" } = query;

            const filter = {};
            if (status) filter.status = status;
            if (isActive !== undefined) filter.isActive = isActive === "true" || isActive === true;

            const sortOption = {};
            const order = sortOrder === "asc" ? 1 : -1;
            sortOption[sortBy] = order;

            const discounts = await DiscountModel.find(filter)
                .populate("createdBy", "user_name email")
                .sort(sortOption)
                .skip((page - 1) * limit)
                .limit(Number(limit))
                .lean();

            const total = await DiscountModel.countDocuments(filter);

            return {
                status: "OK",
                data: discounts,
                pagination: { page: Number(page), limit: Number(limit), total },
            };
        } catch (error) {
            return { status: "ERR", message: error.message };
        }
    },

    /**
     * Get discount detail by ID
     *
     * @param {String} discountId
     * @returns {Object}
     */
    async getDiscountById(discountId) {
        try {
            const discount = await DiscountModel.findById(discountId)
                .populate("createdBy", "user_name email")
                .lean();

            if (!discount) {
                return { status: "ERR", message: "Discount not found" };
            }

            const usageCount = await DiscountUsageModel.countDocuments({ discountId });

            return {
                status: "OK",
                data: { ...discount, actualUsageCount: usageCount },
            };
        } catch (error) {
            return { status: "ERR", message: error.message };
        }
    },

    /**
     * Get valid discount codes for customers
     *
     * @returns {Object}
     */
    async getValidDiscountsForCustomer() {
        try {
            const now = new Date();

            const discounts = await DiscountModel.find({
                status: "APPROVED",
                isActive: true,
                startDate: { $lte: now },
                endDate: { $gte: now },
            })
                .lean()
                .sort({ createdAt: -1 });

            const validDiscounts = discounts.filter(
                (d) => d.usageLimit === null || d.usedCount < d.usageLimit
            );

            return {
                status: "OK",
                data: validDiscounts,
            };
        } catch (error) {
            return { status: "ERR", message: error.message };
        }
    },

    /**
     * Validate discount code and calculate discount amount
     *
     * @param {String} code
     * @param {String} userId
     * @param {Number} orderValue
     * @returns {Object}
     */
    async validateDiscountCode(code, userId, orderValue) {
        try {
            if (!code || !userId || orderValue === undefined) {
                return { status: "ERR", message: "Missing required parameters" };
            }

            const discount = await DiscountModel.findOne({ code: code.toUpperCase() });
            if (!discount) {
                return { status: "ERR", message: "Invalid discount code" };
            }

            const now = new Date();
            if (
                discount.status !== "APPROVED" ||
                !discount.isActive ||
                now < discount.startDate ||
                now > discount.endDate
            ) {
                return { status: "ERR", message: "Discount code is not valid" };
            }

            if (discount.usageLimit !== null && discount.usedCount >= discount.usageLimit) {
                return { status: "ERR", message: "Discount code has reached its usage limit" };
            }

            const existingUsage = await DiscountUsageModel.findOne({
                discountId: discount._id,
                userId,
            });

            if (existingUsage) {
                return { status: "ERR", message: "You have already used this discount code" };
            }

            if (orderValue < discount.minOrderValue) {
                return {
                    status: "ERR",
                    message: `Minimum order value is ${discount.minOrderValue}`,
                };
            }

            const discountAmount = Math.min(
                (orderValue * discount.discountPercent) / 100,
                discount.maxDiscountAmount
            );

            return {
                status: "OK",
                data: {
                    discountId: discount._id,
                    discountAmount,
                    finalAmount: orderValue - discountAmount,
                },
            };
        } catch (error) {
            return { status: "ERR", message: error.message };
        }
    },

    /**
     * Apply discount code after successful order creation
     *
     * @param {String} discountId
     * @param {String} userId
     * @param {Number} orderValue
     * @param {String|null} orderId
     * @returns {Object}
     */
    async applyDiscountCode(discountId, userId, orderValue, orderId = null) {
        try {
            const discount = await DiscountModel.findById(discountId);
            if (!discount) {
                return { status: "ERR", message: "Discount not found" };
            }

            const existingUsage = await DiscountUsageModel.findOne({
                discountId: discount._id,
                userId,
            });

            if (existingUsage) {
                return { status: "ERR", message: "You have already used this discount code" };
            }

            const discountAmount = Math.min(
                (orderValue * discount.discountPercent) / 100,
                discount.maxDiscountAmount
            );

            const usage = new DiscountUsageModel({
                discountId: discount._id,
                userId,
                orderId,
                discountAmount,
                orderValue,
            });

            await usage.save();

            discount.usedCount += 1;
            await discount.save();

            return {
                status: "OK",
                data: {
                    discountAmount,
                    finalAmount: orderValue - discountAmount,
                },
            };
        } catch (error) {
            return { status: "ERR", message: error.message };
        }
    },

    /**
     * Get discount usage history for a customer
     *
     * @param {String} userId
     * @returns {Object}
     */
    async getDiscountUsageHistory(userId) {
        try {
            const usages = await DiscountUsageModel.find({ userId })
                .populate("discountId", "code discountPercent")
                .sort({ usedAt: -1 })
                .lean();

            return {
                status: "OK",
                data: usages,
            };
        } catch (error) {
            return { status: "ERR", message: error.message };
        }
    },
};

module.exports = DiscountService;
