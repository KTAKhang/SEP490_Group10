const mongoose = require("mongoose");
const NewsModel = require("../models/NewsModel");
const NewsViewsModel = require("../models/NewsViewsModel");
const UserModel = require("../models/UserModel");
const cloudinary = require("../config/cloudinaryConfig");
const { sanitizeHTMLWithImageValidation, validateHTMLImages, validateHTMLSecurity } = require("../utils/htmlSanitizer");

// Helper: Strip HTML tags
const stripHTML = (html) => {
  if (!html) return "";
  return html.replace(/<[^>]*>/g, "").trim();
};

// Helper: Validate thumbnail URL format
const isValidImageUrl = (url) => {
  if (!url) return false;
  const lowerUrl = url.toLowerCase();
  return lowerUrl.match(/\.(jpg|jpeg|png|webp)(\?|$)/i);
};

// BR-NEWS-01: Validate publishing requirements
const validatePublishingRequirements = (news) => {
  if (!news.title || !news.title.trim()) {
    return { valid: false, message: "Tiêu đề là bắt buộc để xuất bản" };
  }
  if (!news.content || !news.content.trim()) {
    return { valid: false, message: "Nội dung là bắt buộc để xuất bản" };
  }
  if (!news.thumbnail_url || !news.thumbnail_url.trim()) {
    return { valid: false, message: "Ảnh thumbnail là bắt buộc để xuất bản" };
  }
  if (!isValidImageUrl(news.thumbnail_url)) {
    return { valid: false, message: "Thumbnail phải là định dạng jpg, png hoặc webp" };
  }
  return { valid: true };
};

// BR-NEWS-03: Manage featured limit (max 5)
const manageFeaturedLimit = async () => {
  const featuredCount = await NewsModel.countDocuments({ 
    is_featured: true, 
    status: "PUBLISHED" 
  });

  if (featuredCount >= 5) {
    // Find oldest featured news by published_at
    const oldestFeatured = await NewsModel.findOne({
      is_featured: true,
      status: "PUBLISHED",
    })
      .sort({ published_at: 1 })
      .select("_id");

    if (oldestFeatured) {
      await NewsModel.findByIdAndUpdate(oldestFeatured._id, { is_featured: false });
    }
  }
};

// BR-NEWS-08: Validate content limits
const validateContentLimits = (payload) => {
  if (payload.title !== undefined) {
    const title = payload.title.toString().trim();
    if (title.length < 10) {
      return { valid: false, message: "Tiêu đề phải có ít nhất 10 ký tự" };
    }
    if (title.length > 200) {
      return { valid: false, message: "Tiêu đề không được vượt quá 200 ký tự" };
    }
  }

  if (payload.excerpt !== undefined && payload.excerpt) {
    const excerpt = payload.excerpt.toString().trim();
    if (excerpt.length < 50) {
      return { valid: false, message: "Excerpt phải có ít nhất 50 ký tự" };
    }
    if (excerpt.length > 500) {
      return { valid: false, message: "Excerpt không được vượt quá 500 ký tự" };
    }
  }

  if (payload.content !== undefined) {
    const content = payload.content.toString().trim();
    if (content.length < 100) {
      return { valid: false, message: "Nội dung phải có ít nhất 100 ký tự" };
    }
  }

  if (payload.thumbnail_url !== undefined && payload.thumbnail_url) {
    if (!isValidImageUrl(payload.thumbnail_url)) {
      return { valid: false, message: "Thumbnail phải là định dạng jpg, png hoặc webp" };
    }
  }

  return { valid: true };
};

// Create News
const createNews = async (payload = {}) => {
  try {
    const { title, content, excerpt, thumbnail_url, thumbnailPublicId, author_id, status, is_featured } = payload;

    // Validate required fields
    if (!title || !title.toString().trim()) {
      return { status: "ERR", message: "Tiêu đề là bắt buộc" };
    }
    if (!content || !content.toString().trim()) {
      return { status: "ERR", message: "Nội dung là bắt buộc" };
    }
    if (!thumbnail_url || !thumbnail_url.toString().trim()) {
      return { status: "ERR", message: "Ảnh thumbnail là bắt buộc" };
    }
    if (!author_id) {
      return { status: "ERR", message: "Author là bắt buộc" };
    }

    // Validate bảo mật HTML content TRƯỚC KHI sanitize
    // Nếu có script, iframe, event handlers, etc. → cảnh báo và không cho tạo
    const securityValidation = validateHTMLSecurity(content.toString().trim());
    if (!securityValidation.valid) {
      return { status: "ERR", message: securityValidation.message };
    }

    // Validate ảnh trong HTML content TRƯỚC KHI sanitize
    // Nếu có ảnh đáng ngờ → cảnh báo và không cho tạo
    const imageValidation = validateHTMLImages(content.toString().trim());
    if (!imageValidation.valid) {
      return { status: "ERR", message: imageValidation.message };
    }

    // Sanitize HTML content để loại bỏ malicious code
    let sanitizedContent = sanitizeHTMLWithImageValidation(content.toString().trim());

    // Validate content limits (sau khi sanitize)
    const contentValidation = validateContentLimits({ title, excerpt, content: sanitizedContent, thumbnail_url });
    if (!contentValidation.valid) {
      return { status: "ERR", message: contentValidation.message };
    }

    // Kiểm tra lại độ dài sau khi sanitize (có thể bị rút ngắn)
    if (sanitizedContent.length < 100) {
      return { status: "ERR", message: "Nội dung phải có ít nhất 100 ký tự sau khi sanitize" };
    }

    // Validate author exists
    const author = await UserModel.findById(author_id);
    if (!author) {
      return { status: "ERR", message: "Author không tồn tại" };
    }

    // Set status (default DRAFT)
    const newsStatus = status === "PUBLISHED" ? "PUBLISHED" : "DRAFT";

    // BR-NEWS-01: Validate publishing requirements if status is PUBLISHED
    if (newsStatus === "PUBLISHED") {
      const publishValidation = validatePublishingRequirements({
        title,
        content: sanitizedContent,
        thumbnail_url,
      });
      if (!publishValidation.valid) {
        return { status: "ERR", message: publishValidation.message };
      }
    }

    // Auto-generate excerpt if not provided (BR-NEWS-09)
    let finalExcerpt = excerpt;
    if (!excerpt || !excerpt.trim()) {
      const plainText = stripHTML(sanitizedContent);
      if (plainText.length > 200) {
        finalExcerpt = plainText.substring(0, 200) + "...";
      } else {
        finalExcerpt = plainText;
      }
    }

    // Xử lý is_featured: chỉ set true nếu explicitly set và status là PUBLISHED
    let finalIsFeatured = false;
    if (is_featured !== undefined) {
      // Convert string "true"/"false" thành boolean
      const isFeaturedValue = is_featured === true || is_featured === "true" || is_featured === "1";
      finalIsFeatured = isFeaturedValue;
    }

    // BR-NEWS-03: Chỉ PUBLISHED mới được featured
    if (finalIsFeatured && newsStatus !== "PUBLISHED") {
      finalIsFeatured = false; // Không cho phép featured nếu chưa PUBLISHED
    }

    const news = new NewsModel({
      title: title.toString().trim(),
      content: sanitizedContent,  // ← Dùng content đã được sanitize
      excerpt: finalExcerpt,
      thumbnail_url: thumbnail_url.toString().trim(),
      thumbnailPublicId: thumbnailPublicId || null,
      author_id: new mongoose.Types.ObjectId(author_id),
      status: newsStatus,
      is_featured: finalIsFeatured,  // ← Set rõ ràng
      published_at: newsStatus === "PUBLISHED" ? new Date() : null,
    });

    await news.save();

    // BR-NEWS-03: Manage featured limit nếu set featured và đã PUBLISHED
    if (finalIsFeatured && newsStatus === "PUBLISHED") {
      await manageFeaturedLimit();
      // Kiểm tra lại sau khi manage (có thể bị unfeature nếu vượt quá 5)
      const updatedNews = await NewsModel.findById(news._id);
      if (updatedNews.is_featured) {
        // Vẫn còn featured sau khi manage
      }
    }

    const populated = await NewsModel.findById(news._id)
      .populate("author_id", "user_name email avatar");

    return { status: "OK", message: "Tạo bài viết thành công", data: populated };
  } catch (error) {
    return { status: "ERR", message: error.message };
  }
};

// Get News List
const getNews = async (filters = {}) => {
  try {
    const {
      page = 1,
      limit = 20,
      search = "",
      status,
      is_featured,
      author_id,
      public = false, // Public mode: only show PUBLISHED
    } = filters;

    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit) || 20));
    const skip = (pageNum - 1) * limitNum;

    const query = {};

    // BR-NEWS-01: Public mode only shows PUBLISHED
    if (public === "true" || public === true) {
      query.status = "PUBLISHED";
    } else if (status) {
      query.status = status;
    }

    if (search) {
      query.$or = [
        { title: { $regex: search, $options: "i" } },
        { excerpt: { $regex: search, $options: "i" } },
      ];
    }

    if (is_featured !== undefined) {
      query.is_featured = is_featured === "true" || is_featured === true;
    }

    if (author_id) {
      query.author_id = author_id;
    }

    // BR-NEWS-11: Sorting
    let sort = {};
    if (public === "true" || public === true || query.status === "PUBLISHED") {
      sort = { published_at: -1 }; // PUBLISHED: sort by published_at DESC
    } else {
      sort = { updated_at: -1 }; // DRAFT: sort by updated_at DESC
    }

    const [data, total] = await Promise.all([
      NewsModel.find(query)
        .populate("author_id", "user_name email avatar")
        .sort(sort)
        .skip(skip)
        .limit(limitNum),
      NewsModel.countDocuments(query),
    ]);

    return {
      status: "OK",
      message: "Lấy danh sách bài viết thành công",
      data,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    };
  } catch (error) {
    return { status: "ERR", message: error.message };
  }
};

// Get News By ID
const getNewsById = async (id, userId = null, ipAddress = null) => {
  try {
    const news = await NewsModel.findById(id).populate("author_id", "user_name email avatar");
    if (!news) {
      return { status: "ERR", message: "Bài viết không tồn tại" };
    }

    // BR-NEWS-04: Track view (if not author/admin and has IP)
    // Convert both to string for proper comparison
    const authorIdStr = news.author_id._id ? news.author_id._id.toString() : news.author_id.toString();
    const userIdStr = userId ? userId.toString() : null;
    
    // Only track view if:
    // 1. Has IP address
    // 2. User is not the author (userId !== authorId)
    // 3. User is not admin
    if (ipAddress && userIdStr !== authorIdStr) {
      // Check if user is admin
      let isAdmin = false;
      if (userIdStr) {
        const user = await UserModel.findById(userIdStr).populate("role_id", "name");
        isAdmin = user?.role_id?.name === "admin";
      }

      // Only track view if not admin
      if (!isAdmin) {
        // Check if this IP already viewed this news in last 24 hours
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const existingView = await NewsViewsModel.findOne({
          news_id: id,
          ip_address: ipAddress,
          viewed_at: { $gte: twentyFourHoursAgo },
        });

        if (!existingView) {
          // Create view record
          await NewsViewsModel.create({
            news_id: id,
            ip_address: ipAddress,
            user_id: userIdStr ? new mongoose.Types.ObjectId(userIdStr) : null,
            viewed_at: new Date(),
          });

          // Increment view_count
          news.view_count = (news.view_count || 0) + 1;
          await news.save();
        }
      }
    }

    return { status: "OK", message: "Lấy bài viết thành công", data: news };
  } catch (error) {
    return { status: "ERR", message: error.message };
  }
};

// Update News
const updateNews = async (id, payload = {}, userId = null, isAdmin = false) => {
  try {
    const news = await NewsModel.findById(id);
    if (!news) {
      return { status: "ERR", message: "Bài viết không tồn tại" };
    }

    // BR-NEWS-02: Check permission
    if (!isAdmin && news.author_id.toString() !== userId) {
      return { status: "ERR", message: "Bạn không có quyền chỉnh sửa bài viết này" };
    }

    // Validate bảo mật HTML content nếu có update
    if (payload.content !== undefined) {
      const securityValidation = validateHTMLSecurity(payload.content.toString().trim());
      if (!securityValidation.valid) {
        return { status: "ERR", message: securityValidation.message };
      }
    }

    // Validate ảnh trong HTML content nếu có update
    if (payload.content !== undefined) {
      const imageValidation = validateHTMLImages(payload.content.toString().trim());
      if (!imageValidation.valid) {
        return { status: "ERR", message: imageValidation.message };
      }
    }

    // Sanitize HTML content nếu có update
    if (payload.content !== undefined) {
      payload.content = sanitizeHTMLWithImageValidation(payload.content.toString().trim());
      
      // Kiểm tra lại độ dài sau khi sanitize
      if (payload.content.length < 100) {
        return { status: "ERR", message: "Nội dung phải có ít nhất 100 ký tự sau khi sanitize" };
      }
    }

    // Validate content limits (sau khi sanitize)
    const contentValidation = validateContentLimits(payload);
    if (!contentValidation.valid) {
      return { status: "ERR", message: contentValidation.message };
    }

    // Update fields
    const allowedFields = ["title", "content", "excerpt", "thumbnail_url", "thumbnailPublicId", "status", "is_featured"];
    for (const key of Object.keys(payload)) {
      if (allowedFields.includes(key)) {
        if (key === "title" && payload[key] !== undefined) {
          news.title = payload[key].toString().trim();
        } else if (key === "content" && payload[key] !== undefined) {
          news.content = payload.content;  // ← Dùng content đã được sanitize
        } else if (key === "excerpt" && payload[key] !== undefined) {
          news.excerpt = payload[key].toString().trim();
        } else if (key === "thumbnail_url" && payload[key] !== undefined) {
          news.thumbnail_url = payload[key].toString().trim();
        } else if (key === "thumbnailPublicId" && payload[key] !== undefined) {
          news.thumbnailPublicId = payload[key];
        } else if (key === "status" && payload[key] !== undefined) {
          news.status = payload[key];
        } else if (key === "is_featured" && payload[key] !== undefined) {
          news.is_featured = payload[key];
        }
      }
    }

    // BR-NEWS-01: Validate publishing requirements if changing to PUBLISHED
    if (payload.status === "PUBLISHED") {
      const publishValidation = validatePublishingRequirements(news);
      if (!publishValidation.valid) {
        return { status: "ERR", message: publishValidation.message };
      }
      if (!news.published_at) {
        news.published_at = new Date();
      }
    }

    // BR-NEWS-03: Only PUBLISHED can be featured
    if (news.is_featured && news.status !== "PUBLISHED") {
      news.is_featured = false;
    }

    // BR-NEWS-03: Manage featured limit
    if (payload.is_featured === true && news.status === "PUBLISHED") {
      await manageFeaturedLimit();
    }

    // Auto-regenerate excerpt if content changed and excerpt not provided
    if (payload.content !== undefined && !payload.excerpt) {
      const plainText = stripHTML(news.content);
      if (plainText.length > 200) {
        news.excerpt = plainText.substring(0, 200) + "...";
      } else {
        news.excerpt = plainText;
      }
    }

    await news.save();

    const populated = await NewsModel.findById(news._id)
      .populate("author_id", "user_name email avatar");

    return { status: "OK", message: "Cập nhật bài viết thành công", data: populated };
  } catch (error) {
    return { status: "ERR", message: error.message };
  }
};

// Delete News
const deleteNews = async (id, userId = null, isAdmin = false) => {
  try {
    const news = await NewsModel.findById(id);
    if (!news) {
      return { status: "ERR", message: "Bài viết không tồn tại" };
    }

    // BR-NEWS-02: Check permission
    if (!isAdmin && news.author_id.toString() !== userId) {
      return { status: "ERR", message: "Bạn không có quyền xóa bài viết này" };
    }

    // BR-NEWS-02: Cannot delete PUBLISHED directly
    if (news.status === "PUBLISHED") {
      return { status: "ERR", message: "Không thể xóa bài viết đã PUBLISHED. Vui lòng chuyển về DRAFT trước" };
    }

    // Delete thumbnail from Cloudinary if exists
    if (news.thumbnailPublicId) {
      try {
        await cloudinary.uploader.destroy(news.thumbnailPublicId);
      } catch (err) {
        console.warn(`Không thể xóa ảnh ${news.thumbnailPublicId} trên Cloudinary:`, err.message);
      }
    }

    // Delete all related views
    await NewsViewsModel.deleteMany({ news_id: id });

    await NewsModel.findByIdAndDelete(id);
    return { status: "OK", message: "Xóa bài viết thành công" };
  } catch (error) {
    return { status: "ERR", message: error.message };
  }
};

// Get Featured News
const getFeaturedNews = async () => {
  try {
    const featured = await NewsModel.find({
      status: "PUBLISHED",
      is_featured: true,
    })
      .populate("author_id", "user_name email avatar")
      .sort({ published_at: -1 })
      .limit(5);

    return {
      status: "OK",
      message: "Lấy danh sách bài viết nổi bật thành công",
      data: featured,
    };
  } catch (error) {
    return { status: "ERR", message: error.message };
  }
};

module.exports = {
  createNews,
  getNews,
  getNewsById,
  updateNews,
  deleteNews,
  getFeaturedNews,
};
