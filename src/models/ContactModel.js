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
            required: [true, "User ID is required"],
            index: true,
        },
        subject: {
            type: String,
            required: [true, "Subject is required"],
            trim: true,
            minlength: [5, "Subject must be at least 5 characters"],
            maxlength: [200, "Subject cannot exceed 200 characters"],
        },
        category: {
            type: String,
            required: [true, "Category is required"],
            enum: {
                values: ["products", "warranty", "policies", "services", "other"],
                message: "Category must be one of: products, warranty, policies, services, or other",
            },
            default: "other",
        },
        message: {
            type: String,
            required: [true, "Message is required"],
            trim: true,
            minlength: [10, "Message must be at least 10 characters"],
            maxlength: [5000, "Message cannot exceed 5000 characters"],
        },
        status: {
            type: String,
            enum: {
                values: ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"],
                message: "Status must be one of: OPEN, IN_PROGRESS, RESOLVED, or CLOSED",
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
