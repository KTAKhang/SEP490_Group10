const CategoryModel = require("../models/CategoryModel");


// Lấy danh sách categories public (có search, sort, filter, pagination)
const getCategories = async ({ page = 1, limit = 6, search = "", sortBy = "createdAt", sortOrder = "desc" } = {}) => {
  try {
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit) || 6));
    const skip = (pageNum - 1) * limitNum;


    const query = {
      status: true, // Chỉ lấy categories đang hoạt động
    };


    // Search theo tên
    if (search) {
      query.name = { $regex: search, $options: "i" };
    }


    // Sort options
    const allowedSortFields = ["name", "createdAt", "updatedAt"];
    const sortField = allowedSortFields.includes(sortBy) ? sortBy : "createdAt";
    const sortDirection = sortOrder === "asc" ? 1 : -1;
    const sortObj = { [sortField]: sortDirection };


    const [data, total] = await Promise.all([
      CategoryModel.find(query).sort(sortObj).skip(skip).limit(limitNum).lean(),
      CategoryModel.countDocuments(query),
    ]);


    return {
      status: "OK",
      message: "Fetched category list successfully",
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


module.exports = {
  getCategories,
};
