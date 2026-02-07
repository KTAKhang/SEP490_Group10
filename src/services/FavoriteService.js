const mongoose = require("mongoose");
const FavoriteModel = require("../models/FavoriteModel");
const ProductModel = require("../models/ProductModel");
const CategoryModel = require("../models/CategoryModel");


/**
 * Thêm sản phẩm vào danh sách yêu thích
 * @param {String} userId - User ID
 * @param {String} productId - Product ID
 * @returns {Promise<Object>} { status, message, data }
 */
const addFavorite = async (userId, productId) => {
  try {
    if (!mongoose.isValidObjectId(productId)) {
      return { status: "ERR", message: "Invalid productId" };
    }


    // Kiểm tra sản phẩm có tồn tại và đang hoạt động không
    const product = await ProductModel.findById(productId)
      .populate({
        path: "category",
        select: "name status",
        match: { status: true },
      })
      .lean();


    if (!product) {
      return { status: "ERR", message: "Product does not exist" };
    }


    if (product.status === false) {
      return { status: "ERR", message: "Product does not exist" };
    }


    if (!product.category || product.category.status === false) {
      return { status: "ERR", message: "Product does not exist" };
    }


    // Kiểm tra đã yêu thích chưa
    const existingFavorite = await FavoriteModel.findOne({
      user_id: new mongoose.Types.ObjectId(userId),
      product_id: new mongoose.Types.ObjectId(productId),
    });


    if (existingFavorite) {
      return { status: "ERR", message: "Product is already in favorites" };
    }


    // Tạo favorite mới
    const favorite = await FavoriteModel.create({
      user_id: new mongoose.Types.ObjectId(userId),
      product_id: new mongoose.Types.ObjectId(productId),
    });


    return {
      status: "OK",
      message: "Product added to favorites",
      data: favorite,
    };
  } catch (error) {
    // Handle duplicate key error (unique constraint)
    if (error.code === 11000) {
      return { status: "ERR", message: "Product is already in favorites" };
    }
    return { status: "ERR", message: error.message };
  }
};


/**
 * Xóa sản phẩm khỏi danh sách yêu thích
 * @param {String} userId - User ID
 * @param {String} productId - Product ID
 * @returns {Promise<Object>} { status, message }
 */
const removeFavorite = async (userId, productId) => {
  try {
    if (!mongoose.isValidObjectId(productId)) {
      return { status: "ERR", message: "Invalid productId" };
    }


    const favorite = await FavoriteModel.findOneAndDelete({
      user_id: new mongoose.Types.ObjectId(userId),
      product_id: new mongoose.Types.ObjectId(productId),
    });


    if (!favorite) {
      return { status: "ERR", message: "Product is not in favorites" };
    }


    return {
      status: "OK",
      message: "Product removed from favorites",
    };
  } catch (error) {
    return { status: "ERR", message: error.message };
  }
};


/**
 * Kiểm tra sản phẩm có trong danh sách yêu thích không
 * @param {String} userId - User ID
 * @param {String} productId - Product ID
 * @returns {Promise<Object>} { status, message, data: { isFavorite } }
 */
const checkFavorite = async (userId, productId) => {
  try {
    if (!mongoose.isValidObjectId(productId)) {
      return { status: "ERR", message: "Invalid productId" };
    }


    const favorite = await FavoriteModel.findOne({
      user_id: new mongoose.Types.ObjectId(userId),
      product_id: new mongoose.Types.ObjectId(productId),
    });


    return {
      status: "OK",
      message: "Check completed successfully",
      data: {
        isFavorite: !!favorite,
      },
    };
  } catch (error) {
    return { status: "ERR", message: error.message };
  }
};


/**
 * Lấy danh sách sản phẩm yêu thích (có search, sort, filter, pagination)
 * @param {String} userId - User ID
 * @param {Object} filters - { page, limit, search, category, sortBy, sortOrder }
 * @returns {Promise<Object>} { status, message, data, pagination }
 */
const getFavorites = async (userId, filters = {}) => {
  try {
    const {
      page = 1,
      limit = 12,
      search = "",
      category,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = filters;


    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit) || 12));
    const skip = (pageNum - 1) * limitNum;


    // Base query: Tìm tất cả favorites của user này
    const favoriteQuery = {
      user_id: new mongoose.Types.ObjectId(userId),
    };


    // Lấy danh sách product IDs từ favorites
    const favorites = await FavoriteModel.find(favoriteQuery)
      .select("product_id createdAt")
      .lean();


    if (favorites.length === 0) {
      return {
        status: "OK",
        message: "Fetched favorite products successfully",
        data: [],
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: 0,
          totalPages: 0,
        },
      };
    }


    const productIds = favorites.map((fav) => fav.product_id);


    // Build product query
    const productQuery = {
      _id: { $in: productIds },
      status: true, // Chỉ lấy sản phẩm đang hoạt động
    };


    // Search theo tên
    if (search) {
      productQuery.name = { $regex: search, $options: "i" };
    }


    // Filter theo category
    if (category) {
      if (!mongoose.Types.ObjectId.isValid(category)) {
        return {
          status: "OK",
          message: "Fetched favorite products successfully",
          data: [],
          pagination: {
            page: pageNum,
            limit: limitNum,
            total: 0,
            totalPages: 0,
          },
        };
      }


      const categoryDoc = await CategoryModel.findById(category);
      if (categoryDoc && categoryDoc.status === true) {
        productQuery.category = new mongoose.Types.ObjectId(category);
      } else {
        return {
          status: "OK",
          message: "Fetched favorite products successfully",
          data: [],
          pagination: {
            page: pageNum,
            limit: limitNum,
            total: 0,
            totalPages: 0,
          },
        };
      }
    }


    // Sort options
    const allowedSortFields = ["name", "price", "createdAt", "updatedAt"];
    let sortField = allowedSortFields.includes(sortBy) ? sortBy : "createdAt";
    let sortDirection = sortOrder === "asc" ? 1 : -1;


    // Xử lý sort đặc biệt
    let sortObj = {};
    if (sortBy === "name") {
      sortObj = { nameLower: sortDirection };
    } else {
      sortObj = { [sortField]: sortDirection };
    }


    // Sử dụng aggregation để lọc category và giữ nguyên thứ tự yêu thích
    const pipeline = [
      {
        $match: productQuery,
      },
      {
        $lookup: {
          from: "categories",
          localField: "category",
          foreignField: "_id",
          as: "categoryInfo",
        },
      },
      {
        $unwind: {
          path: "$categoryInfo",
          preserveNullAndEmptyArrays: false,
        },
      },
      {
        $match: {
          "categoryInfo.status": true,
        },
      },
      // Thêm field để biết thời gian thêm vào yêu thích
      {
        $lookup: {
          from: "favorites",
          let: { productId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$product_id", "$$productId"] },
                    { $eq: ["$user_id", new mongoose.Types.ObjectId(userId)] },
                  ],
                },
              },
            },
          ],
          as: "favoriteInfo",
        },
      },
      {
        $unwind: "$favoriteInfo",
      },
      {
        $addFields: {
          favoritedAt: "$favoriteInfo.createdAt",
        },
      },
    ];


    // Thêm field nameLower nếu sort theo name
    if (sortBy === "name") {
      pipeline.push({
        $addFields: {
          nameLower: { $toLower: "$name" },
        },
      });
    }


    // Sort: Ưu tiên sort theo favoritedAt nếu sortBy = "createdAt", ngược lại sort theo field được chọn
    if (sortBy === "createdAt") {
      pipeline.push({
        $sort: { favoritedAt: sortDirection },
      });
    } else {
      pipeline.push({
        $sort: sortObj,
      });
    }


    // Facet để pagination
    pipeline.push({
      $facet: {
        data: [{ $skip: skip }, { $limit: limitNum }],
        total: [{ $count: "count" }],
      },
    });


    const result = await ProductModel.aggregate(pipeline);
    const data = result[0]?.data || [];
    const total = result[0]?.total[0]?.count || 0;


    // Format category info và chỉ lấy ảnh đầu tiên cho list view
    const formattedProducts = data.map((product) => {
      const formatted = {
        ...product,
        category: {
          _id: product.categoryInfo._id,
          name: product.categoryInfo.name,
          description: product.categoryInfo.description,
          image: product.categoryInfo.image,
        },
        favoritedAt: product.favoritedAt,
      };
      delete formatted.categoryInfo;
      delete formatted.favoriteInfo;


      // Chỉ lấy ảnh đầu tiên
      if (Array.isArray(product.images) && product.images.length > 0) {
        formatted.featuredImage = product.images[0];
      } else {
        formatted.featuredImage = null;
      }


      // Xóa field nameLower nếu có
      if (formatted.nameLower) {
        delete formatted.nameLower;
      }


      return formatted;
    });


    return {
      status: "OK",
      message: "Fetched favorite products successfully",
      data: formattedProducts,
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


module.exports = {
  addFavorite,
  removeFavorite,
  checkFavorite,
  getFavorites,
};
