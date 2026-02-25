const ContactService = require("../services/ContactService");

/**
 * Tạo Contact mới
 * POST /contacts
 */
const createContact = async (req, res) => {
    try {
        const { subject, message, category } = req.body;
        const userId = req.user._id;

        const response = await ContactService.createContact(userId, {
            subject,
            message,
            category,
        });

        if (response.status === "ERR") {
            return res.status(400).json(response);
        }

        return res.status(201).json(response);
    } catch (error) {
        return res.status(500).json({
            status: "ERR",
            message: error.message,
        });
    }
};

/**
 * Lấy danh sách Contact
 * GET /contacts
 */
const getContacts = async (req, res) => {
    try {
        const userId = req.user._id;
        const isAdminOrFeedbackedStaff = req.user.isAdminOrFeedbackedStaff || false;
        const { status, category, page, limit } = req.query;

        const response = await ContactService.getContacts(userId, isAdminOrFeedbackedStaff, {
            status,
            category,
            page: parseInt(page) || 1,
            limit: parseInt(limit) || 10,
        });

        if (response.status === "ERR") {
            return res.status(400).json(response);
        }

        return res.status(200).json(response);
    } catch (error) {
        return res.status(500).json({
            status: "ERR",
            message: error.message,
        });
    }
};

/**
 * Lấy chi tiết Contact
 * GET /contacts/:id
 */
const getContactById = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user._id;
        const isAdminOrFeedbackedStaff = req.user.isAdminOrFeedbackedStaff || false;

        const response = await ContactService.getContactById(id, userId, isAdminOrFeedbackedStaff);

        if (response.status === "ERR") {
            return res.status(400).json(response);
        }

        return res.status(200).json(response);
    } catch (error) {
        return res.status(500).json({
            status: "ERR",
            message: error.message,
        });
    }
};

/**
 * Cập nhật trạng thái Contact (chỉ Admin)
 * PATCH /contacts/:id/status
 */
const updateContactStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user._id;
        const isAdminOrFeedbackedStaff = req.user.isAdminOrFeedbackedStaff || false;
        const { status, assigned_admin_id } = req.body;
        const response = await ContactService.updateContactStatus(id, userId, isAdminOrFeedbackedStaff, {
            status,
            assigned_admin_id,
        });

        if (response.status === "ERR") {
            return res.status(400).json(response);
        }

        return res.status(200).json(response);
    } catch (error) {
        return res.status(500).json({
            status: "ERR",
            message: error.message,
        });
    }
};

/**
 * Tạo Reply cho Contact
 * POST /contacts/:id/replies
 */
const createReply = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user._id;
        const isAdminOrFeedbackedStaff = req.user.isAdminOrFeedbackedStaff || false;
        const { message } = req.body;

        const response = await ContactService.createReply(id, userId, isAdminOrFeedbackedStaff, { message });

        if (response.status === "ERR") {
            return res.status(400).json(response);
        }

        return res.status(201).json(response);
    } catch (error) {
        return res.status(500).json({
            status: "ERR",
            message: error.message,
        });
    }
};

/**
 * Lấy danh sách Reply của Contact
 * GET /contacts/:id/replies
 */
const getReplies = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user._id;
        const isAdminOrFeedbackedStaff = req.user.isAdminOrFeedbackedStaff || false;

        const response = await ContactService.getReplies(id, userId, isAdminOrFeedbackedStaff);

        if (response.status === "ERR") {
            return res.status(400).json(response);
        }

        return res.status(200).json(response);
    } catch (error) {
        return res.status(500).json({
            status: "ERR",
            message: error.message,
        });
    }
};

/**
 * Cập nhật Reply (chỉ Admin, chỉ reply của chính mình)
 * PUT /contacts/:id/replies/:replyId
 */
const updateReply = async (req, res) => {
    try {
        const { id, replyId } = req.params;
        const userId = req.user._id;
        const isAdminOrFeedbackedStaff = req.user.isAdminOrFeedbackedStaff || false;
        const { message } = req.body;

        const response = await ContactService.updateReply(id, replyId, userId, isAdminOrFeedbackedStaff, { message });

        if (response.status === "ERR") {
            return res.status(400).json(response);
        }

        return res.status(200).json(response);
    } catch (error) {
        return res.status(500).json({
            status: "ERR",
            message: error.message,
        });
    }
};

/**
 * Xóa Reply (chỉ Admin, chỉ reply của chính mình)
 * DELETE /contacts/:id/replies/:replyId
 */
const deleteReply = async (req, res) => {
    try {
        const { id, replyId } = req.params;
        const userId = req.user._id;
        const isAdminOrFeedbackedStaff = req.user.isAdminOrFeedbackedStaff || false;

        const response = await ContactService.deleteReply(id, replyId, userId, isAdminOrFeedbackedStaff);

        if (response.status === "ERR") {
            return res.status(400).json(response);
        }

        return res.status(200).json(response);
    } catch (error) {
        return res.status(500).json({
            status: "ERR",
            message: error.message,
        });
    }
};

/**
 * Upload Attachment cho Contact
 * POST /contacts/:id/attachments
 */
const uploadAttachment = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user._id;
        const isAdminOrFeedbackedStaff = req.user.isAdminOrFeedbackedStaff || false;
        const file = req.file;


        const response = await ContactService.uploadAttachment(id, userId, isAdminOrFeedbackedStaff, file);

        if (response.status === "ERR") {
            return res.status(400).json(response);
        }

        return res.status(201).json(response);
    } catch (error) {
        return res.status(500).json({
            status: "ERR",
            message: error.message,
        });
    }
};

/**
 * Lấy danh sách Attachment của Contact
 * GET /contacts/:id/attachments
 */
const getAttachments = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user._id;
        const isAdminOrFeedbackedStaff = req.user.isAdminOrFeedbackedStaff || false;

        const response = await ContactService.getAttachments(id, userId, isAdminOrFeedbackedStaff);

        if (response.status === "ERR") {
            return res.status(400).json(response);
        }

        return res.status(200).json(response);
    } catch (error) {
        return res.status(500).json({
            status: "ERR",
            message: error.message,
        });
    }
};

/**
 * Xóa Attachment
 * DELETE /contacts/:id/attachments/:attachmentId
 */
const deleteAttachment = async (req, res) => {
    try {
        const { attachmentId } = req.params;
        const userId = req.user._id;
        const isAdminOrFeedbackedStaff = req.user.isAdminOrFeedbackedStaff || false;

        const response = await ContactService.deleteAttachment(attachmentId, userId, isAdminOrFeedbackedStaff);

        if (response.status === "ERR") {
            return res.status(400).json(response);
        }

        return res.status(200).json(response);
    } catch (error) {
        return res.status(500).json({
            status: "ERR",
            message: error.message,
        });
    }
};

module.exports = {
    createContact,
    getContacts,
    getContactById,
    updateContactStatus,
    createReply,
    getReplies,
    updateReply,
    deleteReply,
    uploadAttachment,
    getAttachments,
    deleteAttachment,
};
