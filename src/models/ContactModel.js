const mongoose = require("mongoose");

/**
 * Schema cho bảng Contact
 * Quản lý các liên hệ/phản hồi từ khách hàng
 */
const contactSchema = new mongoose.Schema(
    {
        user_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "users",
            required: [true, "User ID là bắt buộc"],
            index: true,
        },
        subject: {
            type: String,
            required: [true, "Subject là bắt buộc"],
            trim: true,
            minlength: [5, "Subject phải có ít nhất 5 ký tự"],
            maxlength: [200, "Subject không được vượt quá 200 ký tự"],
        },
        category: {
            type: String,
            required: [true, "Category là bắt buộc"],
            enum: {
                values: ["LOW", "MEDIUM", "HIGH", "URGENT"],
                message: "Category phải là LOW, MEDIUM, HIGH hoặc URGENT",
            },
            default: "MEDIUM",
        },
        message: {
            type: String,
            required: [true, "Message là bắt buộc"],
            trim: true,
            minlength: [10, "Message phải có ít nhất 10 ký tự"],
            maxlength: [5000, "Message không được vượt quá 5000 ký tự"],
        },
        status: {
            type: String,
            enum: {
                values: ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"],
                message: "Status phải là OPEN, IN_PROGRESS, RESOLVED hoặc CLOSED",
            },
            default: "OPEN",
            index: true,
        },
        assigned_admin_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "users",
            default: null,
        },
    },
    {
        timestamps: true, // Tự động tạo created_at và updated_at
    }
);

// Index để tối ưu query
contactSchema.index({ user_id: 1, status: 1 });
contactSchema.index({ category: 1, status: 1 });
contactSchema.index({ assigned_admin_id: 1 });

const ContactModel = mongoose.model("contacts", contactSchema);
module.exports = ContactModel;
