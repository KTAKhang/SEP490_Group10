const NewsCommentService = require("../services/NewsCommentService");

/** Chuẩn hóa user id từ JWT decoded hoặc User document */
const actorId = (req) => String(req.user._id);

/** Admin / feedbacked-staff: từ populate role_id (authUserMiddleware) hoặc JWT (role / role_name) */
const actorIsAdminOrModerator = (req) => {
  const name =
    req.user?.role_id?.name ??
    req.user?.role_name ??
    req.user?.role ??
    null;
  const n = (name ?? "").toString().toLowerCase();
  return n === "admin" || n === "feedbacked-staff";
};

/** GET optional-auth: nhận diện admin/moderator để xem HIDDEN (authOptionalMiddleware chỉ có role_name) */
const viewerIsAdminOrModerator = (req) => {
  const n = (req.user?.role_name ?? "").toString().toLowerCase();
  return n === "admin" || n === "feedbacked-staff";
};

/**
 * Create Comment - Tạo comment mới
 */
const createComment = async (req, res) => {
  try {
    const { newsId } = req.params;
    const response = await NewsCommentService.createComment({
      news_id: newsId,
      ...req.body,
      user_id: actorId(req),
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
    const isAdmin = viewerIsAdminOrModerator(req);
    const userId = req.user?._id != null ? String(req.user._id) : null;

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
    const userId = actorId(req);

    if (!content) {
      return res.status(400).json({
        status: "ERR",
        message: "Nội dung comment là bắt buộc",
      });
    }

    const response = await NewsCommentService.updateComment(id, content, userId);
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
    const userId = actorId(req);
    const isAdmin = actorIsAdminOrModerator(req);

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
