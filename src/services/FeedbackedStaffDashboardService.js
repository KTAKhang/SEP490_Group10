/**
 * Feedbacked Staff Dashboard Service
 *
 * Thống kê trang dashboard cho role feedbacked-staff (và admin):
 * - Reviews: tổng số, đang hiển thị/ẩn, mới 7 ngày, danh sách gần đây
 * - News comments: tổng số, đang hiển thị/ẩn, mới 7 ngày, danh sách cần duyệt gần đây
 * - Chat: số phòng có tin chưa đọc (của staff đăng nhập), phòng gần đây
 * - News: tổng bài viết, bản nháp, đã xuất bản
 *
 * Dùng cho GET /api/feedbacked-staff/dashboard (auth: admin hoặc feedbacked-staff).
 */

const mongoose = require("mongoose");
const ReviewModel = require("../models/ReviewModel");
const NewsCommentModel = require("../models/NewsCommentModel");
const NewsModel = require("../models/NewsModel");
const ChatRoomModel = require("../models/ChatRoomModel");

const RECENT_DAYS = 7;
const RECENT_REVIEWS_LIMIT = 5;
const RECENT_COMMENTS_LIMIT = 5;
const RECENT_CHAT_ROOMS_LIMIT = 5;
const RECENT_NEWS_LIMIT = 5;

/**
 * Lấy ngày bắt đầu "7 ngày gần đây" (0h00) theo timezone VN
 */
function getRecentSinceVN() {
  const now = new Date();
  const vn = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" }));
  const since = new Date(vn.getFullYear(), vn.getMonth(), vn.getDate(), 0, 0, 0, 0);
  since.setDate(since.getDate() - RECENT_DAYS);
  return since;
}

/**
 * Thống kê dashboard cho feedbacked-staff
 * @param {string} staffUserId - _id của user đăng nhập (staff hoặc admin)
 * @returns {Promise<{ status: string, message: string, data: object }>}
 */
const getDashboardStats = async (staffUserId) => {
  try {
    if (!staffUserId || !mongoose.Types.ObjectId.isValid(staffUserId)) {
      return { status: "ERR", message: "Invalid user ID" };
    }

    const staffId = new mongoose.Types.ObjectId(staffUserId);
    const recentSince = getRecentSinceVN();

    // --- REVIEWS ---
    const [
      reviewTotal,
      reviewVisible,
      reviewHidden,
      reviewRecentCount,
      recentReviews,
    ] = await Promise.all([
      ReviewModel.countDocuments({}),
      ReviewModel.countDocuments({ status: "VISIBLE" }),
      ReviewModel.countDocuments({ status: "HIDDEN" }),
      ReviewModel.countDocuments({ createdAt: { $gte: recentSince } }),
      ReviewModel.find({})
        .populate("user_id", "user_name email")
        .populate("product_id", "name")
        .sort({ createdAt: -1 })
        .limit(RECENT_REVIEWS_LIMIT)
        .lean(),
    ]);

    // --- NEWS COMMENTS (không tính DELETED) ---
    const commentQuery = { status: { $in: ["VISIBLE", "HIDDEN"] } };
    const [
      commentTotal,
      commentVisible,
      commentHidden,
      commentRecentCount,
      recentComments,
    ] = await Promise.all([
      NewsCommentModel.countDocuments(commentQuery),
      NewsCommentModel.countDocuments({ status: "VISIBLE" }),
      NewsCommentModel.countDocuments({ status: "HIDDEN" }),
      NewsCommentModel.countDocuments({
        ...commentQuery,
        createdAt: { $gte: recentSince },
      }),
      NewsCommentModel.find(commentQuery)
        .populate("user_id", "user_name email")
        .populate("news_id", "title")
        .sort({ createdAt: -1 })
        .limit(RECENT_COMMENTS_LIMIT)
        .lean(),
    ]);

    // --- CHAT: phòng mà staff này phụ trách, có tin chưa đọc ---
    const [chatRoomsWithUnread, chatRoomsTotal, recentChatRooms] = await Promise.all([
      ChatRoomModel.countDocuments({ staff: staffId, unreadByStaff: { $gt: 0 } }),
      ChatRoomModel.countDocuments({ staff: staffId }),
      ChatRoomModel.find({ staff: staffId })
        .populate("user", "user_name avatar email")
        .sort({ updatedAt: -1 })
        .limit(RECENT_CHAT_ROOMS_LIMIT)
        .lean(),
    ]);

    // --- NEWS ---
    const newsQuery = { deleted_at: null };
    const [newsTotal, newsDraft, newsPublished, recentNews] = await Promise.all([
      NewsModel.countDocuments(newsQuery),
      NewsModel.countDocuments({ ...newsQuery, status: "DRAFT" }),
      NewsModel.countDocuments({ ...newsQuery, status: "PUBLISHED" }),
      NewsModel.find(newsQuery)
        .populate("author_id", "user_name email")
        .select("title status published_at createdAt")
        .sort({ updatedAt: -1 })
        .limit(RECENT_NEWS_LIMIT)
        .lean(),
    ]);

    const data = {
      summary: {
        reviews: {
          total: reviewTotal,
          visible: reviewVisible,
          hidden: reviewHidden,
          recentCount: reviewRecentCount,
        },
        newsComments: {
          total: commentTotal,
          visible: commentVisible,
          hidden: commentHidden,
          recentCount: commentRecentCount,
        },
        chat: {
          roomsWithUnread: chatRoomsWithUnread,
          totalRooms: chatRoomsTotal,
        },
        news: {
          total: newsTotal,
          draft: newsDraft,
          published: newsPublished,
        },
      },
      tasks: {
        unreadChatRooms: chatRoomsWithUnread,
        reviewsHidden: reviewHidden,
        commentsHidden: commentHidden,
        newsDraft: newsDraft,
      },
      recent: {
        reviews: recentReviews,
        newsComments: recentComments,
        chatRooms: recentChatRooms,
        news: recentNews,
      },
    };

    return {
      status: "OK",
      message: "Fetched feedbacked-staff dashboard successfully",
      data,
    };
  } catch (error) {
    return { status: "ERR", message: error.message };
  }
};

module.exports = {
  getDashboardStats,
};
