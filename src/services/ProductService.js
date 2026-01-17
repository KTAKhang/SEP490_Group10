const mongoose = require("mongoose");
const ProductModel = require("../models/ProductModel");
const CategoryModel = require("../models/CategoryModel");
const cloudinary = require("../config/cloudinaryConfig");
const { getTodayInVietnam, formatDateVN, calculateDaysBetween } = require("../utils/dateVN");

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

    // ✅ Validate ảnh: max 10 và length khớp (giống updateProductAdmin)
    const newImages = Array.isArray(images) ? images : [];
    const newImagePublicIds = Array.isArray(imagePublicIds) ? imagePublicIds : [];
    
    if (newImages.length > 10) {
      return { status: "ERR", message: "Số lượng ảnh không được vượt quá 10" };
    }
    if (newImagePublicIds.length > 10) {
      return { status: "ERR", message: "Số lượng imagePublicIds không được vượt quá 10" };
    }
    if (newImages.length !== newImagePublicIds.length) {
      return { status: "ERR", message: "Số lượng images và imagePublicIds phải bằng nhau" };
    }

    const product = new ProductModel({
      name: name.toString().trim(),
      short_desc: (short_desc ?? "").toString(),
      price: Number(price),
      plannedQuantity: Number(plannedQuantity),
      category: new mongoose.Types.ObjectId(category),
      images: newImages,
      imagePublicIds: newImagePublicIds,
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
      sortBy = "createdAt",
      sortOrder = "desc",
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

    // Sort options
    const allowedSortFields = ["name", "price", "createdAt", "updatedAt", "status", "onHandQuantity", "receivedQuantity"];
    const sortField = allowedSortFields.includes(sortBy) ? sortBy : "createdAt";
    const sortDirection = sortOrder === "asc" ? 1 : -1;
    const sortObj = { [sortField]: sortDirection };

    const [data, total] = await Promise.all([
      ProductModel.find(query).populate("category", "name").sort(sortObj).skip(skip).limit(limitNum),
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

    // Xử lý ảnh: validate trước, set vào product, save, rồi mới xóa Cloudinary
    let imagesToDelete = [];
    if (payload.images !== undefined || payload.imagePublicIds !== undefined) {
      const newImages = Array.isArray(payload.images) ? payload.images : [];
      const newImagePublicIds = Array.isArray(payload.imagePublicIds) ? payload.imagePublicIds : [];
      
      // ✅ Validate max 10 ảnh và length khớp trước khi set vào product
      if (newImages.length > 10) {
        return { status: "ERR", message: "Số lượng ảnh không được vượt quá 10" };
      }
      if (newImagePublicIds.length > 10) {
        return { status: "ERR", message: "Số lượng imagePublicIds không được vượt quá 10" };
      }
      if (newImages.length !== newImagePublicIds.length) {
        return { status: "ERR", message: "Số lượng images và imagePublicIds phải bằng nhau" };
      }
      
      const oldImagePublicIds = Array.isArray(product.imagePublicIds) ? product.imagePublicIds : [];
      
      // Tìm ảnh cũ cần xóa (không còn trong danh sách mới) - lưu lại để xóa sau
      imagesToDelete = oldImagePublicIds.filter(id => !newImagePublicIds.includes(id));
      
      // ✅ Set ảnh mới vào product (chưa xóa Cloudinary)
      product.images = newImages;
      product.imagePublicIds = newImagePublicIds;
    }
    
    if (payload.brand !== undefined) product.brand = (payload.brand ?? "").toString();
    if (payload.detail_desc !== undefined) product.detail_desc = (payload.detail_desc ?? "").toString();
    if (payload.status !== undefined) product.status = payload.status;

    // ✅ Save product trước
    await product.save();

    // ✅ Xóa ảnh cũ trên Cloudinary sau khi save thành công (không mất ảnh trong mọi trường hợp)
    if (imagesToDelete.length > 0) {
      try {
        await Promise.all(imagesToDelete.map(id => cloudinary.uploader.destroy(id).catch(err => {
          console.warn(`Không thể xóa ảnh ${id} trên Cloudinary:`, err.message);
        })));
      } catch (err) {
        console.warn("Lỗi khi xóa ảnh cũ:", err.message);
      }
    }

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

    // ✅ Kiểm tra sản phẩm đã có warehouseEntryDate chưa
    if (!product.warehouseEntryDate) {
      return { 
        status: "ERR", 
        message: "Sản phẩm chưa được nhập kho, không thể cập nhật hạn sử dụng" 
      };
    }

    // ✅ Logic: Khóa việc cập nhật hạn sử dụng sau khi đã set lần đầu (check cả Date và Str)
    const hasExpiry = !!(product.expiryDate || product.expiryDateStr);
    if (hasExpiry) {
      return { 
        status: "ERR", 
        message: "Hạn sử dụng đã được thiết lập và không thể thay đổi. Hạn sử dụng chỉ có thể được đặt một lần sau khi đã có ngày nhập kho (warehouseEntryDate)." 
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
      
      // ✅ Validate: expiryDate >= ngày hiện tại + 1 ngày (theo timezone Asia/Ho_Chi_Minh)
      const today = getTodayInVietnam();
      const minDate = new Date(today);
      minDate.setDate(minDate.getDate() + 1);
      
      if (newExpiryDate < minDate) {
        // ✅ Format date theo timezone VN thay vì toISOString() (UTC)
        const minDateStr = formatDateVN(minDate);
        return { 
          status: "ERR", 
          message: `Hạn sử dụng phải tối thiểu từ ngày ${minDateStr} (ngày mai theo timezone Asia/Ho_Chi_Minh)` 
        };
      }
    } catch (err) {
      return { status: "ERR", message: "expiryDate không hợp lệ" };
    }

    // ✅ Công thức: shelfLifeDays = (expiryDate - warehouseEntryDate) theo số ngày (không tính giờ)
    const warehouseEntryDate = new Date(product.warehouseEntryDate);
    warehouseEntryDate.setHours(0, 0, 0, 0);
    
    const diffDays = calculateDaysBetween(warehouseEntryDate, newExpiryDate);
    
    if (diffDays <= 0) {
      return { 
        status: "ERR", 
        message: "Hạn sử dụng phải sau ngày nhập kho" 
      };
    }

    // ✅ Cập nhật expiryDate, expiryDateStr và shelfLifeDays
    product.expiryDate = newExpiryDate;
    product.expiryDateStr = formatDateVN(newExpiryDate);
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

const getProductStats = async () => {
  try {
    // ✅ Cải thiện logic "sắp hết" với ngưỡng thông minh
    // Rule: lowStockThreshold = max(10, plannedQuantity * 0.1)
    // "Sắp hết" nếu onHandQuantity <= lowStockThreshold
    const baseThreshold = 10; // Ngưỡng cơ bản
    const percentageThreshold = 0.1; // 10%

    const [
      total,
      inStock,
      outOfStock,
      lowStock,
    ] = await Promise.all([
      // Tổng sản phẩm
      ProductModel.countDocuments({}),
      // Còn hàng (IN_STOCK)
      ProductModel.countDocuments({ stockStatus: "IN_STOCK" }),
      // Hết hàng (OUT_OF_STOCK)
      ProductModel.countDocuments({ stockStatus: "OUT_OF_STOCK" }),
      // ✅ Sắp hết: IN_STOCK và onHandQuantity <= max(10, plannedQuantity * 0.1)
      ProductModel.countDocuments({
        stockStatus: "IN_STOCK",
        $expr: {
          $and: [
            { $gt: ["$onHandQuantity", 0] }, // Đảm bảo không tính sản phẩm hết hàng
            {
              $lte: [
                "$onHandQuantity",
                {
                  $max: [
                    baseThreshold, // Ngưỡng cơ bản: 10
                    { $multiply: ["$plannedQuantity", percentageThreshold] }, // 10% plannedQuantity
                  ],
                },
              ],
            },
          ],
        },
      }),
    ]);

    return {
      status: "OK",
      message: "Lấy thống kê sản phẩm thành công",
      data: {
        total,
        inStock,
        outOfStock,
        lowStock,
      },
    };
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
  getProductStats,
};

