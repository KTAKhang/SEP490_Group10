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
            required: [true, "Contact ID is required"],
            index: true,
        },
        file_name: {
            type: String,
            required: [true, "File name is required"],
            trim: true,
        },
        file_url: {
            type: String,
            required: [true, "File URL is required"],
            trim: true,
        },
        file_type: {
            type: String,
            required: [true, "File type is required"],
            trim: true,
        },
        file_size: {
            type: Number,
            required: [true, "File size is required"],
            min: [1, "File size must be greater than 0"],
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
