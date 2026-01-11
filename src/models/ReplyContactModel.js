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
            required: [true, "Contact ID là bắt buộc"],
            index: true,
        },
        sender_type: {
            type: String,
            required: [true, "Sender type là bắt buộc"],
            enum: {
                values: ["USER", "ADMIN"],
                message: "Sender type phải là USER hoặc ADMIN",
            },
        },
        sender_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "users",
            required: [true, "Sender ID là bắt buộc"],
        },
        message: {
            type: String,
            required: [true, "Message là bắt buộc"],
            trim: true,
            minlength: [1, "Message không được để trống"],
            maxlength: [5000, "Message không được vượt quá 5000 ký tự"],
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
