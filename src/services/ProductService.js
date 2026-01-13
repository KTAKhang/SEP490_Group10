const mongoose = require("mongoose");
const ProductModel = require("../models/ProductModel");
const CategoryModel = require("../models/CategoryModel");
const cloudinary = require("../config/cloudinaryConfig");

const createProduct = async (payload = {}) => {
  try {
    const { name, short_desc, price, plannedQuantity, category, images, imagePublicIds, brand, detail_desc, status } =
      payload;

    if (!name || !name.toString().trim()) return { status: "ERR", message: "Tên sản phẩm là bắt buộc" };
    if (price === undefined || price === null || Number.isNaN(Number(price)) || Number(price) < 0) {
      return { status: "ERR", message: "Giá sản phẩm không hợp lệ" };
    }
    if (plannedQuantity === undefined || plannedQuantity === null || Number.isNaN(Number(plannedQuantity)) || Number(plannedQuantity) < 0) {
      return { status: "ERR", message: "plannedQuantity không hợp lệ" };
    }
    if (!category) return { status: "ERR", message: "Category là bắt buộc" };

    const categoryDoc = await CategoryModel.findById(category);
    if (!categoryDoc) return { status: "ERR", message: "Category không tồn tại" };
    
    // Kiểm tra category không được ẩn
    if (categoryDoc.status === false) {
      return { status: "ERR", message: "Không thể chọn category đã bị ẩn" };
    }

    const product = new ProductModel({
      name: name.toString().trim(),
      short_desc: (short_desc ?? "").toString(),
      price: Number(price),
      plannedQuantity: Number(plannedQuantity),
      category: new mongoose.Types.ObjectId(category),
      images: Array.isArray(images) ? images : [],
      imagePublicIds: Array.isArray(imagePublicIds) ? imagePublicIds : [],
      brand: (brand ?? "").toString(),
      detail_desc: (detail_desc ?? "").toString(),
      status: status ?? true,
    });

    await product.save();

    const populated = await ProductModel.findById(product._id).populate("category", "name");

    return { status: "OK", message: "Tạo sản phẩm thành công", data: populated };
  } catch (error) {
    return { status: "ERR", message: error.message };
  }
};

const getProducts = async (filters = {}) => {
  try {
    const {
      page = 1,
      limit = 20,
      search = "",
      category,
      status,
      receivingStatus,
      stockStatus,
    } = filters;

    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit) || 20));
    const skip = (pageNum - 1) * limitNum;

    const query = {};
    if (search) query.name = { $regex: search, $options: "i" };
    if (category) query.category = category;
    if (status !== undefined) query.status = status === "true" || status === true;
    if (receivingStatus) query.receivingStatus = receivingStatus;
    if (stockStatus) query.stockStatus = stockStatus;

    const [data, total] = await Promise.all([
      ProductModel.find(query).populate("category", "name").sort({ createdAt: -1 }).skip(skip).limit(limitNum),
      ProductModel.countDocuments(query),
    ]);

    return {
      status: "OK",
      message: "Lấy danh sách sản phẩm thành công",
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

const getProductById = async (id) => {
  try {
    const product = await ProductModel.findById(id).populate("category", "name");
    if (!product) return { status: "ERR", message: "Sản phẩm không tồn tại" };
    return { status: "OK", message: "Lấy sản phẩm thành công", data: product };
  } catch (error) {
    return { status: "ERR", message: error.message };
  }
};

const updateProductAdmin = async (id, payload = {}) => {
  try {
    const product = await ProductModel.findById(id);
    if (!product) return { status: "ERR", message: "Sản phẩm không tồn tại" };

    // Whitelist fields (Admin được sửa plannedQuantity, price, mô tả...)
    const allowed = [
      "name",
      "short_desc",
      "price",
      "plannedQuantity",
      "category",
      "images",
      "imagePublicIds",
      "brand",
      "detail_desc",
      "status",
    ];

    for (const key of Object.keys(payload)) {
      if (!allowed.includes(key)) delete payload[key];
    }

    if (payload.name !== undefined) {
      const newName = (payload.name ?? "").toString().trim();
      if (!newName) return { status: "ERR", message: "Tên sản phẩm là bắt buộc" };
      product.name = newName;
    }

    if (payload.short_desc !== undefined) product.short_desc = (payload.short_desc ?? "").toString();
    if (payload.price !== undefined) {
      const p = Number(payload.price);
      if (Number.isNaN(p) || p < 0) return { status: "ERR", message: "Giá sản phẩm không hợp lệ" };
      product.price = p;
    }

    if (payload.plannedQuantity !== undefined) {
      const planned = Number(payload.plannedQuantity);
      if (Number.isNaN(planned) || planned < 0) return { status: "ERR", message: "plannedQuantity không hợp lệ" };
      // Chặn giảm planned thấp hơn số đã nhập
      if ((product.receivedQuantity ?? 0) > planned) {
        return { status: "ERR", message: "Không thể đặt plannedQuantity nhỏ hơn receivedQuantity hiện tại" };
      }
      product.plannedQuantity = planned;
    }

    if (payload.category !== undefined) {
      const categoryDoc = await CategoryModel.findById(payload.category);
      if (!categoryDoc) return { status: "ERR", message: "Category không tồn tại" };
      
      // Kiểm tra category không được ẩn
      if (categoryDoc.status === false) {
        return { status: "ERR", message: "Không thể chọn category đã bị ẩn" };
      }
      
      product.category = new mongoose.Types.ObjectId(payload.category);
    }

    // Xử lý ảnh: xóa ảnh cũ không còn trong danh sách mới
    if (payload.images !== undefined || payload.imagePublicIds !== undefined) {
      const oldImagePublicIds = Array.isArray(product.imagePublicIds) ? product.imagePublicIds : [];
      const newImagePublicIds = Array.isArray(payload.imagePublicIds) ? payload.imagePublicIds : [];
      
      // Tìm ảnh cũ cần xóa (không còn trong danh sách mới)
      const imagesToDelete = oldImagePublicIds.filter(id => !newImagePublicIds.includes(id));
      
      // Xóa ảnh cũ trên Cloudinary
      if (imagesToDelete.length > 0) {
        try {
          await Promise.all(imagesToDelete.map(id => cloudinary.uploader.destroy(id).catch(err => {
            console.warn(`Không thể xóa ảnh ${id} trên Cloudinary:`, err.message);
          })));
        } catch (err) {
          console.warn("Lỗi khi xóa ảnh cũ:", err.message);
        }
      }
      
      product.images = Array.isArray(payload.images) ? payload.images : [];
      product.imagePublicIds = newImagePublicIds;
    }
    
    if (payload.brand !== undefined) product.brand = (payload.brand ?? "").toString();
    if (payload.detail_desc !== undefined) product.detail_desc = (payload.detail_desc ?? "").toString();
    if (payload.status !== undefined) product.status = payload.status;

    await product.save();

    const populated = await ProductModel.findById(product._id).populate("category", "name");
    return { status: "OK", message: "Cập nhật sản phẩm thành công", data: populated };
  } catch (error) {
    return { status: "ERR", message: error.message };
  }
};

const updateProductExpiryDate = async (id, payload = {}) => {
  try {
    const product = await ProductModel.findById(id);
    if (!product) return { status: "ERR", message: "Sản phẩm không tồn tại" };

    // Kiểm tra sản phẩm đã có warehouseEntryDate chưa
    if (!product.warehouseEntryDate) {
      return { 
        status: "ERR", 
        message: "Sản phẩm chưa được nhập kho, không thể cập nhật hạn sử dụng" 
      };
    }

    const { expiryDate } = payload;

    if (!expiryDate) {
      return { status: "ERR", message: "expiryDate là bắt buộc" };
    }

    // Validate expiryDate
    let newExpiryDate = null;
    try {
      newExpiryDate = new Date(expiryDate);
      if (isNaN(newExpiryDate.getTime())) {
        return { status: "ERR", message: "expiryDate không hợp lệ" };
      }
      
      // Reset về 00:00:00 để so sánh ngày
      newExpiryDate.setHours(0, 0, 0, 0);
      
      // Validate: expiryDate >= ngày hiện tại + 1 ngày
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      const minDate = new Date(now);
      minDate.setDate(minDate.getDate() + 1);
      
      if (newExpiryDate < minDate) {
        return { 
          status: "ERR", 
          message: `Hạn sử dụng phải tối thiểu từ ngày ${minDate.toISOString().split('T')[0]} (ngày mai)` 
        };
      }
    } catch (err) {
      return { status: "ERR", message: "expiryDate không hợp lệ" };
    }

    // Tính shelfLifeDays từ warehouseEntryDate và expiryDate
    const warehouseEntryDate = new Date(product.warehouseEntryDate);
    warehouseEntryDate.setHours(0, 0, 0, 0);
    
    const diffTime = newExpiryDate.getTime() - warehouseEntryDate.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays <= 0) {
      return { 
        status: "ERR", 
        message: "Hạn sử dụng phải sau ngày nhập kho" 
      };
    }

    // Cập nhật expiryDate và shelfLifeDays
    product.expiryDate = newExpiryDate;
    product.shelfLifeDays = diffDays;

    await product.save();

    const populated = await ProductModel.findById(product._id).populate("category", "name");
    return { 
      status: "OK", 
      message: "Cập nhật hạn sử dụng thành công", 
      data: populated 
    };
  } catch (error) {
    return { status: "ERR", message: error.message };
  }
};

const deleteProduct = async (id) => {
  try {
    const product = await ProductModel.findById(id);
    if (!product) return { status: "ERR", message: "Sản phẩm không tồn tại" };

    // Xóa tất cả ảnh trên Cloudinary nếu có
    if (Array.isArray(product.imagePublicIds) && product.imagePublicIds.length > 0) {
      try {
        await Promise.all(product.imagePublicIds.map(publicId => 
          cloudinary.uploader.destroy(publicId).catch(err => {
            console.warn(`Không thể xóa ảnh ${publicId} trên Cloudinary:`, err.message);
          })
        ));
      } catch (err) {
        console.warn("Lỗi khi xóa ảnh trên Cloudinary:", err.message);
      }
    }

    await ProductModel.findByIdAndDelete(id);
    return { status: "OK", message: "Xóa sản phẩm thành công" };
  } catch (error) {
    return { status: "ERR", message: error.message };
  }
};

module.exports = {
  createProduct,
  getProducts,
  getProductById,
  updateProductAdmin,
  updateProductExpiryDate,
  deleteProduct,
};

