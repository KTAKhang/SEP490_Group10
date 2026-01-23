/**
 * @author KhoaNDCE170420
 * @file NotificationRouter.js
 * @description Express router for notification-related API endpoints.
 * 
 * This router defines all notification-related routes and applies appropriate
 * authentication middleware. Currently handles FCM token registration.
 * 
 * Routes:
 * - POST /notifications/register-token - Register FCM token (requires authentication)
 * 
 * How to add new notification routes:
 * 
 * 1. Add new controller method in NotificationController.js
 * 
 * 2. Add route here:
 *    router.get("/history", authUserMiddleware, NotificationController.getHistory);
 * 
 * 3. Route will be accessible at: /api/notifications/history
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

module.exports = router;
