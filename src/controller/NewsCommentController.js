const NewsCommentService = require("../services/NewsCommentService");

/**
 * Create Comment - Tạo comment mới
 */
const createComment = async (req, res) => {
  try {
    const { newsId } = req.params;
    const response = await NewsCommentService.createComment({
      news_id: newsId,
      ...req.body,
      user_id: req.user._id,
    });
    if (response.status === "ERR") return res.status(400).json(response);
    return res.status(201).json(response);
  } catch (error) {
    return res.status(500).json({ status: "ERR", message: error.message });
  }
};

/**
 * Get Comments - Lấy danh sách comment của bài viết
 */
const getComments = async (req, res) => {
  try {
    const { newsId } = req.params;
    const { parent_id } = req.query; // null để lấy comment gốc, hoặc ID để lấy reply
    const isAdmin = req.user?.role_name === "admin";
    const userId = req.user?._id || null;

    // Xử lý parent_id: "null" string hoặc null → null, còn lại → giữ nguyên
    let parentId = null;
    if (parent_id !== undefined && parent_id !== null && parent_id !== "null" && parent_id !== "") {
      parentId = parent_id;
    }

    const response = await NewsCommentService.getComments(newsId, parentId, isAdmin, userId);
    if (response.status === "ERR") return res.status(400).json(response);
    return res.status(200).json(response);
  } catch (error) {
    return res.status(500).json({ status: "ERR", message: error.message });
  }
};

/**
 * Update Comment - Cập nhật comment
 */
const updateComment = async (req, res) => {
  try {
    const { id } = req.params;
    const { content } = req.body;
    const userId = req.user._id;
    const isAdmin = req.user.role_name === "admin";

    if (!content) {
      return res.status(400).json({
        status: "ERR",
        message: "Nội dung comment là bắt buộc",
      });
    }

    const response = await NewsCommentService.updateComment(id, content, userId, isAdmin);
    if (response.status === "ERR") return res.status(400).json(response);
    return res.status(200).json(response);
  } catch (error) {
    return res.status(500).json({ status: "ERR", message: error.message });
  }
};

/**
 * Delete Comment - Xóa comment (xóa mềm)
 */
const deleteComment = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;
    const isAdmin = req.user.role_name === "admin";

    const response = await NewsCommentService.deleteComment(id, userId, isAdmin);
    if (response.status === "ERR") return res.status(400).json(response);
    return res.status(200).json(response);
  } catch (error) {
    return res.status(500).json({ status: "ERR", message: error.message });
  }
};

/**
 * Moderate Comment - Moderation comment (chỉ admin)
 */
const moderateComment = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({
        status: "ERR",
        message: "Status là bắt buộc",
      });
    }

    const response = await NewsCommentService.moderateComment(id, status);
    if (response.status === "ERR") return res.status(400).json(response);
    return res.status(200).json(response);
  } catch (error) {
    return res.status(500).json({ status: "ERR", message: error.message });
  }
};

module.exports = {
  createComment,
  getComments,
  updateComment,
  deleteComment,
  moderateComment,
};
