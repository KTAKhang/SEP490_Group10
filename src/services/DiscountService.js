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
const OrderModel = require("../models/OrderModel");
const PaymentModel = require("../models/PaymentModel");
const NotificationService = require("./NotificationService");
const CustomerEmailService = require("./CustomerEmailService");
const birthdayDiscountConfig = require("../config/birthdayDiscountConfig");
const mongoose = require("mongoose");

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
            const today = new Date();
            today.setHours(0, 0, 0, 0); // Reset time to start of day for comparison

            // Check if start date is in the past
            const startDateOnly = new Date(start);
            startDateOnly.setHours(0, 0, 0, 0);
            if (startDateOnly < today) {
                return { status: "ERR", message: "Start date cannot be in the past" };
            }

            // Check if end date is in the past
            const endDateOnly = new Date(end);
            endDateOnly.setHours(0, 0, 0, 0);
            if (endDateOnly < today) {
                return { status: "ERR", message: "End date cannot be in the past" };
            }

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
                const today = new Date();
                today.setHours(0, 0, 0, 0); // Reset time to start of day for comparison

                // Check if start date is in the past
                if (data.startDate) {
                    const startDateOnly = new Date(start);
                    startDateOnly.setHours(0, 0, 0, 0);
                    if (startDateOnly < today) {
                        return { status: "ERR", message: "Start date cannot be in the past" };
                    }
                }

                // Check if end date is in the past
                if (data.endDate) {
                    const endDateOnly = new Date(end);
                    endDateOnly.setHours(0, 0, 0, 0);
                    if (endDateOnly < today) {
                        return { status: "ERR", message: "End date cannot be in the past" };
                    }
                }

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
            discount.rejectedReason = null;

            await discount.save();

            /**
             * Send Firebase push notifications (non-blocking)
             * 
             * Notifications are sent in a try-catch block to ensure that notification failures
             * do not affect the main business logic (discount approval).
             * 
             * Notification flow:
             * 1. Notify the sales-staff who created the voucher that it has been approved
             * 2. Notify all customers about the new available voucher
             * 
             * How to add notifications for other features:
             * 
             * 1. Import NotificationService at the top of your service file:
             *    const NotificationService = require("./NotificationService");
             * 
             * 2. After your main business logic succeeds, add notification code:
             * 
             *    try {
             *      // Send to specific user
             *      await NotificationService.sendToUser(userId, {
             *        title: "Notification Title",
             *        body: "Notification message",
             *        data: {
             *          type: "your_feature",      // e.g., "order", "contact", "product"
             *          action: "view_detail",    // e.g., "view_order", "view_contact"
             *          // Add any IDs or data needed for navigation
             *          orderId: order._id.toString(),
             *          contactId: contact._id.toString()
             *        }
             *      });
             * 
             *      // Or send to all customers
             *      await NotificationService.sendToAllCustomers({
             *        title: "Announcement",
             *        body: "Message to all customers",
             *        data: { type: "announcement", action: "view_news" }
             *      });
             * 
             *      // Or send to specific role
             *      await NotificationService.sendToRole("sales-staff", {
             *        title: "New Order",
             *        body: "You have a new order",
             *        data: { type: "order", action: "view_orders" }
             *      });
             *    } catch (notificationError) {
             *      // Always wrap in try-catch to prevent notification failures from breaking main logic
             *      console.error("Error sending notifications:", notificationError);
             *    }
             * 
             * 3. Update frontend notificationService.js to handle your new notification type
             *    in the handleNotificationClick function for proper navigation.
             */
            try {
                // 1. Notify sales-staff who created the voucher
                if (discount.createdBy) {
                    await NotificationService.sendToUser(discount.createdBy, {
                        title: "Voucher đã được duyệt",
                        body: `Voucher ${discount.code} đã được admin duyệt và đang hoạt động`,
                        data: {
                            type: "discount",
                            discountId: discount._id.toString(),
                            action: "view_discount",
                            code: discount.code
                        }
                    });
                }

                // 2. Notify all customers about new voucher
                await NotificationService.sendToAllCustomers({
                    title: "Voucher mới đã có sẵn!",
                    body: `Giảm ${discount.discountPercent}% tối đa ${new Intl.NumberFormat('vi-VN').format(discount.maxDiscountAmount)} VNĐ. Mã: ${discount.code}`,
                    data: {
                        type: "discount",
                        discountId: discount._id.toString(),
                        action: "view_voucher",
                        code: discount.code,
                        discountPercent: discount.discountPercent.toString(),
                        maxDiscountAmount: discount.maxDiscountAmount.toString()
                    }
                });
            } catch (notificationError) {
                // Log error but don't fail the approval
                console.error("Error sending notifications for discount approval:", notificationError);
            }

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
            discount.rejectedReason = rejectionReason.trim();

            await discount.save();

            /**
             * Send Firebase push notification to sales-staff (non-blocking)
             * 
             * Notifies the sales-staff who created the voucher that it has been rejected.
             * This is wrapped in try-catch to ensure notification failures don't affect
             * the main business logic.
             * 
             * See approveDiscount method above for detailed documentation on how to
             * add notifications for other features.
             */
            try {
                if (discount.createdBy) {
                    await NotificationService.sendToUser(discount.createdBy, {
                        title: "Voucher bị từ chối",
                        body: `Voucher ${discount.code} bị từ chối. Lý do: ${rejectionReason.trim()}`,
                        data: {
                            type: "discount",
                            discountId: discount._id.toString(),
                            action: "view_discount",
                            code: discount.code,
                            status: "REJECTED"
                        }
                    });
                }
            } catch (notificationError) {
                // Log error but don't fail the rejection
                console.error("Error sending notification for discount rejection:", notificationError);
            }

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

            // Business rule: Admin cannot update voucher if it has been used (usedCount > 0)
            if (discount.usedCount > 0) {
                return {
                    status: "ERR",
                    message: "Cannot update discount. This discount has already been used by customers.",
                };
            }

            if (data.startDate || data.endDate) {
                const start = data.startDate ? new Date(data.startDate) : discount.startDate;
                const end = data.endDate ? new Date(data.endDate) : discount.endDate;
                const today = new Date();
                today.setHours(0, 0, 0, 0); // Reset time to start of day for comparison

                // Check if start date is in the past
                if (data.startDate) {
                    const startDateOnly = new Date(start);
                    startDateOnly.setHours(0, 0, 0, 0);
                    if (startDateOnly < today) {
                        return { status: "ERR", message: "Start date cannot be in the past" };
                    }
                }

                // Check if end date is in the past
                if (data.endDate) {
                    const endDateOnly = new Date(end);
                    endDateOnly.setHours(0, 0, 0, 0);
                    if (endDateOnly < today) {
                        return { status: "ERR", message: "End date cannot be in the past" };
                    }
                }

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

            // First, mark expired discounts automatically
            const now = new Date();
            await DiscountModel.updateMany(
                {
                    status: { $in: ["APPROVED", "PENDING"] },
                    endDate: { $lt: now }
                },
                {
                    $set: {
                        status: "EXPIRED",
                        isActive: false
                    }
                }
            );

            const filter = {};
            if (status) filter.status = status;
            if (isActive !== undefined) filter.isActive = isActive === "true" || isActive === true;
            // Admin/Staff list: never show birthday vouchers (auto-generated, not managed here)
            filter.isBirthdayDiscount = { $ne: true };

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

            // Thống kê theo đúng bộ lọc (toàn bộ dữ liệu, không chỉ trang hiện tại)
            const [pending, approved, rejected, expired, active, inactive] = await Promise.all([
                DiscountModel.countDocuments({ ...filter, status: "PENDING" }),
                DiscountModel.countDocuments({ ...filter, status: "APPROVED" }),
                DiscountModel.countDocuments({ ...filter, status: "REJECTED" }),
                DiscountModel.countDocuments({ ...filter, status: "EXPIRED" }),
                DiscountModel.countDocuments({ ...filter, isActive: true }),
                DiscountModel.countDocuments({ ...filter, isActive: false }),
            ]);

            const statistics = {
                total,
                pending,
                approved,
                rejected,
                expired,
                active,
                inactive,
            };

            return {
                status: "OK",
                data: discounts,
                pagination: { page: Number(page), limit: Number(limit), total },
                statistics,
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
     * Get valid discount codes for customers (phù hợp đơn hàng: minOrderValue <= orderValue, chưa dùng).
     * Birthday vouchers are excluded here: they are only suggested at checkout, not shown on the voucher list page.
     *
     * @param {String} [userId] - User ID để loại mã đã dùng
     * @param {Number} [orderValue] - Giá trị đơn hàng để lọc mã thỏa đơn tối thiểu
     * @returns {Object}
     */
    async getValidDiscountsForCustomer(userId = null, orderValue = null) {
        try {
            const now = new Date();

            const query = {
                status: "APPROVED",
                isActive: true,
                startDate: { $lte: now },
                endDate: { $gte: now },
                // Do not list birthday vouchers here; they are suggested at checkout only
                isBirthdayDiscount: { $ne: true },
            };

            if (orderValue != null && orderValue !== "") {
                query.minOrderValue = { $lte: Number(orderValue) };
            }

            let discounts = await DiscountModel.find(query)
                .lean()
                .sort({ discountPercent: -1, maxDiscountAmount: -1 });

            discounts = discounts.filter(
                (d) => d.usageLimit === null || d.usedCount < d.usageLimit
            );

            // Personal vouchers: only show if targetUserId is null or matches current user
            if (userId) {
                const uid = userId.toString();
                discounts = discounts.filter(
                    (d) => !d.targetUserId || d.targetUserId.toString() === uid
                );
            } else {
                discounts = discounts.filter((d) => !d.targetUserId);
            }

            if (userId) {
                const usedDiscountIds = await DiscountUsageModel.find({ userId }).distinct("discountId");
                const usedSet = new Set(usedDiscountIds.map((id) => id.toString()));
                discounts = discounts.filter((d) => !usedSet.has(d._id.toString()));
            }

            return {
                status: "OK",
                data: discounts,
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

            // Personal voucher: only the target user can use it
            if (discount.targetUserId && discount.targetUserId.toString() !== userId.toString()) {
                return { status: "ERR", message: "This discount code is not valid for your account" };
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
            if (!discountId || !userId || orderValue === undefined) {
                return { status: "ERR", message: "Missing required parameters" };
            }

            const discount = await DiscountModel.findById(discountId);
            if (!discount) {
                return { status: "ERR", message: "Discount not found" };
            }

            // Validate discount is still valid
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

            // Personal voucher: only the target user can use it
            if (discount.targetUserId && discount.targetUserId.toString() !== userId.toString()) {
                return { status: "ERR", message: "This discount code is not valid for your account" };
            }

            // Check if user already used this discount
            const existingUsage = await DiscountUsageModel.findOne({
                discountId: discount._id,
                userId,
            });

            if (existingUsage) {
                return { status: "ERR", message: "You have already used this discount code" };
            }

            // Validate minimum order value
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

            const finalAmount = orderValue - discountAmount;

            // If an orderId is provided, update order and payment first
            if (orderId) {
                try {
                    // Convert orderId to ObjectId if it's a string
                    let orderObjectId = orderId;
                    if (typeof orderId === 'string') {
                        if (!mongoose.Types.ObjectId.isValid(orderId)) {
                            return { status: "ERR", message: "Invalid order ID format" };
                        }
                        orderObjectId = new mongoose.Types.ObjectId(orderId);
                    }

                    // Verify order exists and belongs to user
                    const order = await OrderModel.findById(orderObjectId);
                    if (!order) {
                        return { status: "ERR", message: "Order not found. Please wait a moment and try again." };
                    }

                    if (order.user_id.toString() !== userId.toString()) {
                        return { status: "ERR", message: "Order does not belong to user" };
                    }

                    // Update order total and discount info for display
                    const updateResult = await OrderModel.updateOne(
                        { _id: orderObjectId },
                        {
                            $set: {
                                total_price: finalAmount,
                                discount_code: discount.code,
                                discount_amount: discountAmount,
                            },
                        }
                    );

                    if (updateResult.matchedCount === 0) {
                        return { status: "ERR", message: "Failed to update order" };
                    }

                    if (updateResult.modifiedCount === 0) {
                        // Order might already have the correct price, continue
                        console.log(`Order ${orderId} already has price ${finalAmount}`);
                    }

                    // Update associated payment amount so payment uses discounted total
                    const paymentUpdateResult = await PaymentModel.updateOne(
                        { order_id: orderObjectId, type: "PAYMENT" },
                        { $set: { amount: finalAmount } }
                    );

                    // Payment might not exist yet for some payment methods, that's okay
                    if (paymentUpdateResult.matchedCount === 0) {
                        console.warn(`Payment not found for order ${orderId}, discount still applied to order`);
                    }
                } catch (persistErr) {
                    console.error("Error updating order/payment with discount:", persistErr);
                    return { status: "ERR", message: `Failed to apply discount to order: ${persistErr.message}` };
                }
            }

            // Save discount usage record (ALWAYS save usage, even if orderId is not provided)
            let orderObjectId = null;
            if (orderId) {
                if (typeof orderId === 'string' && mongoose.Types.ObjectId.isValid(orderId)) {
                    orderObjectId = new mongoose.Types.ObjectId(orderId);
                } else if (orderId instanceof mongoose.Types.ObjectId) {
                    orderObjectId = orderId;
                }
            }

            const usage = new DiscountUsageModel({
                discountId: discount._id,
                userId,
                orderId: orderObjectId,
                discountCode: discount.code,
                discountPercent: discount.discountPercent,
                discountAmount,
                orderValue,
            });

            await usage.save();

            // Increment discount usedCount (CRITICAL: This must happen to track usage)
            discount.usedCount += 1;
            await discount.save();

            return {
                status: "OK",
                message: "Discount code applied successfully",
                data: {
                    discountAmount,
                    finalAmount,
                },
            };
        } catch (error) {
            console.error("Error in applyDiscountCode:", error);
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

    /**
     * Birthday voucher usage report (admin). Statistics only; no list of codes.
     * Query: day, month, year (optional). Filter by usedAt time range.
     *
     * @param {Object} query - { day, month, year } optional
     * @returns {Object} { totalUsage, totalDiscountAmount, uniqueUsers, averageDiscountPerOrder }
     */
    async getBirthdayReport(query = {}) {
        try {
            const { day, month, year } = query;
            const matchStage = { "discount.isBirthdayDiscount": true };

            if (year !== undefined && year !== "" && year !== null) {
                const y = Number(year);
                let startDate, endDate;
                if (month !== undefined && month !== "" && month !== null) {
                    const m = Number(month) - 1; // 0-indexed
                    if (day !== undefined && day !== "" && day !== null) {
                        const d = Number(day);
                        startDate = new Date(y, m, d, 0, 0, 0, 0);
                        endDate = new Date(y, m, d, 23, 59, 59, 999);
                    } else {
                        startDate = new Date(y, m, 1, 0, 0, 0, 0);
                        endDate = new Date(y, m + 1, 0, 23, 59, 59, 999);
                    }
                } else {
                    startDate = new Date(y, 0, 1, 0, 0, 0, 0);
                    endDate = new Date(y, 11, 31, 23, 59, 59, 999);
                }
                matchStage.usedAt = { $gte: startDate, $lte: endDate };
            }

            const pipeline = [
                { $lookup: { from: "discounts", localField: "discountId", foreignField: "_id", as: "discount" } },
                { $unwind: "$discount" },
                { $match: matchStage },
                {
                    $group: {
                        _id: null,
                        totalUsage: { $sum: 1 },
                        totalDiscountAmount: { $sum: "$discountAmount" },
                        uniqueUsers: { $addToSet: "$userId" },
                    },
                },
                {
                    $project: {
                        _id: 0,
                        totalUsage: 1,
                        totalDiscountAmount: 1,
                        uniqueUsers: { $size: "$uniqueUsers" },
                        averageDiscountPerOrder: {
                            $cond: [
                                { $eq: ["$totalUsage", 0] },
                                0,
                                { $divide: ["$totalDiscountAmount", "$totalUsage"] },
                            ],
                        },
                    },
                },
            ];

            const result = await DiscountUsageModel.aggregate(pipeline);
            const stats = result[0] || {
                totalUsage: 0,
                totalDiscountAmount: 0,
                uniqueUsers: 0,
                averageDiscountPerOrder: 0,
            };

            return { status: "OK", data: stats };
        } catch (error) {
            return { status: "ERR", message: error.message };
        }
    },

    /**
     * Birthday voucher: get today's month (1–12) and day (1–31) in Asia/Ho_Chi_Minh.
     * Uses Intl so result is correct regardless of server timezone.
     */
    _getTodayMonthDayVN() {
        const formatter = new Intl.DateTimeFormat("en-CA", {
            timeZone: "Asia/Ho_Chi_Minh",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
        });
        const parts = formatter.formatToParts(new Date());
        const get = (type) => parseInt(parts.find((p) => p.type === type).value, 10);
        return { month: get("month"), day: get("day"), year: get("year") };
    },

    /**
     * Find customer users whose birthday (as calendar date in VN) falls on today's month+day (VN).
     * Compares only month and day so any birth year matches (e.g. 2003-02-08 and 2026-02-08 both match 2/8).
     */
    async _findBirthdayCustomersToday() {
        const { month, day } = this._getTodayMonthDayVN();
        const customerRole = await RoleModel.findOne({ name: "customer" });
        if (!customerRole) {
            console.log("[BirthdayVoucher] No customer role found");
            return [];
        }

        const todayMonthDay = `${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

        const users = await UserModel.aggregate([
            {
                $match: {
                    role_id: new mongoose.Types.ObjectId(customerRole._id),
                    status: true,
                    birthday: { $exists: true, $ne: null },
                },
            },
            {
                $addFields: {
                    birthdayMonthDayVN: {
                        $dateToString: {
                            format: "%m-%d",
                            date: "$birthday",
                            timezone: "Asia/Ho_Chi_Minh",
                        },
                    },
                },
            },
            { $match: { birthdayMonthDayVN: todayMonthDay } },
            { $project: { _id: 1, email: 1, user_name: 1, birthday: 1 } },
        ]);

        console.log("[BirthdayVoucher] Today (VN) month=" + month + " day=" + day + " (" + todayMonthDay + "), found " + users.length + " customer(s) with birthday today");
        return users;
    },

    /**
     * Check if user already received a birthday voucher in the given calendar year.
     * Used to enforce: 1 birthday voucher per user per year (prevents abuse e.g. user
     * updating birthday on profile to get multiple codes). To skip this check for testing,
     * comment out the block in runDailyBirthdayVouchers that calls this and skips when true.
     */
    async _alreadyReceivedBirthdayThisYear(userId, year) {
        const startOfYear = new Date(year, 0, 1);
        const endOfYear = new Date(year, 11, 31, 23, 59, 59, 999);
        const existing = await DiscountModel.findOne({
            isBirthdayDiscount: true,
            targetUserId: new mongoose.Types.ObjectId(userId),
            createdAt: { $gte: startOfYear, $lte: endOfYear },
        }).lean();
        return !!existing;
    },

    /**
     * Create one birthday discount for a user (idempotent per year via caller check).
     */
    async _createBirthdayDiscount(userId, year) {
        const now = new Date();
        const expiryDays = birthdayDiscountConfig.expiryDays;
        const endDate = new Date(now);
        endDate.setDate(endDate.getDate() + expiryDays);

        const code = `BDAY-${userId}-${year}`.toUpperCase();

        const discount = new DiscountModel({
            code,
            discountPercent: birthdayDiscountConfig.discountPercent,
            minOrderValue: birthdayDiscountConfig.minOrderValue,
            maxDiscountAmount: birthdayDiscountConfig.maxDiscountAmount,
            startDate: now,
            endDate,
            usageLimit: 1,
            usedCount: 0,
            status: "APPROVED",
            isActive: true,
            createdBy: null,
            approvedBy: null,
            approvedAt: now,
            description: "Birthday voucher auto generated",
            isBirthdayDiscount: true,
            targetUserId: new mongoose.Types.ObjectId(userId),
        });

        await discount.save();
        return discount;
    },

    /**
     * Send FCM + email for a created birthday voucher. Logs errors; does not throw.
     */
    async _sendBirthdayNotifications(user, discount) {
        const code = discount.code;
        const message = `Happy Birthday! Here is your personal discount code: ${code}`;

        try {
            await NotificationService.sendToUser(user._id.toString(), {
                title: "Happy Birthday!",
                body: message,
                data: {
                    type: "discount",
                    action: "view_voucher",
                    code,
                    discountId: discount._id.toString(),
                },
            });
        } catch (err) {
            console.error("[BirthdayVoucher] FCM failed for user", user._id, err.message);
        }

        try {
            const emailResult = await CustomerEmailService.sendBirthdayVoucherEmail(
                user.email,
                user.user_name || "Customer",
                code
            );
            if (emailResult.status !== "OK") {
                console.error("[BirthdayVoucher] Email failed for user", user._id, emailResult.message);
            }
        } catch (err) {
            console.error("[BirthdayVoucher] Email error for user", user._id, err.message);
        }
    },

    /**
     * Run daily birthday voucher: find users with birthday today (VN), create voucher, send FCM + email.
     * Idempotent: skips users who already received a birthday voucher this year.
     * Does not modify User or Profile; uses only existing User.birthday.
     *
     * @returns {Object} { created, skipped, total }
     */
    async runDailyBirthdayVouchers() {
        const { year } = this._getTodayMonthDayVN();
        let created = 0;
        let skipped = 0;

        try {
            const users = await this._findBirthdayCustomersToday();
            if (users.length === 0) {
                console.log("[BirthdayVoucher] No birthday users today (no customer has birthday on this calendar date in VN)");
                return { created, skipped, total: 0 };
            }

            for (const user of users) {
                const userId = user._id.toString();
                // --- Anti-abuse: 1 voucher per user per year. "Already received" is stored in Discount collection (isBirthdayDiscount + targetUserId + createdAt this year). Comment out block below to skip when testing. ---
                const already = await this._alreadyReceivedBirthdayThisYear(userId, year);
                if (already) {
                    skipped++;
                    continue;
                }
                // --- End skip-for-testing ---

                const discount = await this._createBirthdayDiscount(userId, year);
                created++;
                await this._sendBirthdayNotifications(user, discount);
            }

            console.log("[BirthdayVoucher] Done. Created:", created, "Skipped (already this year):", skipped);
            return { created, skipped, total: users.length };
        } catch (error) {
            console.error("[BirthdayVoucher] Job error:", error);
            throw error;
        }
    },
};

module.exports = DiscountService;
