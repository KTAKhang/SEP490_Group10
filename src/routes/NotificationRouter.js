/**
 * @author KhoaNDCE170420
 * @file NotificationRouter.js
 * @description Express router for notification-related API endpoints.
 * 
 * This router defines all notification-related routes and applies appropriate
 * authentication middleware.
 * 
 * Routes:
 * - POST /notifications/register-token - Register FCM token (requires authentication)
 * - GET /notifications - Get user notifications with pagination
 * - GET /notifications/unread-count - Get unread notification count
 * - PUT /notifications/:notificationId/read - Mark notification as read
 * - PUT /notifications/read-all - Mark all notifications as read
 */
const express = require("express");
const router = express.Router();
const NotificationController = require("../controller/NotificationController");
const { authUserMiddleware } = require("../middleware/authMiddleware");

/**
 * @route   POST /notifications/register-token
 * @desc    Register FCM token for authenticated user
 * @body    { fcmToken: String }
 * @access  Authenticated users only
 */
router.post("/register-token", authUserMiddleware, NotificationController.registerToken);

/**
 * @route   GET /notifications
 * @desc    Get notifications for authenticated user
 * @query   page, limit, isRead, type
 * @access  Authenticated users only
 */
router.get("/", authUserMiddleware, NotificationController.getNotifications);

/**
 * @route   GET /notifications/unread-count
 * @desc    Get unread notification count for authenticated user
 * @access  Authenticated users only
 */
router.get("/unread-count", authUserMiddleware, NotificationController.getUnreadCount);

/**
 * @route   PUT /notifications/:notificationId/read
 * @desc    Mark notification as read
 * @access  Authenticated users only
 */
router.put("/:notificationId/read", authUserMiddleware, NotificationController.markAsRead);

/**
 * @route   PUT /notifications/read-all
 * @desc    Mark all notifications as read for authenticated user
 * @access  Authenticated users only
 */
router.put("/read-all", authUserMiddleware, NotificationController.markAllAsRead);

module.exports = router;
