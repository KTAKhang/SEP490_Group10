const ContactModel = require("../models/ContactModel");
const ReplyContactModel = require("../models/ReplyContactModel");
const ContactAttachmentModel = require("../models/ContactAttachmentModel");
const UserModel = require("../models/UserModel");
const cloudinary = require("../config/cloudinaryConfig");
const { Readable } = require("stream");

// Constants cho file upload
const ALLOWED_FILE_TYPES = [
    "image/jpeg",
    "image/png",
    "image/gif",
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/plain",
];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_FILES_PER_CONTACT = 5;

/**
 * BR-C-01: Mỗi Contact phải thuộc về một User hợp lệ, Guest không được tạo Contact.
 * BR-C-02: Subject là bắt buộc, không được để trống và có giới hạn độ dài.
 * BR-C-03: Category dùng để xác định mức độ ưu tiên, User không được tự set priority.
 * BR-C-04: Contact có vòng đời trạng thái rõ ràng: OPEN → IN_PROGRESS → RESOLVED → CLOSED.
 */
const createContact = async (userId, { subject, message, category }) => {
    try {
        // BR-C-01: Kiểm tra User hợp lệ
        const user = await UserModel.findById(userId);
        if (!user || user.status === false) {
            return {
                status: "ERR",
                message: "User không hợp lệ hoặc đã bị khóa",
            };
        }

        // BR-C-02: Validate subject
        if (!subject || subject.trim().length < 5 || subject.trim().length > 200) {
            return {
                status: "ERR",
                message: "Subject phải có từ 5 đến 200 ký tự",
            };
        }

        // BR-C-02: Validate message
        if (!message || message.trim().length < 10 || message.trim().length > 5000) {
            return {
                status: "ERR",
                message: "Message phải có từ 10 đến 5000 ký tự",
            };
        }

        // BR-C-03: Category được set mặc định hoặc từ backend, không cho user tự set priority
        // Nếu category không được cung cấp, mặc định là other
        const validCategory = category && ["products", "warranty", "policies", "services", "other"].includes(category)
            ? category
            : "other";

        // BR-C-04: Status mặc định là OPEN
        const newContact = new ContactModel({
            user_id: userId,
            subject: subject.trim(),
            message: message.trim(),
            category: validCategory,
            status: "OPEN",
        });

        await newContact.save();

        const populatedContact = await ContactModel.findById(newContact._id)
            .populate("user_id", "user_name email")
            .populate("assigned_admin_id", "user_name email");

        return {
            status: "OK",
            message: "Tạo Contact thành công",
            data: populatedContact,
        };
    } catch (error) {
        return {
            status: "ERR",
            message: error.message,
        };
    }
};

/**
 * BR-C-05: User chỉ được xem và thao tác trên Contact của chính mình, Admin xem tất cả.
 */
const getContacts = async (userId, isAdmin, filters = {}) => {
    try {
        const { status, category, page = 1, limit = 10 } = filters;
        const skip = (page - 1) * limit;

        let query = {};

        // BR-C-05: User chỉ xem Contact của mình, Admin xem tất cả
        if (!isAdmin) {
            query.user_id = userId;
        }

        if (status) {
            query.status = status;
        }

        if (category) {
            query.category = category;
        }

        const contacts = await ContactModel.find(query)
            .populate("user_id", "user_name email")
            .populate("assigned_admin_id", "user_name email")
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        const total = await ContactModel.countDocuments(query);

        return {
            status: "OK",
            message: "Lấy danh sách Contact thành công",
            data: contacts,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        };
    } catch (error) {
        return {
            status: "ERR",
            message: error.message,
        };
    }
};

/**
 * BR-C-05: User chỉ được xem Contact của chính mình, Admin xem tất cả.
 */
const getContactById = async (contactId, userId, isAdmin) => {
    try {
        const contact = await ContactModel.findById(contactId)
            .populate("user_id", "user_name email")
            .populate("assigned_admin_id", "user_name email");

        if (!contact) {
            return {
                status: "ERR",
                message: "Contact không tồn tại",
            };
        }

        // BR-C-05: User chỉ xem Contact của mình, Admin xem tất cả
        if (!isAdmin) {
            // Kiểm tra nếu user_id được populate hoặc là ObjectId trực tiếp
            const contactUserId = contact.user_id?._id?.toString() || contact.user_id?.toString();
            if (contactUserId !== userId.toString()) {
                return {
                    status: "ERR",
                    message: "Bạn không có quyền xem Contact này",
                };
            }
        }

        // Lấy danh sách replies
        const replies = await ReplyContactModel.find({ contact_id: contactId })
            .populate("sender_id", "user_name email")
            .sort({ createdAt: 1 });

        // Lấy danh sách attachments
        const attachments = await ContactAttachmentModel.find({ contact_id: contactId })
            .sort({ createdAt: 1 });

        // Xác định trạng thái reply
        let canReply = true;
        let waitingForAdminReply = false;

        if (!isAdmin) {
            // User không phải Admin
            if (contact.status === "CLOSED" || contact.status === "RESOLVED") {
                canReply = false;
            }
            // OPEN và IN_PROGRESS: User có thể reply bình thường
        } else {
            // Admin luôn có thể reply (trừ khi CLOSED hoặc RESOLVED)
            if (contact.status === "CLOSED" || contact.status === "RESOLVED") {
                canReply = false;
            }
        }

        return {
            status: "OK",
            message: "Lấy Contact thành công",
            data: {
                ...contact.toObject(),
                replies,
                attachments,
                canReply,
                waitingForAdminReply,
            },
        };
    } catch (error) {
        return {
            status: "ERR",
            message: error.message,
        };
    }
};

/**
 * BR-AUTH-01: Admin có quyền thay đổi trạng thái Contact (RESOLVED, CLOSED).
 * BR-AUTH-02: User không được thay đổi trạng thái Contact.
 * BR-AUTH-03: Admin có thể được gán xử lý Contact thông qua assigned_admin_id.
 * BR-C-04: Contact có vòng đời trạng thái rõ ràng: OPEN → IN_PROGRESS → RESOLVED → CLOSED.
 */
const updateContactStatus = async (contactId, userId, isAdmin, { status, assigned_admin_id }) => {
    try {
        // BR-AUTH-02: Chỉ Admin mới được thay đổi status
        if (!isAdmin) {
            return {
                status: "ERR",
                message: "Chỉ Admin mới có quyền thay đổi trạng thái Contact",
            };
        }

        const contact = await ContactModel.findById(contactId);
        if (!contact) {
            return {
                status: "ERR",
                message: "Contact không tồn tại",
            };
        }

        // BR-C-04: Validate status transition
        const validStatuses = ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"];
        if (status && !validStatuses.includes(status)) {
            return {
                status: "ERR",
                message: "Status không hợp lệ. Phải là OPEN, IN_PROGRESS, RESOLVED hoặc CLOSED",
            };
        }

        // BR-AUTH-01: Chỉ cho phép thay đổi sang RESOLVED hoặc CLOSED (hoặc các status khác)
        const updateData = {};
        if (status) {
            updateData.status = status;
        }

        // BR-AUTH-03: Gán admin xử lý
        if (assigned_admin_id) {
            const admin = await UserModel.findById(assigned_admin_id).populate("role_id", "name");
            if (!admin) {
                return {
                    status: "ERR",
                    message: "Admin không tồn tại",
                };
            }
            // Kiểm tra admin có phải là admin không
            if (admin.role_id?.name !== "admin") {
                return {
                    status: "ERR",
                    message: "User được gán không phải là Admin",
                };
            }
            updateData.assigned_admin_id = assigned_admin_id;
        }

        const updatedContact = await ContactModel.findByIdAndUpdate(
            contactId,
            updateData,
            { new: true }
        )
            .populate("user_id", "user_name email")
            .populate("assigned_admin_id", "user_name email");

        return {
            status: "OK",
            message: "Cập nhật Contact thành công",
            data: updatedContact,
        };
    } catch (error) {
        return {
            status: "ERR",
            message: error.message,
        };
    }
};

/**
 * BR-R-01: Mỗi ReplyContact phải thuộc về một Contact đang tồn tại.
 * BR-R-02: sender_type phải khớp với sender_id (USER → user_id, ADMIN → admin_id).
 * BR-R-03: User chỉ được gửi Reply với sender_type = USER, Admin chỉ được gửi với ADMIN.
 * BR-R-04: Khi có Reply mới, hệ thống phải cập nhật updated_at của Contact.
 * BR-C-06: Contact không được reply khi ở trạng thái CLOSED.
 */
const createReply = async (contactId, userId, isAdmin, { message }) => {
    try {
        // BR-R-01: Kiểm tra Contact tồn tại
        const contact = await ContactModel.findById(contactId);
        if (!contact) {
            return {
                status: "ERR",
                message: "Contact không tồn tại",
            };
        }

        // BR-C-06: Contact không được reply khi ở trạng thái CLOSED hoặc RESOLVED
        // Chỉ cho phép reply khi status là OPEN hoặc IN_PROGRESS
        if (contact.status === "CLOSED" || contact.status === "RESOLVED") {
            return {
                status: "ERR",
                message: "Không thể reply Contact đã được đóng hoặc đã được giải quyết",
            };
        }


        // BR-R-03: Xác định sender_type
        const senderType = isAdmin ? "ADMIN" : "USER";

        // BR-R-02: Validate sender_id
        const sender = await UserModel.findById(userId);
        if (!sender) {
            return {
                status: "ERR",
                message: "Sender không tồn tại",
            };
        }

        // Validate message
        if (!message || message.trim().length < 1 || message.trim().length > 5000) {
            return {
                status: "ERR",
                message: "Message phải có từ 1 đến 5000 ký tự",
            };
        }

        // Tạo reply
        const newReply = new ReplyContactModel({
            contact_id: contactId,
            sender_type: senderType,
            sender_id: userId,
            message: message.trim(),
        });

        await newReply.save();

        // BR-R-04: Cập nhật updatedAt của Contact
        await ContactModel.findByIdAndUpdate(contactId, { updatedAt: new Date() });

        // Nếu Contact đang ở trạng thái OPEN và Admin reply, tự động chuyển sang IN_PROGRESS
        if (contact.status === "OPEN" && isAdmin) {
            await ContactModel.findByIdAndUpdate(contactId, { status: "IN_PROGRESS" });
        }

        const populatedReply = await ReplyContactModel.findById(newReply._id)
            .populate("sender_id", "user_name email");

        return {
            status: "OK",
            message: "Tạo Reply thành công",
            data: populatedReply,
        };
    } catch (error) {
        return {
            status: "ERR",
            message: error.message,
        };
    }
};

/**
 * Lấy danh sách Reply của một Contact
 */
const getReplies = async (contactId, userId, isAdmin) => {
    try {
        const contact = await ContactModel.findById(contactId);
        if (!contact) {
            return {
                status: "ERR",
                message: "Contact không tồn tại",
            };
        }

        // BR-C-05: User chỉ xem Contact của mình, Admin xem tất cả
        if (!isAdmin) {
            const contactUserId = contact.user_id?._id?.toString() || contact.user_id?.toString();
            if (contactUserId !== userId.toString()) {
                return {
                    status: "ERR",
                    message: "Bạn không có quyền xem Contact này",
                };
            }
        }

        const replies = await ReplyContactModel.find({ contact_id: contactId })
            .populate("sender_id", "user_name email")
            .sort({ createdAt: 1 });

        return {
            status: "OK",
            message: "Lấy danh sách Reply thành công",
            data: replies,
        };
    } catch (error) {
        return {
            status: "ERR",
            message: error.message,
        };
    }
};

/**
 * Cập nhật Reply (chỉ Admin, chỉ reply của chính mình)
 * PUT /contacts/:contactId/replies/:replyId
 */
const updateReply = async (contactId, replyId, userId, isAdmin, { message }) => {
    try {
        // Chỉ Admin mới được update reply
        if (!isAdmin) {
            return {
                status: "ERR",
                message: "Chỉ Admin mới có quyền chỉnh sửa Reply",
            };
        }

        // Kiểm tra Contact tồn tại
        const contact = await ContactModel.findById(contactId);
        if (!contact) {
            return {
                status: "ERR",
                message: "Contact không tồn tại",
            };
        }

        // Kiểm tra Reply tồn tại
        const reply = await ReplyContactModel.findById(replyId);
        if (!reply) {
            return {
                status: "ERR",
                message: "Reply không tồn tại",
            };
        }

        // Kiểm tra Reply thuộc về Contact này
        if (reply.contact_id.toString() !== contactId.toString()) {
            return {
                status: "ERR",
                message: "Reply không thuộc về Contact này",
            };
        }

        // Chỉ cho phép Admin chỉnh sửa reply của chính mình
        if (reply.sender_type !== "ADMIN") {
            return {
                status: "ERR",
                message: "Chỉ có thể chỉnh sửa Reply của Admin",
            };
        }

        // Kiểm tra Admin có phải là người tạo reply không
        if (reply.sender_id.toString() !== userId.toString()) {
            return {
                status: "ERR",
                message: "Bạn chỉ có thể chỉnh sửa Reply của chính mình",
            };
        }

        // Validate message
        if (!message || message.trim().length < 1 || message.trim().length > 5000) {
            return {
                status: "ERR",
                message: "Message phải có từ 1 đến 5000 ký tự",
            };
        }

        // Cập nhật reply
        const updatedReply = await ReplyContactModel.findByIdAndUpdate(
            replyId,
            { message: message.trim() },
            { new: true }
        ).populate("sender_id", "user_name email");

        // Cập nhật updatedAt của Contact
        await ContactModel.findByIdAndUpdate(contactId, { updatedAt: new Date() });

        return {
            status: "OK",
            message: "Cập nhật Reply thành công",
            data: updatedReply,
        };
    } catch (error) {
        return {
            status: "ERR",
            message: error.message,
        };
    }
};

/**
 * Xóa Reply (chỉ Admin, chỉ reply của chính mình)
 * DELETE /contacts/:contactId/replies/:replyId
 */
const deleteReply = async (contactId, replyId, userId, isAdmin) => {
    try {
        // Chỉ Admin mới được xóa reply
        if (!isAdmin) {
            return {
                status: "ERR",
                message: "Chỉ Admin mới có quyền xóa Reply",
            };
        }

        // Kiểm tra Contact tồn tại
        const contact = await ContactModel.findById(contactId);
        if (!contact) {
            return {
                status: "ERR",
                message: "Contact không tồn tại",
            };
        }

        // Kiểm tra Reply tồn tại
        const reply = await ReplyContactModel.findById(replyId);
        if (!reply) {
            return {
                status: "ERR",
                message: "Reply không tồn tại",
            };
        }

        // Kiểm tra Reply thuộc về Contact này
        if (reply.contact_id.toString() !== contactId.toString()) {
            return {
                status: "ERR",
                message: "Reply không thuộc về Contact này",
            };
        }

        // Chỉ cho phép Admin xóa reply của chính mình
        if (reply.sender_type !== "ADMIN") {
            return {
                status: "ERR",
                message: "Chỉ có thể xóa Reply của Admin",
            };
        }

        // Kiểm tra Admin có phải là người tạo reply không
        if (reply.sender_id.toString() !== userId.toString()) {
            return {
                status: "ERR",
                message: "Bạn chỉ có thể xóa Reply của chính mình",
            };
        }

        // Xóa reply
        await ReplyContactModel.findByIdAndDelete(replyId);

        // Cập nhật updatedAt của Contact
        await ContactModel.findByIdAndUpdate(contactId, { updatedAt: new Date() });

        return {
            status: "OK",
            message: "Xóa Reply thành công",
        };
    } catch (error) {
        return {
            status: "ERR",
            message: error.message,
        };
    }
};

/**
 * BR-A-01: Mỗi Attachment phải thuộc về một Contact hợp lệ.
 * BR-A-02: Backend chỉ cho phép upload các loại file nằm trong whitelist.
 * BR-A-03: Dung lượng và số lượng file upload cho mỗi Contact phải bị giới hạn.
 * BR-A-04: Attachment không được chỉnh sửa nội dung sau khi upload.
 */
const uploadAttachment = async (contactId, userId, isAdmin, file) => {
    try {
        // BR-A-01: Kiểm tra Contact tồn tại
        const contact = await ContactModel.findById(contactId);
        if (!contact) {
            return {
                status: "ERR",
                message: "Contact không tồn tại",
            };
        }

        // BR-C-05: User chỉ upload cho Contact của mình, Admin upload cho tất cả
        if (!isAdmin) {
            const contactUserId = contact.user_id?._id?.toString() || contact.user_id?.toString();
            if (contactUserId !== userId.toString()) {
                return {
                    status: "ERR",
                    message: "Bạn không có quyền upload file cho Contact này",
                };
            }
        }

        if (!file) {
            return {
                status: "ERR",
                message: "File không được cung cấp",
            };
        }

        // BR-A-02: Kiểm tra file type trong whitelist
        if (!ALLOWED_FILE_TYPES.includes(file.mimetype)) {
            return {
                status: "ERR",
                message: `Loại file không được phép. Chỉ chấp nhận: ${ALLOWED_FILE_TYPES.join(", ")}`,
            };
        }

        // BR-A-03: Kiểm tra file size
        if (file.size > MAX_FILE_SIZE) {
            return {
                status: "ERR",
                message: `File quá lớn. Kích thước tối đa là ${MAX_FILE_SIZE / 1024 / 1024}MB`,
            };
        }

        // BR-A-03: Kiểm tra số lượng file đã upload
        const existingAttachments = await ContactAttachmentModel.countDocuments({ contact_id: contactId });
        if (existingAttachments >= MAX_FILES_PER_CONTACT) {
            return {
                status: "ERR",
                message: `Đã đạt giới hạn số lượng file (tối đa ${MAX_FILES_PER_CONTACT} file)`,
            };
        }

        // Upload file lên Cloudinary
        return new Promise((resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream(
                {
                    folder: `contacts/${contactId}`,
                    resource_type: "auto",
                },
                async (error, result) => {
                    if (error) {
                        return resolve({
                            status: "ERR",
                            message: "Lỗi khi upload file: " + error.message,
                        });
                    }

                    try {
                        // Tạo attachment record
                        const attachment = new ContactAttachmentModel({
                            contact_id: contactId,
                            file_name: file.originalname,
                            file_url: result.secure_url,
                            file_type: file.mimetype,
                            file_size: file.size,
                        });

                        await attachment.save();

                        resolve({
                            status: "OK",
                            message: "Upload file thành công",
                            data: attachment,
                        });
                    } catch (saveError) {
                        resolve({
                            status: "ERR",
                            message: "Lỗi khi lưu thông tin file: " + saveError.message,
                        });
                    }
                }
            );

            // Convert buffer to stream
            const bufferStream = new Readable();
            bufferStream.push(file.buffer);
            bufferStream.push(null);
            bufferStream.pipe(uploadStream);
        });
    } catch (error) {
        return {
            status: "ERR",
            message: error.message,
        };
    }
};

/**
 * Lấy danh sách Attachment của một Contact
 */
const getAttachments = async (contactId, userId, isAdmin) => {
    try {
        const contact = await ContactModel.findById(contactId);
        if (!contact) {
            return {
                status: "ERR",
                message: "Contact không tồn tại",
            };
        }

        // BR-C-05: User chỉ xem Contact của mình, Admin xem tất cả
        if (!isAdmin) {
            const contactUserId = contact.user_id?._id?.toString() || contact.user_id?.toString();
            if (contactUserId !== userId.toString()) {
                return {
                    status: "ERR",
                    message: "Bạn không có quyền xem Contact này",
                };
            }
        }

        const attachments = await ContactAttachmentModel.find({ contact_id: contactId })
            .sort({ createdAt: 1 });

        return {
            status: "OK",
            message: "Lấy danh sách Attachment thành công",
            data: attachments,
        };
    } catch (error) {
        return {
            status: "ERR",
            message: error.message,
        };
    }
};

/**
 * Xóa Attachment (chỉ Admin hoặc User sở hữu Contact)
 */
const deleteAttachment = async (attachmentId, userId, isAdmin) => {
    try {
        const attachment = await ContactAttachmentModel.findById(attachmentId);
        if (!attachment) {
            return {
                status: "ERR",
                message: "Attachment không tồn tại",
            };
        }

        const contact = await ContactModel.findById(attachment.contact_id);
        if (!contact) {
            return {
                status: "ERR",
                message: "Contact không tồn tại",
            };
        }

        // BR-C-05: User chỉ xóa Attachment của Contact của mình, Admin xóa tất cả
        if (!isAdmin) {
            const contactUserId = contact.user_id?._id?.toString() || contact.user_id?.toString();
            if (contactUserId !== userId.toString()) {
                return {
                    status: "ERR",
                    message: "Bạn không có quyền xóa Attachment này",
                };
            }
        }

        // Xóa file trên Cloudinary (nếu cần)
        // Note: Cloudinary tự động quản lý, có thể bỏ qua hoặc thêm logic xóa

        // Xóa record trong database
        await ContactAttachmentModel.findByIdAndDelete(attachmentId);

        return {
            status: "OK",
            message: "Xóa Attachment thành công",
        };
    } catch (error) {
        return {
            status: "ERR",
            message: error.message,
        };
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
