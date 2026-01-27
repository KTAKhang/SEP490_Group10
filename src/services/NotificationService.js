/**
 * @author KhoaNDCE170420
 * @file NotificationService.js
 * @description Service to handle Firebase Cloud Messaging (FCM) push notifications from backend.
 * 
 * This service provides methods to send push notifications to users via Firebase Cloud Messaging.
 * It handles token registration, sending notifications to individual users, multiple users, 
 * all customers, or users with specific roles.
 * 
 * Requirements:
 * - Install firebase-admin: npm install firebase-admin
 * - Configure Firebase environment variables in .env file
 * 
 * How to add notifications for other features:
 * 
 * 1. Import NotificationService in your service file:
 *    const NotificationService = require("./NotificationService");
 * 
 * 2. Call notification methods after your business logic:
 * 
 *    Example - Send to a single user:
 *    await NotificationService.sendToUser(userId, {
 *      title: "Order Status Updated",
 *      body: "Your order #12345 has been shipped",
 *      data: {
 *        type: "order",
 *        orderId: "12345",
 *        action: "view_order"
 *      }
 *    });
 * 
 *    Example - Send to all customers:
 *    await NotificationService.sendToAllCustomers({
 *      title: "New Product Available",
 *      body: "Check out our latest products!",
 *      data: {
 *        type: "product",
 *        action: "view_products"
 *      }
 *    });
 * 
 *    Example - Send to specific role:
 *    await NotificationService.sendToRole("sales-staff", {
 *      title: "New Order Received",
 *      body: "You have a new order to process",
 *      data: {
 *        type: "order",
 *        action: "view_orders"
 *      }
 *    });
 * 
 * 3. Handle errors gracefully (non-blocking):
 *    try {
 *      await NotificationService.sendToUser(userId, notification);
 *    } catch (error) {
 *      console.error("Notification failed:", error);
 *      // Don't fail the main operation if notification fails
 *    }
 * 
 * 4. Update frontend notificationService.js to handle new notification types
 *    in the handleNotificationClick function for proper navigation.
 */

const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");
const UserModel = require("../models/UserModel");
const RoleModel = require("../models/RolesModel");
const NotificationModel = require("../models/NotificationModel");

// Initialize Firebase Admin SDK
let firebaseInitialized = false;

function initializeFirebase() {
    if (firebaseInitialized) {
        return;
    }

    try {
        // Check if Firebase is already initialized
        if (admin.apps.length === 0) {
            // Initialize with service account
            // Option 1: Use environment variables (RECOMMENDED for security)
            const serviceAccount = {
                type: "service_account",
                project_id: process.env.FIREBASE_PROJECT_ID,
                private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
                private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
                client_email: process.env.FIREBASE_CLIENT_EMAIL,
                client_id: process.env.FIREBASE_CLIENT_ID,
                auth_uri: "https://accounts.google.com/o/oauth2/auth",
                token_uri: "https://oauth2.googleapis.com/token",
                auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
                client_x509_cert_url: process.env.FIREBASE_CLIENT_X509_CERT_URL,
                universe_domain: "googleapis.com"
            };

            // Check if all required env vars are present
            if (serviceAccount.project_id && 
                serviceAccount.private_key && 
                serviceAccount.client_email) {
                admin.initializeApp({
                    credential: admin.credential.cert(serviceAccount)
                });
            } else {
                // Option 2: Fallback to service account key file path (for development)
                const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
                
                if (serviceAccountPath) {
                    // Resolve path - handle both relative and absolute paths
                    let resolvedPath;
                    if (path.isAbsolute(serviceAccountPath)) {
                        resolvedPath = serviceAccountPath;
                    } else {
                        // Resolve relative to project root (where server.js is located)
                        resolvedPath = path.resolve(__dirname, '../../', serviceAccountPath);
                    }
                    
                    // Read and parse JSON file
                    if (!fs.existsSync(resolvedPath)) {
                        throw new Error(`Firebase service account file not found: ${resolvedPath}`);
                    }
                    
                    const serviceAccountJson = fs.readFileSync(resolvedPath, 'utf8');
                    const serviceAccountFromFile = JSON.parse(serviceAccountJson);
                    
                    admin.initializeApp({
                        credential: admin.credential.cert(serviceAccountFromFile)
                    });
                } else {
                    console.warn("Firebase not configured. Notifications will be disabled.");
                    console.warn("Please set FIREBASE_PROJECT_ID, FIREBASE_PRIVATE_KEY, FIREBASE_CLIENT_EMAIL, etc. in .env");
                    return;
                }
            }
        }
        
        firebaseInitialized = true;
        console.log("Firebase Admin SDK initialized successfully");
    } catch (error) {
        console.error("Error initializing Firebase Admin SDK:", error.message);
        console.warn("Notifications will be disabled");
    }
}

// Initialize on module load
initializeFirebase();

const NotificationService = {
    /**
     * Register FCM token for a user
     * 
     * @param {String} userId - User ID
     * @param {String} fcmToken - FCM token from client
     * @returns {Promise<Object>} Result object
     */
    async registerToken(userId, fcmToken) {
        try {
            if (!userId || !fcmToken) {
                return { status: "ERR", message: "User ID and FCM token are required" };
            }

            await UserModel.updateOne(
                { _id: userId },
                { $set: { fcmToken: fcmToken.trim() } }
            );

            return {
                status: "OK",
                message: "FCM token registered successfully"
            };
        } catch (error) {
            console.error("Error registering FCM token:", error);
            return { status: "ERR", message: error.message };
        }
    },

    /**
     * Send notification to a single user
     * 
     * Flow: Save to database first → Then send via FCM
     * This ensures notifications persist even if FCM delivery fails.
     * 
     * @param {String} userId - User ID
     * @param {Object} notification - Notification object
     * @param {String} notification.title - Notification title
     * @param {String} notification.body - Notification body
     * @param {Object} notification.data - Additional data payload
     * @param {String} notification.imageUrl - Optional image URL
     * @returns {Promise<Object>} Result object
     */
    async sendToUser(userId, notification) {
        try {
            // Step 1: Save notification to database first (source of truth)
            const savedNotification = new NotificationModel({
                userId: userId,
                title: notification.title,
                body: notification.body,
                type: notification.data?.type || "general",
                data: notification.data || {},
                imageUrl: notification.imageUrl || null,
                isRead: false,
            });

            await savedNotification.save();

            // Step 2: Send via FCM (real-time delivery channel)
            // If FCM fails, notification is still saved in database
            let fcmResult = null;
            if (firebaseInitialized && admin.apps.length > 0) {
                try {
                    const user = await UserModel.findById(userId).select('fcmToken').lean();
                    
                    if (user && user.fcmToken) {
                        const message = {
                            notification: {
                                title: notification.title,
                                body: notification.body,
                                ...(notification.imageUrl && { imageUrl: notification.imageUrl })
                            },
                            data: {
                                // Include notification ID so frontend can mark as read
                                notificationId: savedNotification._id.toString(),
                                ...(notification.data || {}),
                                // Convert all data values to strings (FCM requirement)
                                ...Object.fromEntries(
                                    Object.entries(notification.data || {}).map(([key, value]) => [
                                        key,
                                        typeof value === 'string' ? value : JSON.stringify(value)
                                    ])
                                )
                            },
                            token: user.fcmToken,
                            android: {
                                priority: "high",
                                notification: {
                                    sound: "default",
                                    channelId: "default"
                                }
                            },
                            apns: {
                                payload: {
                                    aps: {
                                        sound: "default"
                                    }
                                }
                            }
                        };

                        const response = await admin.messaging().send(message);
                        fcmResult = response;
                        console.log("FCM notification sent successfully:", response);
                    } else {
                        console.warn(`User ${userId} does not have FCM token, notification saved to DB only`);
                    }
                } catch (fcmError) {
                    console.error("FCM delivery failed, but notification saved to DB:", fcmError);
                    
                    // Handle invalid token error
                    if (fcmError.code === 'messaging/invalid-registration-token' || 
                        fcmError.code === 'messaging/registration-token-not-registered') {
                        // Remove invalid token from database
                        await UserModel.updateOne(
                            { _id: userId },
                            { $unset: { fcmToken: "" } }
                        );
                    }
                    // Continue - notification is already saved in DB
                }
            } else {
                console.warn("Firebase not initialized, notification saved to DB only");
            }

            return {
                status: "OK",
                message: "Notification saved and sent successfully",
                notificationId: savedNotification._id.toString(),
                fcmMessageId: fcmResult
            };
        } catch (error) {
            console.error("Error in sendToUser:", error);
            return { status: "ERR", message: error.message };
        }
    },

    /**
     * Send notification to multiple users
     * 
     * Flow: Save to database first → Then send via FCM
     * 
     * @param {Array<String>} userIds - Array of User IDs
     * @param {Object} notification - Notification object
     * @returns {Promise<Object>} Result object with success/failure counts
     */
    async sendToUsers(userIds, notification) {
        try {
            if (!Array.isArray(userIds) || userIds.length === 0) {
                return { status: "ERR", message: "User IDs array is required" };
            }

            // Step 1: Save notifications to database for all users
            const notificationsToSave = userIds.map(userId => ({
                userId: userId,
                title: notification.title,
                body: notification.body,
                type: notification.data?.type || "general",
                data: notification.data || {},
                imageUrl: notification.imageUrl || null,
                isRead: false,
            }));

            const savedNotifications = await NotificationModel.insertMany(notificationsToSave);
            const notificationIds = savedNotifications.map(n => n._id.toString());

            // Step 2: Send via FCM (real-time delivery)
            let fcmSuccessCount = 0;
            let fcmFailureCount = 0;

            if (firebaseInitialized && admin.apps.length > 0) {
                try {
                    const users = await UserModel.find({
                        _id: { $in: userIds },
                        fcmToken: { $exists: true, $ne: null }
                    }).select('fcmToken _id').lean();

                    if (users.length > 0) {
                        const tokens = users.map(u => u.fcmToken).filter(Boolean);
                        
                        if (tokens.length > 0) {
                            const message = {
                                notification: {
                                    title: notification.title,
                                    body: notification.body,
                                    ...(notification.imageUrl && { imageUrl: notification.imageUrl })
                                },
                                data: {
                                    ...Object.fromEntries(
                                        Object.entries(notification.data || {}).map(([key, value]) => [
                                            key,
                                            typeof value === 'string' ? value : JSON.stringify(value)
                                        ])
                                    )
                                },
                                android: {
                                    priority: "high",
                                    notification: {
                                        sound: "default",
                                        channelId: "default"
                                    }
                                },
                                apns: {
                                    payload: {
                                        aps: {
                                            sound: "default"
                                        }
                                    }
                                }
                            };

                            // Send to multiple tokens (batch send)
                            const response = await admin.messaging().sendEachForMulticast({
                                tokens: tokens,
                                ...message
                            });

                            fcmSuccessCount = response.successCount;
                            fcmFailureCount = response.failureCount;

                            // Handle failed tokens
                            if (response.failureCount > 0) {
                                const failedTokens = [];
                                response.responses.forEach((resp, idx) => {
                                    if (!resp.success) {
                                        failedTokens.push(tokens[idx]);
                                    }
                                });

                                // Remove invalid tokens from database
                                if (failedTokens.length > 0) {
                                    await UserModel.updateMany(
                                        { fcmToken: { $in: failedTokens } },
                                        { $unset: { fcmToken: "" } }
                                    );
                                }
                            }

                            console.log(`FCM: Sent ${fcmSuccessCount} notifications, ${fcmFailureCount} failed`);
                        }
                    }
                } catch (fcmError) {
                    console.error("FCM delivery failed, but notifications saved to DB:", fcmError);
                    // Continue - notifications are already saved in DB
                }
            } else {
                console.warn("Firebase not initialized, notifications saved to DB only");
            }

            return {
                status: "OK",
                message: `Saved ${savedNotifications.length} notifications, sent ${fcmSuccessCount} via FCM`,
                savedCount: savedNotifications.length,
                fcmSuccessCount: fcmSuccessCount,
                fcmFailureCount: fcmFailureCount,
                notificationIds: notificationIds
            };
        } catch (error) {
            console.error("Error sending notifications to users:", error);
            return { status: "ERR", message: error.message };
        }
    },

    /**
     * Send notification to all customers
     * 
     * Flow: Get all customer IDs → Save to database → Send via FCM
     * 
     * @param {Object} notification - Notification object
     * @returns {Promise<Object>} Result object
     */
    async sendToAllCustomers(notification) {
        try {
            // Find customer role
            const customerRole = await RoleModel.findOne({ name: "customer" });
            if (!customerRole) {
                return { status: "ERR", message: "Customer role not found" };
            }

            // Get all active customers (with or without FCM tokens)
            // We save notifications for all customers, even if they don't have FCM token
            // They can see notifications when they log in
            const customers = await UserModel.find({
                role_id: customerRole._id,
                status: true // Only active customers
            }).select('_id').lean();

            if (customers.length === 0) {
                return { status: "ERR", message: "No active customers found" };
            }

            const userIds = customers.map(c => c._id.toString());
            return await this.sendToUsers(userIds, notification);
        } catch (error) {
            console.error("Error sending notification to all customers:", error);
            return { status: "ERR", message: error.message };
        }
    },

    /**
     * Send notification to users with specific role
     * 
     * Flow: Get all users with role → Save to database → Send via FCM
     * 
     * @param {String} roleName - Role name (e.g., "customer", "admin", "sales-staff")
     * @param {Object} notification - Notification object
     * @returns {Promise<Object>} Result object
     */
    async sendToRole(roleName, notification) {
        try {
            // Find role
            const role = await RoleModel.findOne({ name: roleName });
            if (!role) {
                return { status: "ERR", message: `Role '${roleName}' not found` };
            }

            // Get all active users with this role (with or without FCM tokens)
            const users = await UserModel.find({
                role_id: role._id,
                status: true // Only active users
            }).select('_id').lean();

            if (users.length === 0) {
                return { status: "ERR", message: `No active users with role '${roleName}' found` };
            }

            const userIds = users.map(u => u._id.toString());
            return await this.sendToUsers(userIds, notification);
        } catch (error) {
            console.error(`Error sending notification to role '${roleName}':`, error);
            return { status: "ERR", message: error.message };
        }
    },

    /**
     * Get notifications for a user
     * 
     * @param {String} userId - User ID
     * @param {Object} query - Query parameters (page, limit, isRead, type)
     * @returns {Promise<Object>} Result object with notifications and pagination
     */
    async getUserNotifications(userId, query = {}) {
        try {
            const { page = 1, limit = 20, isRead, type } = query;

            const filter = { userId: userId };
            if (isRead !== undefined) {
                filter.isRead = isRead === 'true' || isRead === true;
            }
            if (type) {
                filter.type = type;
            }

            const notifications = await NotificationModel.find(filter)
                .sort({ createdAt: -1 }) // Newest first
                .skip((page - 1) * limit)
                .limit(Number(limit))
                .lean();

            const total = await NotificationModel.countDocuments(filter);
            const unreadCount = await NotificationModel.countDocuments({
                userId: userId,
                isRead: false
            });

            return {
                status: "OK",
                data: notifications,
                pagination: {
                    page: Number(page),
                    limit: Number(limit),
                    total: total,
                    totalPages: Math.ceil(total / limit)
                },
                unreadCount: unreadCount
            };
        } catch (error) {
            console.error("Error getting user notifications:", error);
            return { status: "ERR", message: error.message };
        }
    },

    /**
     * Mark notification as read
     * 
     * @param {String} notificationId - Notification ID
     * @param {String} userId - User ID (to verify ownership)
     * @returns {Promise<Object>} Result object
     */
    async markAsRead(notificationId, userId) {
        try {
            const notification = await NotificationModel.findOne({
                _id: notificationId,
                userId: userId
            });

            if (!notification) {
                return { status: "ERR", message: "Notification not found or access denied" };
            }

            if (notification.isRead) {
                return { status: "OK", message: "Notification already marked as read", data: notification };
            }

            notification.isRead = true;
            notification.readAt = new Date();
            await notification.save();

            return {
                status: "OK",
                message: "Notification marked as read",
                data: notification
            };
        } catch (error) {
            console.error("Error marking notification as read:", error);
            return { status: "ERR", message: error.message };
        }
    },

    /**
     * Mark all notifications as read for a user
     * 
     * @param {String} userId - User ID
     * @returns {Promise<Object>} Result object
     */
    async markAllAsRead(userId) {
        try {
            const result = await NotificationModel.updateMany(
                { userId: userId, isRead: false },
                { 
                    $set: { 
                        isRead: true,
                        readAt: new Date()
                    } 
                }
            );

            return {
                status: "OK",
                message: `Marked ${result.modifiedCount} notifications as read`,
                modifiedCount: result.modifiedCount
            };
        } catch (error) {
            console.error("Error marking all notifications as read:", error);
            return { status: "ERR", message: error.message };
        }
    },

    /**
     * Get unread notification count for a user
     * 
     * @param {String} userId - User ID
     * @returns {Promise<Object>} Result object with count
     */
    async getUnreadCount(userId) {
        try {
            const count = await NotificationModel.countDocuments({
                userId: userId,
                isRead: false
            });

            return {
                status: "OK",
                count: count
            };
        } catch (error) {
            console.error("Error getting unread count:", error);
            return { status: "ERR", message: error.message };
        }
    }
};

module.exports = NotificationService;
