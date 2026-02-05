const mongoose = require("mongoose");
const ProductModel = require("../models/ProductModel");
const CategoryModel = require("../models/CategoryModel");
const SupplierModel = require("../models/SupplierModel");
const cloudinary = require("../config/cloudinaryConfig");
const { getTodayInVietnam, formatDateVN, calculateDaysBetween } = require("../utils/dateVN");
const { getEffectivePrice } = require("../utils/productPrice");
const createProduct = async (payload = {}) => {
  try {
    const { name, short_desc, price, plannedQuantity, category, images, imagePublicIds, brand, detail_desc, status } =
      payload;
    if (!name || !name.toString().trim()) return { status: "ERR", message: "Product name is required" };
    if (price === undefined || price === null || Number.isNaN(Number(price)) || Number(price) < 0) {
      return { status: "ERR", message: "Invalid product price" };
    }
    if (plannedQuantity === undefined || plannedQuantity === null || Number.isNaN(Number(plannedQuantity)) || Number(plannedQuantity) < 0) {
      return { status: "ERR", message: "Invalid plannedQuantity value" };
    }
    if (!category) return { status: "ERR", message: "Category is required" };
    // ✅ Validate brand: bắt buộc phải có (không cho phép null/empty)
    if (!brand || !brand.toString().trim()) {
      return { status: "ERR", message: "Brand is required" };
    }


    const categoryDoc = await CategoryModel.findById(category);
    if (!categoryDoc) return { status: "ERR", message: "Category does not exist" };
    // Kiểm tra category không được ẩn
    if (categoryDoc.status === false) {
      return { status: "ERR", message: "Cannot select a hidden category" };
    }


    // ✅ Validate brand phải là một supplier name tồn tại và đang hoạt động
    const normalizedBrand = brand.toString().trim();
    const supplierDoc = await SupplierModel.findOne({
      name: normalizedBrand,
      status: true,
      cooperationStatus: "ACTIVE",
    });
   
    if (!supplierDoc) {
      return {
        status: "ERR",
        message: `Brand "${normalizedBrand}" does not exist or is inactive. Please choose a valid supplier.`,
      };
    }


    // ✅ Lấy giá nhập từ Supplier.purchaseCosts nếu có (hoặc từ payload nếu được cung cấp)
    let purchasePrice = 0;
    if (payload.purchasePrice !== undefined) {
      purchasePrice = Number(payload.purchasePrice) || 0;
      if (purchasePrice < 0) {
        return { status: "ERR", message: "Purchase price must be greater than or equal to 0" };
      }
    } else {
      // Nếu không có trong payload, thử lấy từ Supplier.purchaseCosts (sẽ được set sau khi tạo product)
      // Hoặc có thể để mặc định 0, QC Staff sẽ update sau
    }


    // ✅ Check unique constraint: không cho phép trùng (name + brand)
    const normalizedName = name.toString().trim();
    const existingProduct = await ProductModel.findOne({
      name: normalizedName,
      brand: normalizedBrand,
    });
    if (existingProduct) {
      return {
        status: "ERR",
        message: `Product "${normalizedName}" with brand "${normalizedBrand}" already exists. Please use the existing product or choose another brand.`,
      };
    }


    // ✅ Validate ảnh: max 10 và length khớp (giống updateProductAdmin)
    const newImages = Array.isArray(images) ? images : [];
    const newImagePublicIds = Array.isArray(imagePublicIds) ? imagePublicIds : [];
   
    if (newImages.length > 10) {
      return { status: "ERR", message: "Number of images must not exceed 10" };
    }
    if (newImagePublicIds.length > 10) {
      return { status: "ERR", message: "Number of imagePublicIds must not exceed 10" };
    }
    if (newImages.length !== newImagePublicIds.length) {
      return { status: "ERR", message: "The number of images and imagePublicIds must match" };
    }


    const product = new ProductModel({
      name: name.toString().trim(),
      short_desc: (short_desc ?? "").toString(),
      price: Number(price),
      purchasePrice: purchasePrice, // ✅ Giá nhập hàng
      plannedQuantity: Number(plannedQuantity),
      category: new mongoose.Types.ObjectId(category),
      images: newImages,
      imagePublicIds: newImagePublicIds,
      brand: normalizedBrand,
      supplier: supplierDoc._id, // ✅ Liên kết đến Supplier
      detail_desc: (detail_desc ?? "").toString(),
      status: status ?? true,
    });


    await product.save();


    // ✅ Nếu có purchasePrice, sync vào Supplier.purchaseCosts
    if (purchasePrice > 0) {
      if (!supplierDoc.purchaseCosts) {
        supplierDoc.purchaseCosts = new Map();
      }
      supplierDoc.purchaseCosts.set(product._id.toString(), purchasePrice);
      await supplierDoc.save();
    }


    // ✅ Cập nhật totalProductsSupplied của supplier
    supplierDoc.totalProductsSupplied = (supplierDoc.totalProductsSupplied || 0) + 1;
    await supplierDoc.save();


    const populated = await ProductModel.findById(product._id)
      .populate("category", "name")
      .populate("supplier", "name type cooperationStatus");
    return { status: "OK", message: "Product created successfully", data: populated };
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
    const [rawData, total] = await Promise.all([
      ProductModel.find(query)
        .populate("category", "name")
        .populate("supplier", "name type cooperationStatus")
        .sort(sortObj)
        .skip(skip)
        .limit(limitNum)
        .lean(),
      ProductModel.countDocuments(query),
    ]);
    const data = rawData.map((p) => {
      const { effectivePrice, isNearExpiry, originalPrice } = getEffectivePrice(p);
      return { ...p, effectivePrice, isNearExpiry, originalPrice };
    });
    return {
      status: "OK",
      message: "Fetched product list successfully",
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
    const product = await ProductModel.findById(id).populate("category", "name").lean();
    if (!product) return { status: "ERR", message: "Product does not exist" };
    const { effectivePrice, isNearExpiry, originalPrice } = getEffectivePrice(product);
    const data = { ...product, effectivePrice, isNearExpiry, originalPrice };
    return { status: "OK", message: "Fetched product successfully", data };
  } catch (error) {
    return { status: "ERR", message: error.message };
  }
};


const updateProductAdmin = async (id, payload = {}) => {
  try {
    const product = await ProductModel.findById(id);
    if (!product) return { status: "ERR", message: "Product does not exist" };
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
      "nearExpiryDaysThreshold",
      "nearExpiryDiscountPercent",
    ];


    for (const key of Object.keys(payload)) {
      if (!allowed.includes(key)) delete payload[key];
    }


    if (payload.name !== undefined) {
      const newName = (payload.name ?? "").toString().trim();
      if (!newName) return { status: "ERR", message: "Product name is required" };
      product.name = newName;
    }


    if (payload.short_desc !== undefined) product.short_desc = (payload.short_desc ?? "").toString();
    if (payload.price !== undefined) {
      const p = Number(payload.price);
      if (Number.isNaN(p) || p < 0) return { status: "ERR", message: "Invalid product price" };
      product.price = p;
    }


    // ✅ Xử lý purchasePrice
    if (payload.purchasePrice !== undefined) {
      const purchasePrice = Number(payload.purchasePrice);
      if (Number.isNaN(purchasePrice) || purchasePrice < 0) {
        return { status: "ERR", message: "Purchase price must be greater than or equal to 0" };
      }
      product.purchasePrice = purchasePrice;


      // ✅ Sync purchasePrice vào Supplier.purchaseCosts
      if (product.supplier) {
        const supplier = await SupplierModel.findById(product.supplier);
        if (supplier) {
          if (!supplier.purchaseCosts) {
            supplier.purchaseCosts = new Map();
          }
          supplier.purchaseCosts.set(product._id.toString(), purchasePrice);
          await supplier.save();
        }
      }
    }


    if (payload.plannedQuantity !== undefined) {
      const planned = Number(payload.plannedQuantity);
      if (Number.isNaN(planned) || planned < 0) return { status: "ERR", message: "Invalid plannedQuantity value" };
      // Chặn giảm planned thấp hơn số đã nhập
      if ((product.receivedQuantity ?? 0) > planned) {
        return { status: "ERR", message: "plannedQuantity cannot be less than the current receivedQuantity" };
      }
      product.plannedQuantity = planned;
    }


    if (payload.category !== undefined) {
      const categoryDoc = await CategoryModel.findById(payload.category);
      if (!categoryDoc) return { status: "ERR", message: "Category does not exist" };
      // Kiểm tra category không được ẩn
      if (categoryDoc.status === false) {
        return { status: "ERR", message: "Cannot select a hidden category" };
      }
     
      product.category = new mongoose.Types.ObjectId(payload.category);
    }


    // ✅ Xử lý brand và supplier liên kết
    if (payload.brand !== undefined) {
      const newBrand = payload.brand.toString().trim();
      if (!newBrand) {
        return { status: "ERR", message: "Brand is required" };
      }


      // Validate brand phải là một supplier name tồn tại và đang hoạt động
      const supplierDoc = await SupplierModel.findOne({
        name: newBrand,
        status: true,
        cooperationStatus: "ACTIVE",
      });


      if (!supplierDoc) {
        return {
          status: "ERR",
          message: `Brand "${newBrand}" không tồn tại hoặc không đang hoạt động. Vui lòng chọn một nhà cung cấp hợp lệ.`,
        };
      }


      // Kiểm tra unique constraint nếu brand thay đổi
      if (product.brand !== newBrand) {
        const existingProduct = await ProductModel.findOne({
          _id: { $ne: id },
          name: product.name,
          brand: newBrand,
        });
        if (existingProduct) {
          return {
            status: "ERR",
            message: `Product "${product.name}" with brand "${newBrand}" already exists. Please choose another brand.`,
          };
        }
      }


      // ✅ Cập nhật totalProductsSupplied của supplier khi brand thay đổi
      const oldSupplierId = product.supplier ? product.supplier.toString() : null;
      const newSupplierId = supplierDoc._id.toString();
     
      // Nếu supplier thay đổi, cập nhật thống kê
      if (oldSupplierId !== newSupplierId) {
        // Giảm số lượng của supplier cũ (nếu có)
        if (oldSupplierId) {
          const oldSupplier = await SupplierModel.findById(oldSupplierId);
          if (oldSupplier && oldSupplier.totalProductsSupplied > 0) {
            oldSupplier.totalProductsSupplied = Math.max(0, (oldSupplier.totalProductsSupplied || 0) - 1);
            await oldSupplier.save();
          }
        }
        // Tăng số lượng của supplier mới
        supplierDoc.totalProductsSupplied = (supplierDoc.totalProductsSupplied || 0) + 1;
        await supplierDoc.save();
      }


      product.brand = newBrand;
      product.supplier = supplierDoc._id; // ✅ Cập nhật supplier reference
    }


    // Xử lý ảnh: validate trước, set vào product, save, rồi mới xóa Cloudinary
    let imagesToDelete = [];
    if (payload.images !== undefined || payload.imagePublicIds !== undefined) {
      const newImages = Array.isArray(payload.images) ? payload.images : [];
      const newImagePublicIds = Array.isArray(payload.imagePublicIds) ? payload.imagePublicIds : [];
     
      // ✅ Validate max 10 ảnh và length khớp trước khi set vào product
      if (newImages.length > 10) {
        return { status: "ERR", message: "Number of images must not exceed 10" };
      }
      if (newImagePublicIds.length > 10) {
        return { status: "ERR", message: "Number of imagePublicIds must not exceed 10" };
      }
      if (newImages.length !== newImagePublicIds.length) {
        return { status: "ERR", message: "The number of images and imagePublicIds must match" };
      }
     
      const oldImagePublicIds = Array.isArray(product.imagePublicIds) ? product.imagePublicIds : [];
     
      // Tìm ảnh cũ cần xóa (không còn trong danh sách mới) - lưu lại để xóa sau
      imagesToDelete = oldImagePublicIds.filter(id => !newImagePublicIds.includes(id));
     
      // ✅ Set ảnh mới vào product (chưa xóa Cloudinary)
      product.images = newImages;
      product.imagePublicIds = newImagePublicIds;
    }
   
    // Brand đã được xử lý ở trên với supplier validation
    if (payload.detail_desc !== undefined) product.detail_desc = (payload.detail_desc ?? "").toString();
    if (payload.status !== undefined) product.status = payload.status;
    if (payload.nearExpiryDaysThreshold !== undefined) {
      const v = Number(payload.nearExpiryDaysThreshold);
      if (!Number.isInteger(v) || v < 0) return { status: "ERR", message: "nearExpiryDaysThreshold must be an integer greater than or equal to 0" };
      product.nearExpiryDaysThreshold = v;
    }
    if (payload.nearExpiryDiscountPercent !== undefined) {
      const v = Number(payload.nearExpiryDiscountPercent);
      if (Number.isNaN(v) || v < 0 || v > 100) return { status: "ERR", message: "nearExpiryDiscountPercent must be between 0 and 100" };
      product.nearExpiryDiscountPercent = v;
    }
    // ✅ Save product trước
    await product.save();


    // ✅ Xóa ảnh cũ trên Cloudinary sau khi save thành công (không mất ảnh trong mọi trường hợp)
    if (imagesToDelete.length > 0) {
      try {
        await Promise.all(imagesToDelete.map(id => cloudinary.uploader.destroy(id).catch(err => {
          console.warn(`Không thể xóa ảnh ${id} trên Cloudinary:`, err.message);
        })));
      } catch (err) {
        console.warn("Failed to remove old image:", err.message);
      }
    }


    const populated = await ProductModel.findById(product._id)
      .populate("category", "name")
      .populate("supplier", "name type cooperationStatus");
    return { status: "OK", message: "Product updated successfully", data: populated };
  } catch (error) {
    return { status: "ERR", message: error.message };
  }
};




const updateProductExpiryDate = async (id, payload = {}) => {
  try {
    const product = await ProductModel.findById(id);
    if (!product) return { status: "ERR", message: "Product does not exist" };
      };
    }


    // ✅ Logic: Khóa việc cập nhật hạn sử dụng sau khi đã set lần đầu (check cả Date và Str)
    const hasExpiry = !!(product.expiryDate || product.expiryDateStr);
    if (hasExpiry) {
      };
    }


    const { expiryDate } = payload;


    if (!expiryDate) {
      return { status: "ERR", message: "expiryDate is required" };
    }


    // Validate expiryDate
    let newExpiryDate = null;
    try {
      newExpiryDate = new Date(expiryDate);
      if (isNaN(newExpiryDate.getTime())) {
        return { status: "ERR", message: "Invalid expiryDate" };
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
      return { status: "ERR", message: "Invalid expiryDate" };
    }


    // ✅ Validate: expiryDate phải sau warehouseEntryDate
    const warehouseEntryDate = new Date(product.warehouseEntryDate);
    warehouseEntryDate.setHours(0, 0, 0, 0);
   
    const diffDays = calculateDaysBetween(warehouseEntryDate, newExpiryDate);
   
    if (diffDays <= 0) {
      };
    }


    // ✅ Cập nhật expiryDate và expiryDateStr
    product.expiryDate = newExpiryDate;
    product.expiryDateStr = formatDateVN(newExpiryDate);


    await product.save();


    const populated = await ProductModel.findById(product._id).populate("category", "name");
    };
  } catch (error) {
    return { status: "ERR", message: error.message };
  }
};


const deleteProduct = async (id) => {
  try {
    const product = await ProductModel.findById(id);
    if (!product) return { status: "ERR", message: "Product does not exist" };
    // Xóa tất cả ảnh trên Cloudinary nếu có
    if (Array.isArray(product.imagePublicIds) && product.imagePublicIds.length > 0) {
      try {
        await Promise.all(product.imagePublicIds.map(publicId =>
          cloudinary.uploader.destroy(publicId).catch(err => {
            console.warn(`Không thể xóa ảnh ${publicId} trên Cloudinary:`, err.message);
          })
        ));
      } catch (err) {
        console.warn("Failed to remove image from Cloudinary:", err.message);
      }
    }


    await ProductModel.findByIdAndDelete(id);
    return { status: "OK", message: "Product deleted successfully" };
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
      message: "Fetched product statistics successfully",
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
