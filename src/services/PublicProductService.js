const mongoose = require("mongoose");
const ProductModel = require("../models/ProductModel");
const CategoryModel = require("../models/CategoryModel");
const InventoryTransactionModel = require("../models/InventoryTransactionModel");
const { getEffectivePrice } = require("../utils/productPrice");


// Lấy 6 sản phẩm nổi bật (bán được nhiều nhất)
const getFeaturedProducts = async () => {
  try {
    // Aggregate từ InventoryTransaction để tính tổng số lượng ISSUE (xuất kho/bán) của mỗi sản phẩm
    const topSoldProducts = await InventoryTransactionModel.aggregate([
      {
        $match: {
          type: "ISSUE", // Chỉ tính các transaction xuất kho (bán hàng)
        },
      },
      {
        $group: {
          _id: "$product",
          totalSold: { $sum: "$quantity" },
        },
      },
      {
        $sort: { totalSold: -1 }, // Sắp xếp theo số lượng bán giảm dần
      },
      {
        $limit: 6, // Lấy top 6
      },
    ]);


    // Lấy danh sách product IDs
    const productIds = topSoldProducts.map((item) => item._id);


    // Nếu không đủ 6 sản phẩm có transaction ISSUE, lấy thêm sản phẩm khác
    let products = [];
    if (productIds.length > 0) {
      products = await ProductModel.find({
        _id: { $in: productIds },
        status: true, // Chỉ lấy sản phẩm đang hoạt động
      })
        .populate({
          path: "category",
          select: "name status",
          match: { status: true }, // Chỉ lấy category đang hoạt động
        })
        .lean();


      // Lọc bỏ các sản phẩm có category null (category đã bị ẩn)
      products = products.filter((p) => p.category !== null);
    }


    // Nếu chưa đủ 6 sản phẩm, lấy thêm sản phẩm mới nhất
    if (products.length < 6) {
      const remaining = 6 - products.length;
      const existingIds = products.map((p) => p._id);
      const additionalProducts = await ProductModel.find({
        _id: { $nin: existingIds },
        status: true,
      })
        .populate({
          path: "category",
          select: "name status",
          match: { status: true },
        })
        .sort({ createdAt: -1 })
        .limit(remaining)
        .lean();


      // Lọc bỏ các sản phẩm có category null
      const validAdditional = additionalProducts.filter((p) => p.category !== null);
      products = [...products, ...validAdditional];
    }


    // Sắp xếp lại theo thứ tự ban đầu (top sold trước)
    const productMap = new Map(products.map((p) => [p._id.toString(), p]));
    const sortedProducts = productIds
      .map((id) => productMap.get(id.toString()))
      .filter((p) => p !== undefined);


    // Thêm các sản phẩm bổ sung vào cuối
    const additionalIds = products.map((p) => p._id.toString());
    const additional = products.filter((p) => !productIds.some((id) => id.toString() === p._id.toString()));
    sortedProducts.push(...additional);


    // Chỉ lấy 6 sản phẩm đầu tiên
    const finalProducts = sortedProducts.slice(0, 6);


    // Format: Chỉ lấy ảnh đầu tiên + giá hiệu lực (sắp hết hạn giảm 50%)
    const formattedProducts = finalProducts.map((product) => {
      const { effectivePrice, isNearExpiry, originalPrice } = getEffectivePrice(product);
      const formatted = { ...product, price: effectivePrice, effectivePrice, isNearExpiry, originalPrice };
      if (Array.isArray(product.images) && product.images.length > 0) {
        formatted.featuredImage = product.images[0];
      } else {
        formatted.featuredImage = null;
      }
      return formatted;
    });


    return {
      status: "OK",
      message: "Fetched featured products successfully",
      data: formattedProducts,
    };
  } catch (error) {
    return { status: "ERR", message: error.message };
  }
};


// Lấy danh sách sản phẩm public (có filter, sort, search, pagination)
const getProducts = async ({ page = 1, limit = 12, search = "", category, sortBy = "createdAt", sortOrder = "desc" } = {}) => {
  try {
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit) || 12));
    const skip = (pageNum - 1) * limitNum;


    const query = {
      status: true, // Chỉ lấy sản phẩm đang hoạt động
    };


    // Search theo tên
    if (search) {
      query.name = { $regex: search, $options: "i" };
    }


    // Filter theo category
    if (category) {
      // Validate ObjectId format
      if (!mongoose.Types.ObjectId.isValid(category)) {
        return {
          status: "OK",
          message: "Fetched product list successfully",
          data: [],
          pagination: {
            page: pageNum,
            limit: limitNum,
            total: 0,
            totalPages: 0,
          },
        };
      }


      // Kiểm tra category có tồn tại và đang hoạt động không
      const categoryDoc = await CategoryModel.findById(category);
      if (categoryDoc && categoryDoc.status === true) {
        query.category = new mongoose.Types.ObjectId(category);
      } else {
        // Nếu category không tồn tại hoặc đã bị ẩn, trả về danh sách rỗng
        return {
          status: "OK",
          message: "Fetched product list successfully",
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
      // Sort theo name case-insensitive
      sortObj = { nameLower: sortDirection };
    } else {
      sortObj = { [sortField]: sortDirection };
    }


    // Sử dụng aggregation để lọc category ngay từ đầu và đếm chính xác
    const pipeline = [
      {
        $match: query,
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
          preserveNullAndEmptyArrays: false, // Loại bỏ products không có category hoặc category không tồn tại
        },
      },
      {
        $match: {
          "categoryInfo.status": true, // Chỉ lấy products có category đang hoạt động
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


    pipeline.push(
      {
        $sort: sortObj,
      },
      {
        $facet: {
          data: [{ $skip: skip }, { $limit: limitNum }],
          total: [{ $count: "count" }],
        },
      }
    );


    const result = await ProductModel.aggregate(pipeline);
    const data = result[0]?.data || [];
    const total = result[0]?.total[0]?.count || 0;


    // Format category info, giá hiệu lực (sắp hết hạn giảm 50%), và chỉ lấy ảnh đầu tiên cho list view
    const formattedProducts = data.map((product) => {
      const { effectivePrice, isNearExpiry, originalPrice } = getEffectivePrice(product);
      const formatted = {
        ...product,
        price: effectivePrice,
        effectivePrice,
        isNearExpiry,
        originalPrice,
        category: {
          _id: product.categoryInfo._id,
          name: product.categoryInfo.name,
          description: product.categoryInfo.description,
          image: product.categoryInfo.image,
        },
      };
      delete formatted.categoryInfo;


      // Chỉ lấy ảnh đầu tiên
      if (Array.isArray(product.images) && product.images.length > 0) {
        formatted.featuredImage = product.images[0];
      } else {
        formatted.featuredImage = null;
      }


      // Xóa field nameLower nếu có (chỉ dùng để sort)
      if (formatted.nameLower) {
        delete formatted.nameLower;
      }


      return formatted;
    });


    return {
      status: "OK",
      message: "Fetched product list successfully",
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


// Lấy chi tiết sản phẩm (hiển thị tất cả ảnh)
const getProductById = async (id) => {
  try {
    // Validate ObjectId format
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return { status: "ERR", message: "Invalid product ID" };
    }


    const product = await ProductModel.findById(id)
      .populate({
        path: "category",
        select: "name description image status",
        match: { status: true },
      })
      .lean();


    if (!product) {
      return { status: "ERR", message: "Product does not exist" };
    }


    // Kiểm tra sản phẩm có đang hoạt động không
    if (product.status === false) {
      return { status: "ERR", message: "Product does not exist" };
    }


    // Kiểm tra category có đang hoạt động không
    if (!product.category || product.category.status === false) {
      return { status: "ERR", message: "Product does not exist" };
    }


    const { effectivePrice, isNearExpiry, originalPrice } = getEffectivePrice(product);
    const data = { ...product, price: effectivePrice, effectivePrice, isNearExpiry, originalPrice };


    return {
      status: "OK",
      message: "Fetched product details successfully",
      data,
    };
  } catch (error) {
    return { status: "ERR", message: error.message };
  }
};


module.exports = {
  getFeaturedProducts,
  getProducts,
  getProductById,
};
