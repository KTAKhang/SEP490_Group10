const mongoose = require("mongoose");

/**
 * Schema cho bảng ContactAttachment
 * Quản lý các file đính kèm cho mỗi Contact
 */
const contactAttachmentSchema = new mongoose.Schema(
    {
        contact_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "contacts",
            required: [true, "Contact ID là bắt buộc"],
            index: true,
        },
        file_name: {
            type: String,
            required: [true, "File name là bắt buộc"],
            trim: true,
        },
        file_url: {
            type: String,
            required: [true, "File URL là bắt buộc"],
            trim: true,
        },
        file_type: {
            type: String,
            required: [true, "File type là bắt buộc"],
            trim: true,
        },
        file_size: {
            type: Number,
            required: [true, "File size là bắt buộc"],
            min: [1, "File size phải lớn hơn 0"],
        },
    },
    {
        timestamps: true, // Tự động tạo created_at
    }
);

// Index để tối ưu query
// contactAttachmentSchema.index({ contact_id: 1 });

const ContactAttachmentModel = mongoose.model("contact_attachments", contactAttachmentSchema);
module.exports = ContactAttachmentModel;
