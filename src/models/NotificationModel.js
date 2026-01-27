/**
 * @author KhoaNDCE170420
 * @file NotificationModel.js
 * @description MongoDB model for storing persistent notifications.
 * 
 * This model stores all notifications sent to users, providing a complete
 * notification history that persists even after FCM notifications are dismissed.
 * 
 * Key features:
 * - Stores notification content (title, body, type, data)
 * - Tracks read status for each user
 * - Links to user who should receive the notification
 * - Includes timestamps for sorting and filtering
 * 
 * How it works:
 * - When a notification is sent via FCM, it's first saved to this collection
 * - Frontend can fetch notifications from this collection to display in UI
 * - Users can mark notifications as read
 * - Notifications persist indefinitely (can add cleanup job if needed)
 */

const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "users",
            required: [true, "User ID is required"],
            index: true,
        },
        title: {
            type: String,
            required: [true, "Notification title is required"],
            trim: true,
            maxlength: [200, "Title must be at most 200 characters"],
        },
        body: {
            type: String,
            required: [true, "Notification body is required"],
            trim: true,
            maxlength: [500, "Body must be at most 500 characters"],
        },
        type: {
            type: String,
            required: [true, "Notification type is required"],
            trim: true,
            enum: ["discount", "order", "contact", "product", "news", "general"],
            default: "general",
            index: true,
        },
        data: {
            type: mongoose.Schema.Types.Mixed,
            default: {},
            // Stores additional data like action, IDs, etc.
            // Example: { action: "view_voucher", discountId: "123", code: "ABC123" }
        },
        imageUrl: {
            type: String,
            default: null,
            trim: true,
        },
        isRead: {
            type: Boolean,
            default: false,
            index: true,
        },
        readAt: {
            type: Date,
            default: null,
        },
    },
    {
        timestamps: true, // Adds createdAt and updatedAt automatically
    }
);

// Compound index for efficient queries
notificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, type: 1, createdAt: -1 });

const NotificationModel = mongoose.model("notifications", notificationSchema);

module.exports = NotificationModel;
