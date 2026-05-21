const mongoose = require("mongoose");

/**
 * Schema cho bảng ReplyContact
 * Quản lý các phản hồi giữa User và Admin cho mỗi Contact
 */
const replyContactSchema = new mongoose.Schema(
    {
        contact_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "contacts",
            required: [true, "Contact ID is required"],
            index: true,
        },
        sender_type: {
            type: String,
            required: [true, "Sender type is required"],
            enum: {
                values: ["USER", "ADMIN"],
                message: "Sender type must be USER or ADMIN",
            },
        },
        sender_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "users",
            required: [true, "Sender ID is required"],
        },
        message: {
            type: String,
            required: [true, "Message is required"],
            trim: true,
            minlength: [1, "Message cannot be empty"],
            maxlength: [5000, "Message cannot exceed 5000 characters"],
        },
    },
    {
        timestamps: true, // Tự động tạo createdAt và updatedAt (camelCase)
    }
);

// Index để tối ưu query
// Lưu ý: timestamps: true tạo createdAt và updatedAt (camelCase), không phải created_at
replyContactSchema.index({ contact_id: 1, createdAt: -1 });

const ReplyContactModel = mongoose.model("reply_contacts", replyContactSchema);
module.exports = ReplyContactModel;
