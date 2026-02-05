const CategoryModel = require("../models/CategoryModel");
const ProductModel = require("../models/ProductModel");
const cloudinary = require("../config/cloudinaryConfig");

const createCategory = async ({ name, description, image, imagePublicId, status }) => {
  try {
    if (!name || !name.trim()) {
      return { status: "ERR", message: "Category name is required" };
    }

    const normalizedName = name.trim();
    const existing = await CategoryModel.findOne({
      name: { $regex: new RegExp(`^${normalizedName}$`, "i") },
    });
    if (existing) {
      return { status: "ERR", message: "Category name already exists" };
    }

    const category = new CategoryModel({
      name: normalizedName,
      description: (description ?? "").toString(),
      image: (image ?? "").toString(),
      imagePublicId: (imagePublicId ?? "").toString(),
      status: status ?? true,
    });

    await category.save();

    return { status: "OK", message: "Category created successfully", data: category };
  } catch (error) {
    return { status: "ERR", message: error.message };
  }
};

const getCategories = async ({ page = 1, limit = 20, search = "", status, sortBy = "createdAt", sortOrder = "desc" } = {}) => {
  try {
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit) || 20));
    const skip = (pageNum - 1) * limitNum;

    const query = {};
    if (search) query.name = { $regex: search, $options: "i" };
    if (status !== undefined) query.status = status === "true" || status === true;

    // Sort options
    const allowedSortFields = ["name", "createdAt", "updatedAt", "status"];
    const sortField = allowedSortFields.includes(sortBy) ? sortBy : "createdAt";
    const sortDirection = sortOrder === "asc" ? 1 : -1;
    const sortObj = { [sortField]: sortDirection };

    const [data, total] = await Promise.all([
      CategoryModel.find(query).sort(sortObj).skip(skip).limit(limitNum),
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

const getCategoryById = async (id) => {
  try {
    const category = await CategoryModel.findById(id);
    if (!category) return { status: "ERR", message: "Category does not exist" };
    return { status: "OK", message: "Fetched category successfully", data: category };
  } catch (error) {
    return { status: "ERR", message: error.message };
  }
};

const updateCategory = async (id, payload = {}) => {
  try {
    const category = await CategoryModel.findById(id);
    if (!category) return { status: "ERR", message: "Category does not exist" };

    // Lưu ảnh cũ để xóa sau nếu có ảnh mới
    const oldImagePublicId = category.imagePublicId;

    if (payload.name !== undefined) {
      const newName = (payload.name ?? "").toString().trim();
      if (!newName) return { status: "ERR", message: "Category name is required" };
      const existing = await CategoryModel.findOne({
        _id: { $ne: id },
        name: { $regex: new RegExp(`^${newName}$`, "i") },
      });
      if (existing) return { status: "ERR", message: "Category name already exists" };
      category.name = newName;
    }

    if (payload.description !== undefined) category.description = (payload.description ?? "").toString();
    
    // Xử lý ảnh: nếu có ảnh mới, xóa ảnh cũ trên Cloudinary
    if (payload.image !== undefined && payload.imagePublicId !== undefined) {
      // Nếu có ảnh cũ và ảnh mới khác ảnh cũ, xóa ảnh cũ
      if (oldImagePublicId && oldImagePublicId !== payload.imagePublicId) {
        try {
          await cloudinary.uploader.destroy(oldImagePublicId);
        } catch (err) {
          console.warn("Failed to delete old image from Cloudinary:", err.message);
        }
      }
      category.image = (payload.image ?? "").toString();
      category.imagePublicId = (payload.imagePublicId ?? "").toString();
    } else if (payload.image === "" && payload.imagePublicId === "") {
      // Nếu frontend gửi rỗng, xóa ảnh
      if (oldImagePublicId) {
        try {
          await cloudinary.uploader.destroy(oldImagePublicId);
        } catch (err) {
          console.warn("Failed to delete old image from Cloudinary:", err.message);
        }
      }
      category.image = "";
      category.imagePublicId = "";
    }
    
    if (payload.status !== undefined) category.status = payload.status;

    await category.save();

    return { status: "OK", message: "Category updated successfully", data: category };
  } catch (error) {
    return { status: "ERR", message: error.message };
  }
};

const deleteCategory = async (id) => {
  try {
    const category = await CategoryModel.findById(id);
    if (!category) return { status: "ERR", message: "Category does not exist" };

    // Kiểm tra xem có sản phẩm nào đang sử dụng category này không
    const productCount = await ProductModel.countDocuments({ category: id });
    if (productCount > 0) {
      return { 
        status: "ERR", 
        message: `Cannot delete this category because ${productCount} products are using it. Please remove or reassign those products first.` 
      };
    }

    // Xóa ảnh trên Cloudinary nếu có
    if (category.imagePublicId) {
      try {
        await cloudinary.uploader.destroy(category.imagePublicId);
      } catch (err) {
        console.warn("Failed to delete image from Cloudinary:", err.message);
      }
    }

    await CategoryModel.findByIdAndDelete(id);
    return { status: "OK", message: "Category deleted successfully" };
  } catch (error) {
    return { status: "ERR", message: error.message };
  }
};

const getCategoryStats = async () => {
  try {
    const [total, active, inactive] = await Promise.all([
      CategoryModel.countDocuments({}),
      CategoryModel.countDocuments({ status: true }),
      CategoryModel.countDocuments({ status: false }),
    ]);

    return {
      status: "OK",
      message: "Fetched category statistics successfully",
      data: {
        total,
        active,
        inactive,
      },
    };
  } catch (error) {
    return { status: "ERR", message: error.message };
  }
};

module.exports = {
  createCategory,
  getCategories,
  getCategoryById,
  updateCategory,
  deleteCategory,
  getCategoryStats,
};

