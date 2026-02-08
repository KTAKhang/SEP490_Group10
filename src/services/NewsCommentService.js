const mongoose = require("mongoose");
const NewsCommentModel = require("../models/NewsCommentModel");
const NewsModel = require("../models/NewsModel");
const UserModel = require("../models/UserModel");

/**
 * Helper: Validate content không chứa HTML
 * 
 * @param {string} content - Nội dung comment
 * @returns {object} - { valid: boolean, message?: string }
 */
const validatePlainText = (content) => {
  if (!content || !content.trim()) {
    return { valid: false, message: "Nội dung comment không được rỗng" };
  }

  const trimmed = content.trim();

  // Kiểm tra độ dài
  if (trimmed.length < 5) {
    return { valid: false, message: "Nội dung comment phải có ít nhất 5 ký tự" };
  }
  if (trimmed.length > 1000) {
    return { valid: false, message: "Nội dung comment không được vượt quá 1000 ký tự" };
  }

  // Kiểm tra HTML tags
  if (/<[^>]*>/.test(trimmed)) {
    return { valid: false, message: "Comment không được chứa HTML tags hoặc ký tự định dạng" };
  }

  return { valid: true };
};

/**
 * BR-COMMENT-06: Chống spam comment
 * 
 * Kiểm tra giới hạn tần suất: Mỗi user chỉ được tạo tối đa 2 comment trong 1 phút cho mỗi bài viết
 * 
 * @param {string} userId - ID của user
 * @param {string} newsId - ID của bài viết
 * @returns {Promise<object>} - { valid: boolean, message?: string }
 */
const checkSpamLimit = async (userId, newsId) => {
  const oneMinuteAgo = new Date(Date.now() - 60 * 1000);

  const recentComments = await NewsCommentModel.countDocuments({
    user_id: userId,
    news_id: newsId,
    createdAt: { $gte: oneMinuteAgo },
  });

  if (recentComments >= 2) {
    return {
      valid: false,
      message: "Bạn đang bình luận quá nhanh, vui lòng thử lại sau",
    };
  }

  return { valid: true };
};

/**
 * BR-COMMENT-05: Kiểm tra độ sâu comment
 *
 * Cho phép tối đa 5 cấp:
 * - Cấp 1: Comment gốc (parent_id = null, depth = 0)
 * - Cấp 2–5: Reply lồng nhau (depth = 1, 2, 3, 4)
 *
 * Không cho phép reply vào comment cấp 5 (depth = 4).
 *
 * @param {string} parentId - ID của comment cha
 * @returns {Promise<object>} - { valid: boolean, message?: string }
 */
const checkCommentDepth = async (parentId) => {
  if (!parentId) {
    return { valid: true }; // Comment gốc luôn hợp lệ
  }

  const parentComment = await NewsCommentModel.findById(parentId);
  if (!parentComment) {
    return { valid: false, message: "Comment cha không tồn tại" };
  }

  // Tính độ sâu: đi ngược parent_id đến khi gặp null (depth 0 = cấp 1, depth 4 = cấp 5)
  let depth = 0;
  let current = parentComment;
  while (current.parent_id) {
    depth += 1;
    current = await NewsCommentModel.findById(current.parent_id);
    if (!current) {
      return { valid: false, message: "Comment cha không tồn tại" };
    }
  }

  // Không cho reply khi comment cha đã ở cấp 5 (depth = 4)
  if (depth >= 4) {
    return {
      valid: false,
      message: "Không thể reply vào comment cấp 5. Hệ thống chỉ hỗ trợ tối đa 5 cấp comment",
    };
  }

  return { valid: true };
};

/**
 * BR-COMMENT-01: Tạo comment
 * 
 * Thuật toán tạo comment:
 * 
 * BƯỚC 1: Validate các trường bắt buộc
 * - news_id: Phải có
 * - user_id: Phải có
 * - content: Phải có và không rỗng
 * 
 * BƯỚC 2: Validate content (BR-COMMENT-01)
 * - Không rỗng sau khi trim
 * - Độ dài từ 5 đến 1000 ký tự
 * - Không chứa HTML hoặc ký tự định dạng
 * 
 * BƯỚC 3: Kiểm tra bài viết tồn tại và đã PUBLISHED
 * - Tìm bài viết theo news_id
 * - Nếu không tồn tại → trả về lỗi
 * - Nếu status != "PUBLISHED" → trả về lỗi
 * 
 * BƯỚC 4: Kiểm tra user tồn tại
 * - Tìm user theo user_id
 * - Nếu không tồn tại → trả về lỗi
 * 
 * BƯỚC 5: Xử lý parent_id (nếu có)
 * - Nếu có parent_id → validate comment cha (BR-COMMENT-04, BR-COMMENT-05)
 * - Kiểm tra comment cha tồn tại
 * - Kiểm tra comment cha thuộc cùng bài viết
 * - Kiểm tra comment cha không có status = DELETED
 * - Kiểm tra độ sâu comment (tối đa 5 cấp)
 * 
 * BƯỚC 6: Chống spam (BR-COMMENT-06)
 * - Kiểm tra user đã tạo quá 2 comment trong 1 phút cho bài viết này chưa
 * - Nếu vượt quá → trả về lỗi
 * 
 * BƯỚC 7: Tạo và lưu comment
 * - Set status = "VISIBLE" (mặc định)
 * - Set is_edited = false
 * 
 * @param {object} payload - { news_id, user_id, content, parent_id? }
 * @returns {Promise<object>} - { status: "OK"|"ERR", message: string, data?: NewsCommentModel }
 */
const createComment = async (payload = {}) => {
  try {
    const { news_id, user_id, content, parent_id } = payload;

    // Validate required fields
    if (!news_id) {
      return { status: "ERR", message: "News ID là bắt buộc" };
    }
    if (!user_id) {
      return { status: "ERR", message: "User ID là bắt buộc" };
    }
    if (!content) {
      return { status: "ERR", message: "Nội dung comment là bắt buộc" };
    }

    // Validate content (BR-COMMENT-01)
    const contentValidation = validatePlainText(content);
    if (!contentValidation.valid) {
      return { status: "ERR", message: contentValidation.message };
    }

    // Kiểm tra bài viết tồn tại và đã PUBLISHED (không xóa mềm)
    const news = await NewsModel.findById(news_id);
    if (!news) {
      return { status: "ERR", message: "Bài viết không tồn tại" };
    }
    if (news.deleted_at) {
      return { status: "ERR", message: "Bài viết không tồn tại" };
    }
    if (news.status !== "PUBLISHED") {
      return {
        status: "ERR",
        message: "Chỉ có thể comment vào bài viết đã được xuất bản",
      };
    }

    // Kiểm tra user tồn tại
    const user = await UserModel.findById(user_id);
    if (!user) {
      return { status: "ERR", message: "Người dùng không tồn tại" };
    }

    // Xử lý parent_id nếu có (BR-COMMENT-04, BR-COMMENT-05)
    if (parent_id) {
      const parentComment = await NewsCommentModel.findById(parent_id);
      if (!parentComment) {
        return { status: "ERR", message: "Comment cha không tồn tại" };
      }

      // Kiểm tra comment cha thuộc cùng bài viết
      if (parentComment.news_id.toString() !== news_id.toString()) {
        return {
          status: "ERR",
          message: "Comment cha phải thuộc cùng một bài viết",
        };
      }

      // Kiểm tra comment cha không bị xóa
      if (parentComment.status === "DELETED") {
        return {
          status: "ERR",
          message: "Không thể reply vào comment đã bị xóa",
        };
      }

      // Kiểm tra độ sâu comment (BR-COMMENT-05)
      const depthValidation = await checkCommentDepth(parent_id);
      if (!depthValidation.valid) {
        return { status: "ERR", message: depthValidation.message };
      }
    }

    // Chống spam (BR-COMMENT-06)
    const spamCheck = await checkSpamLimit(user_id, news_id);
    if (!spamCheck.valid) {
      return { status: "ERR", message: spamCheck.message };
    }

    // Tạo comment
    const comment = new NewsCommentModel({
      news_id: new mongoose.Types.ObjectId(news_id),
      user_id: new mongoose.Types.ObjectId(user_id),
      parent_id: parent_id ? new mongoose.Types.ObjectId(parent_id) : null,
      content: content.trim(),
      status: "VISIBLE",
      is_edited: false,
    });

    await comment.save();

    const populated = await NewsCommentModel.findById(comment._id)
      .populate("user_id", "user_name email avatar")
      .populate("parent_id", "content user_id");

    return {
      status: "OK",
      message: "Tạo comment thành công",
      data: populated,
    };
  } catch (error) {
    return { status: "ERR", message: error.message };
  }
};

/**
 * Get Comments - Lấy danh sách comment của một bài viết
 * 
 * Thuật toán:
 * 
 * BƯỚC 1: Validate news_id
 * - Kiểm tra bài viết tồn tại
 * 
 * BƯỚC 2: Xây dựng query
 * - Filter theo news_id
 * - Chỉ hiển thị comment có status = "VISIBLE" (hoặc user là admin/author)
 * - Nếu có parent_id filter → chỉ lấy reply của comment đó
 * - Nếu không có parent_id filter → chỉ lấy comment gốc (parent_id = null)
 * 
 * BƯỚC 3: Populate thông tin
 * - Populate user_id (user_name, email, avatar)
 * - Populate parent_id nếu có (để hiển thị comment cha)
 * 
 * BƯỚC 4: Sắp xếp
 * - Sắp xếp theo createdAt ASC (cũ nhất trước)
 * 
 * @param {string} newsId - ID của bài viết
 * @param {string|null} parentId - ID của comment cha (null để lấy comment gốc)
 * @param {boolean} isAdmin - User có phải admin không
 * @param {string|null} userId - ID của user đang xem (để check quyền)
 * @returns {Promise<object>} - { status: "OK"|"ERR", message: string, data: NewsCommentModel[] }
 */
const getComments = async (newsId, parentId = null, isAdmin = false, userId = null) => {
  try {
    // Kiểm tra bài viết tồn tại và chưa bị xóa mềm
    const news = await NewsModel.findById(newsId);
    if (!news) {
      return { status: "ERR", message: "Bài viết không tồn tại" };
    }
    if (news.deleted_at) {
      return { status: "ERR", message: "Bài viết không tồn tại" };
    }

    const query = { news_id: newsId };

    // Filter theo parent_id
    if (parentId === null) {
      // Lấy comment gốc (không có parent)
      query.parent_id = null;
    } else {
      // Lấy reply của comment cụ thể
      query.parent_id = parentId;
    }

    // Filter theo status
    // Admin có thể xem tất cả (trừ DELETED nếu không phải của họ)
    if (!isAdmin) {
      query.status = "VISIBLE";
    } else {
      // Admin có thể xem VISIBLE và HIDDEN, nhưng DELETED chỉ hiển thị nếu là của họ
      query.$or = [
        { status: { $in: ["VISIBLE", "HIDDEN"] } },
        { status: "DELETED", user_id: userId },
      ];
    }

    const comments = await NewsCommentModel.find(query)
      .populate("user_id", "user_name email avatar")
      .populate({
        path: "parent_id",
        select: "content user_id",
        populate: {
          path: "user_id",
          select: "user_name",
        },
      })
      .sort({ createdAt: 1 }); // Cũ nhất trước

    return {
      status: "OK",
      message: "Lấy danh sách comment thành công",
      data: comments,
    };
  } catch (error) {
    return { status: "ERR", message: error.message };
  }
};

/**
 * BR-COMMENT-02: Cập nhật comment
 * 
 * Thuật toán cập nhật:
 * 
 * BƯỚC 1: Kiểm tra comment tồn tại
 * - Tìm comment theo ID
 * - Nếu không tìm thấy → trả về lỗi
 * 
 * BƯỚC 2: Kiểm tra quyền chỉnh sửa (BR-COMMENT-02)
 * - Admin: Có thể sửa tất cả comment
 * - User: Chỉ có thể sửa comment của chính mình
 * - Không cho phép sửa comment có status = DELETED
 * 
 * BƯỚC 3: Validate content mới
 * - Không rỗng sau khi trim
 * - Độ dài từ 5 đến 1000 ký tự
 * - Không chứa HTML
 * 
 * BƯỚC 4: Cập nhật comment
 * - Cập nhật content
 * - Set is_edited = true
 * 
 * @param {string} commentId - ID của comment
 * @param {string} newContent - Nội dung mới
 * @param {string} userId - ID của user đang update
 * @param {boolean} isAdmin - User có phải admin không
 * @returns {Promise<object>} - { status: "OK"|"ERR", message: string, data?: NewsCommentModel }
 */
const updateComment = async (commentId, newContent, userId, isAdmin = false) => {
  try {
    const comment = await NewsCommentModel.findById(commentId);
    if (!comment) {
      return { status: "ERR", message: "Comment không tồn tại" };
    }

    // BR-COMMENT-02: Kiểm tra quyền chỉnh sửa
    if (!isAdmin && comment.user_id.toString() !== userId) {
      return {
        status: "ERR",
        message: "Bạn không có quyền chỉnh sửa comment này",
      };
    }

    // Không cho phép sửa comment đã bị xóa
    if (comment.status === "DELETED") {
      return {
        status: "ERR",
        message: "Không thể chỉnh sửa comment đã bị xóa",
      };
    }

    // Validate content mới
    const contentValidation = validatePlainText(newContent);
    if (!contentValidation.valid) {
      return { status: "ERR", message: contentValidation.message };
    }

    // Cập nhật
    comment.content = newContent.trim();
    comment.is_edited = true;
    await comment.save();

    const populated = await NewsCommentModel.findById(comment._id)
      .populate("user_id", "user_name email avatar")
      .populate("parent_id", "content user_id");

    return {
      status: "OK",
      message: "Cập nhật comment thành công",
      data: populated,
    };
  } catch (error) {
    return { status: "ERR", message: error.message };
  }
};

/**
 * BR-COMMENT-03: Xóa comment (Xóa mềm)
 * 
 * Thuật toán xóa:
 * 
 * BƯỚC 1: Kiểm tra comment tồn tại
 * - Tìm comment theo ID
 * - Nếu không tìm thấy → trả về lỗi
 * 
 * BƯỚC 2: Kiểm tra quyền xóa (BR-COMMENT-03)
 * - Admin: Có thể xóa tất cả comment
 * - User: Chỉ có thể xóa comment của chính mình
 * 
 * BƯỚC 3: Xóa mềm
 * - Set status = "DELETED"
 * - Không xóa khỏi database
 * 
 * Lưu ý:
 * - Comment bị xóa sẽ hiển thị "Bình luận đã bị xóa"
 * - Reply của comment bị xóa vẫn hiển thị bình thường
 * 
 * @param {string} commentId - ID của comment
 * @param {string} userId - ID của user đang xóa
 * @param {boolean} isAdmin - User có phải admin không
 * @returns {Promise<object>} - { status: "OK"|"ERR", message: string }
 */
const deleteComment = async (commentId, userId, isAdmin = false) => {
  try {
    const comment = await NewsCommentModel.findById(commentId);
    if (!comment) {
      return { status: "ERR", message: "Comment không tồn tại" };
    }

    // BR-COMMENT-03: Kiểm tra quyền xóa
    if (!isAdmin && comment.user_id.toString() !== userId) {
      return {
        status: "ERR",
        message: "Bạn không có quyền xóa comment này",
      };
    }

    // Xóa mềm
    comment.status = "DELETED";
    await comment.save();

    return { status: "OK", message: "Xóa comment thành công" };
  } catch (error) {
    return { status: "ERR", message: error.message };
  }
};

/**
 * BR-COMMENT-07: Moderation - Ẩn/hiện comment
 * 
 * Chỉ admin mới có quyền moderation
 * 
 * @param {string} commentId - ID của comment
 * @param {string} status - "VISIBLE" hoặc "HIDDEN"
 * @returns {Promise<object>} - { status: "OK"|"ERR", message: string }
 */
const moderateComment = async (commentId, status) => {
  try {
    if (status !== "VISIBLE" && status !== "HIDDEN") {
      return {
        status: "ERR",
        message: "Status không hợp lệ. Chỉ cho phép VISIBLE hoặc HIDDEN",
      };
    }

    const comment = await NewsCommentModel.findById(commentId);
    if (!comment) {
      return { status: "ERR", message: "Comment không tồn tại" };
    }

    // Không cho phép moderation comment đã bị xóa
    if (comment.status === "DELETED") {
      return {
        status: "ERR",
        message: "Không thể moderation comment đã bị xóa",
      };
    }

    comment.status = status;
    await comment.save();

    return {
      status: "OK",
      message: status === "VISIBLE" ? "Hiển thị comment thành công" : "Ẩn comment thành công",
    };
  } catch (error) {
    return { status: "ERR", message: error.message };
  }
};

module.exports = {
  createComment,
  getComments,
  updateComment,
  deleteComment,
  moderateComment,
};
