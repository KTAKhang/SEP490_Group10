const mongoose = require("mongoose");
const ReviewModel = require("../models/ReviewModel");
const OrderModel = require("../models/OrderModel");
const OrderDetailModel = require("../models/OrderDetailModel");
const OrderStatusModel = require("../models/OrderStatusModel");
const ProductModel = require("../models/ProductModel");

const normalizeStatus = (value) => (value ? value.toString().trim().toUpperCase() : "");
const EDIT_WINDOW_DAYS = 3;

const coerceArray = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      return [];
    }
  }
  return [];
};

const validateImages = (images, imagePublicIds) => {
  const imageArray = coerceArray(images);
  const imagePublicIdArray = coerceArray(imagePublicIds);

  if (imageArray.length > 3) {
    return { status: "ERR", message: "Review images must not exceed 3" };
  }
  if (imagePublicIdArray.length > 3) {
    return { status: "ERR", message: "imagePublicIds must not exceed 3" };
  }
  if (imagePublicIdArray.length > 0 && imageArray.length !== imagePublicIdArray.length) {
    return { status: "ERR", message: "The number of images and imagePublicIds must match" };
  }

  return { status: "OK", imageArray, imagePublicIdArray };
};

const updateProductReviewStats = async (productId) => {
  const productObjectId = new mongoose.Types.ObjectId(productId);
  const stats = await ReviewModel.aggregate([
    {
      $match: {
        product_id: productObjectId,
        status: "VISIBLE",
      },
    },
    {
      $group: {
        _id: "$product_id",
        avgRating: { $avg: "$rating" },
        reviewCount: { $sum: 1 },
      },
    },
  ]);

  const avgRating = stats[0]?.avgRating ? Math.round(stats[0].avgRating * 100) / 100 : 0;
  const reviewCount = stats[0]?.reviewCount || 0;

  await ProductModel.updateOne(
    { _id: productObjectId },
    { $set: { avgRating, reviewCount } }
  );
};

const createReview = async (userId, payload = {}) => {
  try {
    const { orderId, productId, rating, comment, images, imagePublicIds } = payload;

    if (!mongoose.isValidObjectId(orderId)) {
      return { status: "ERR", message: "Invalid orderId" };
    }
    if (!mongoose.isValidObjectId(productId)) {
      return { status: "ERR", message: "Invalid productId" };
    }

    const ratingValue = Number(rating);
    if (!Number.isInteger(ratingValue) || ratingValue < 1 || ratingValue > 5) {
      return { status: "ERR", message: "Rating must be an integer between 1 and 5" };
    }

    const completedStatus = await OrderStatusModel.findOne({
      name: { $regex: /^COMPLETED$/i },
    });
    if (!completedStatus) {
      return { status: "ERR", message: "Missing COMPLETED status" };
    }

    const order = await OrderModel.findOne({
      _id: new mongoose.Types.ObjectId(orderId),
      user_id: new mongoose.Types.ObjectId(userId),
      order_status_id: completedStatus._id,
    });
    if (!order) {
      return { status: "ERR", message: "Only COMPLETED orders can be reviewed" };
    }

    const detail = await OrderDetailModel.findOne({
      order_id: order._id,
      product_id: new mongoose.Types.ObjectId(productId),
    });
    if (!detail) {
      return { status: "ERR", message: "The product does not belong to this order" };
    }

    const existed = await ReviewModel.findOne({
      order_id: order._id,
      product_id: new mongoose.Types.ObjectId(productId),
      user_id: new mongoose.Types.ObjectId(userId),
    });
    if (existed) {
      return { status: "ERR", message: "You have already reviewed this product for this order" };
    }

    const imageCheck = validateImages(images, imagePublicIds);
    if (imageCheck.status === "ERR") return imageCheck;

    const review = await ReviewModel.create({
      order_id: order._id,
      product_id: new mongoose.Types.ObjectId(productId),
      user_id: new mongoose.Types.ObjectId(userId),
      rating: ratingValue,
      comment: comment ? comment.toString().trim() : "",
      images: imageCheck.imageArray,
      imagePublicIds: imageCheck.imagePublicIdArray,
    });

    await updateProductReviewStats(productId);

    return {
      status: "OK",
      message: "Product review submitted successfully",
      data: review,
    };
  } catch (error) {
    return { status: "ERR", message: error.message };
  }
};

const updateReview = async (reviewId, userId, payload = {}) => {
  try {
    if (!mongoose.isValidObjectId(reviewId)) {
      return { status: "ERR", message: "Invalid reviewId" };
    }

    const review = await ReviewModel.findOne({
      _id: new mongoose.Types.ObjectId(reviewId),
      user_id: new mongoose.Types.ObjectId(userId),
    });
    if (!review) {
      return { status: "ERR", message: "Review does not exist" };
    }

    if ((review.editedCount || 0) >= 1) {
      return { status: "ERR", message: "A review can only be edited once" };
    }

    const createdAt = new Date(review.createdAt);
    const now = new Date();
    const diffDays = Math.floor((now - createdAt) / (1000 * 60 * 60 * 24));
    if (diffDays > EDIT_WINDOW_DAYS) {
      return { status: "ERR", message: "Reviews can only be edited within the first 3 days" };
    }

    if (payload.rating !== undefined) {
      const ratingValue = Number(payload.rating);
      if (!Number.isInteger(ratingValue) || ratingValue < 1 || ratingValue > 5) {
        return { status: "ERR", message: "Rating must be an integer between 1 and 5" };
      }
      review.rating = ratingValue;
    }

    if (payload.comment !== undefined) {
      review.comment = payload.comment ? payload.comment.toString().trim() : "";
    }

    if (payload.images !== undefined || payload.imagePublicIds !== undefined) {
      const imageCheck = validateImages(payload.images ?? review.images, payload.imagePublicIds ?? review.imagePublicIds);
      if (imageCheck.status === "ERR") return imageCheck;
      review.images = imageCheck.imageArray;
      review.imagePublicIds = imageCheck.imagePublicIdArray;
    }

    review.editedCount = (review.editedCount || 0) + 1;

    await review.save();
    await updateProductReviewStats(review.product_id);

    return {
      status: "OK",
      message: "Review updated successfully",
      data: review,
    };
  } catch (error) {
    return { status: "ERR", message: error.message };
  }
};

const deleteReview = async (reviewId, userId) => {
  try {
    if (!mongoose.isValidObjectId(reviewId)) {
      return { status: "ERR", message: "Invalid reviewId" };
    }

    const review = await ReviewModel.findOneAndDelete({
      _id: new mongoose.Types.ObjectId(reviewId),
      user_id: new mongoose.Types.ObjectId(userId),
    });
    if (!review) {
      return { status: "ERR", message: "Review does not exist" };
    }

    await updateProductReviewStats(review.product_id);

    return {
      status: "OK",
      message: "Review deleted successfully",
    };
  } catch (error) {
    return { status: "ERR", message: error.message };
  }
};

const getProductReviews = async (productId, filters = {}) => {
  try {
    if (!mongoose.isValidObjectId(productId)) {
      return { status: "ERR", message: "Invalid productId" };
    }

    const {
      page = 1,
      limit = 5,
      search = "",
      sortBy = "createdAt",
      sortOrder = "desc",
    } = filters;

    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit) || 10));
    const skip = (pageNum - 1) * limitNum;

    const allowedSortFields = ["createdAt", "rating"];
    const sortField = allowedSortFields.includes(sortBy) ? sortBy : "createdAt";
    const sortDirection = sortOrder === "asc" ? 1 : -1;
    const sortObj = { [sortField]: sortDirection };

    const query = {
      product_id: new mongoose.Types.ObjectId(productId),
      status: "VISIBLE",
    };
    if (search) {
      const escaped = search.toString().trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      query.comment = { $regex: escaped, $options: "i" };
    }

    const [data, total] = await Promise.all([
      ReviewModel.find(query)
        .populate("user_id", "user_name")
        .sort(sortObj)
        .skip(skip)
        .limit(limitNum)
        .lean(),
      ReviewModel.countDocuments(query),
    ]);

    return {
      status: "OK",
      message: "Fetched review list successfully",
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

const getProductReviewStats = async (productId) => {
  try {
    if (!mongoose.isValidObjectId(productId)) {
      return { status: "ERR", message: "Invalid productId" };
    }

    const productObjectId = new mongoose.Types.ObjectId(productId);
    const stats = await ReviewModel.aggregate([
      { $match: { product_id: productObjectId, status: "VISIBLE" } },
      {
        $group: {
          _id: "$product_id",
          avgRating: { $avg: "$rating" },
          reviewCount: { $sum: 1 },
          rating1: { $sum: { $cond: [{ $eq: ["$rating", 1] }, 1, 0] } },
          rating2: { $sum: { $cond: [{ $eq: ["$rating", 2] }, 1, 0] } },
          rating3: { $sum: { $cond: [{ $eq: ["$rating", 3] }, 1, 0] } },
          rating4: { $sum: { $cond: [{ $eq: ["$rating", 4] }, 1, 0] } },
          rating5: { $sum: { $cond: [{ $eq: ["$rating", 5] }, 1, 0] } },
        },
      },
    ]);

    const data = stats[0] || {
      avgRating: 0,
      reviewCount: 0,
      rating1: 0,
      rating2: 0,
      rating3: 0,
      rating4: 0,
      rating5: 0,
    };

    data.avgRating = data.avgRating ? Math.round(data.avgRating * 100) / 100 : 0;

    return {
      status: "OK",
      message: "Fetched product review statistics successfully",
      data,
    };
  } catch (error) {
    return { status: "ERR", message: error.message };
  }
};

const getReviewsForAdmin = async (filters = {}) => {
  try {
    const {
      page = 1,
      limit = 5,
      search = "",
      productId,
      userId,
      rating,
      status,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = filters;

    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit) || 20));
    const skip = (pageNum - 1) * limitNum;

    const query = {};
    if (search) {
      const escaped = search.toString().trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      query.comment = { $regex: escaped, $options: "i" };
    }
    if (productId && mongoose.isValidObjectId(productId)) {
      query.product_id = new mongoose.Types.ObjectId(productId);
    }
    if (userId && mongoose.isValidObjectId(userId)) {
      query.user_id = new mongoose.Types.ObjectId(userId);
    }
    if (status) {
      const normalized = normalizeStatus(status);
      if (["VISIBLE", "HIDDEN"].includes(normalized)) {
        query.status = normalized;
      }
    }

    if (rating !== undefined) {
      const ratingValue = Number(rating);
      if (!Number.isInteger(ratingValue) || ratingValue < 1 || ratingValue > 5) {
        return { status: "ERR", message: "Rating must be an integer between 1 and 5" };
      }
      query.rating = ratingValue;
    }

    const allowedSortFields = ["createdAt", "rating"];
    const sortField = allowedSortFields.includes(sortBy) ? sortBy : "createdAt";
    const sortDirection = sortOrder === "asc" ? 1 : -1;
    const sortObj = { [sortField]: sortDirection };

    const [data, total] = await Promise.all([
      ReviewModel.find(query)
        .populate("user_id", "user_name email")
        .populate("product_id", "name")
        .sort(sortObj)
        .skip(skip)
        .limit(limitNum)
        .lean(),
      ReviewModel.countDocuments(query),
    ]);

    return {
      status: "OK",
      message: "Fetched reviews successfully",
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

const updateReviewVisibility = async (reviewId, status) => {
  try {
    if (!mongoose.isValidObjectId(reviewId)) {
      return { status: "ERR", message: "Invalid reviewId" };
    }

    const normalized = normalizeStatus(status);
    if (!["VISIBLE", "HIDDEN"].includes(normalized)) {
      return { status: "ERR", message: "Invalid review status" };
    }

    const review = await ReviewModel.findById(reviewId);
    if (!review) {
      return { status: "ERR", message: "Review does not exist" };
    }

    review.status = normalized;
    await review.save();
    await updateProductReviewStats(review.product_id);

    return {
      status: "OK",
      message: "Review status updated successfully",
      data: review,
    };
  } catch (error) {
    return { status: "ERR", message: error.message };
  }
};

module.exports = {
  createReview,
  updateReview,
  deleteReview,
  getProductReviews,
  getProductReviewStats,
  getReviewsForAdmin,
  updateReviewVisibility,
};
