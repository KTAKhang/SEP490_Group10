/**
 * @author KhoaNDCE170420
 * @file NotificationController.js
 * @description Controller to handle notification-related HTTP requests.
 * 
 * This controller provides API endpoints for managing Firebase Cloud Messaging tokens.
 * Currently handles FCM token registration for authenticated users.
 * 
 * API Endpoints:
 * - POST /notifications/register-token - Register FCM token for authenticated user
 * 
 * How to extend for other notification features:
 * 
 * 1. Add new controller methods for additional endpoints (if needed):
 *    async getNotifications(req, res) {
 *      // Get user's notification history
 *    }
 * 
 * 2. Add corresponding routes in NotificationRouter.js
 * 
 * 3. Note: Most notification sending happens in service layer, not controller.
 *    Controllers are mainly for token management and notification history.
 */
const NotificationService = require("../services/NotificationService");

const NotificationController = {
    /**
     * Register FCM token for authenticated user
     * POST /api/notifications/register-token
     */
    async registerToken(req, res) {
        try {
            const userId = req.user._id;
            const { fcmToken } = req.body;

            if (!fcmToken || !fcmToken.trim()) {
                return res.status(400).json({
                    status: "ERR",
                    message: "FCM token is required"
                });
            }

            const result = await NotificationService.registerToken(userId, fcmToken);

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
     * Get notifications for authenticated user
     * GET /api/notifications
     * Query params: page, limit, isRead, type
     */
    async getNotifications(req, res) {
        try {
            const userId = req.user._id;
            const { page, limit, isRead, type } = req.query;

            const result = await NotificationService.getUserNotifications(userId, {
                page,
                limit,
                isRead,
                type
            });

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
     * Get unread notification count
     * GET /api/notifications/unread-count
     */
    async getUnreadCount(req, res) {
        try {
            const userId = req.user._id;

            const result = await NotificationService.getUnreadCount(userId);

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
     * Mark notification as read
     * PUT /api/notifications/:notificationId/read
     */
    async markAsRead(req, res) {
        try {
            const userId = req.user._id;
            const { notificationId } = req.params;

            const result = await NotificationService.markAsRead(notificationId, userId);

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
     * Mark all notifications as read
     * PUT /api/notifications/read-all
     */
    async markAllAsRead(req, res) {
        try {
            const userId = req.user._id;

            const result = await NotificationService.markAllAsRead(userId);

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
    }
};

module.exports = NotificationController;
