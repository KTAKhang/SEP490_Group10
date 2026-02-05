const mongoose = require("mongoose");
const SupplierModel = require("../models/SupplierModel");
const HarvestBatchModel = require("../models/HarvestBatchModel");
const ProductModel = require("../models/ProductModel");


// Import các service đã tách
const HarvestBatchService = require("./HarvestBatchService");


/**
 * Tạo nhà cung cấp mới (Admin)
 */
const createSupplier = async (userId, payload = {}) => {
  try {
    const {
      name,
      type,
      contactPerson,
      phone,
      email,
      address,
      notes,
      status = true,
    } = payload;


    if (!name || !name.toString().trim()) {
      return { status: "ERR", message: "Supplier name is required" };
    }


    if (!type || !["FARM", "COOPERATIVE", "BUSINESS"].includes(type)) {
      return {
        status: "ERR",
        message: "Supplier type must be FARM, COOPERATIVE, or BUSINESS",
      };
    }


    // ✅ BR-SUP-02: Phải có phone hoặc email (ít nhất 1)
    const normalizedPhone = phone?.toString().trim() || "";
    const normalizedEmail = email?.toString().trim() || "";
    if (!normalizedPhone && !normalizedEmail) {
      return {
        status: "ERR",
        message: "At least one phone number or email is required",
      };
    }


    // ✅ BR-SUP-03: Kiểm tra trùng (name + phone)
    const normalizedName = name.toString().trim();


    if (normalizedPhone) {
      const existingByNamePhone = await SupplierModel.findOne({
        name: normalizedName,
        phone: normalizedPhone,
      });
      if (existingByNamePhone) {
        return {
          status: "ERR",
          message: `Supplier "${normalizedName}" with phone number "${normalizedPhone}" already exists`,
        };
      }
    }


    const supplier = new SupplierModel({
      name: normalizedName,
      type,
      contactPerson: contactPerson?.toString().trim() || "",
      phone: normalizedPhone || "",
      email: normalizedEmail || "",
      address: address?.toString().trim() || "",
      notes: notes?.toString().trim() || "",
      status,
      cooperationStatus: "ACTIVE", // ✅ BR-SUP-05: Trạng thái mặc định Active
      createdBy: new mongoose.Types.ObjectId(userId),
    });


    await supplier.save();


    return {
      status: "OK",
      message: "Supplier created successfully",
      data: supplier,
    };
  } catch (error) {
    return { status: "ERR", message: error.message };
  }
};


/**
 * Cập nhật thông tin nhà cung cấp (Admin)
 */
const updateSupplier = async (supplierId, userId, payload = {}) => {
  try {
    const supplier = await SupplierModel.findById(supplierId);
    if (!supplier) {
      return { status: "ERR", message: "Supplier does not exist" };
    }


    // ✅ BR-SUP-04: Không cho chỉnh sửa Supplier TERMINATED trừ Admin
    const UserModel = require("../models/UserModel");
    const user = await UserModel.findById(userId).populate("role_id", "name");
    const userRole = user?.role_id?.name || "customer";
    const isAdmin = userRole === "admin";


    if (supplier.cooperationStatus === "TERMINATED" && !isAdmin) {
      return {
        status: "ERR",
        message: "Cannot edit a supplier that has ended cooperation. Only admins can perform this action."
      };
    }


    const changes = new Map();


    // Whitelist fields
    const allowed = [
      "name",
      "type",
      "contactPerson",
      "phone",
      "email",
      "address",
      "notes",
      "status",
    ];


    for (const key of Object.keys(payload)) {
      if (!allowed.includes(key)) delete payload[key];
    }


    // ✅ BR-SUP-02: Validate phone hoặc email (nếu cập nhật)
    const newPhone = payload.phone !== undefined ? payload.phone?.toString().trim() || "" : supplier.phone || "";
    const newEmail = payload.email !== undefined ? payload.email?.toString().trim() || "" : supplier.email || "";
    if (!newPhone && !newEmail) {
      return {
        status: "ERR",
        message: "At least one phone number or email is required",
      };
    }


    // Track changes
    if (payload.name !== undefined && payload.name !== supplier.name) {
      changes.set("name", { old: supplier.name, new: payload.name });
      const normalizedName = payload.name.toString().trim();
     
      // ✅ BR-SUP-03: Kiểm tra trùng (name + phone) nếu phone có
      if (newPhone) {
        const existingByNamePhone = await SupplierModel.findOne({
          _id: { $ne: supplierId },
          name: normalizedName,
          phone: newPhone,
        });
        if (existingByNamePhone) {
          return {
            status: "ERR",
            message: `Supplier "${normalizedName}" with phone number "${newPhone}" already exists`,
          };
        }
      }
      supplier.name = normalizedName;
    }


    if (payload.type !== undefined && payload.type !== supplier.type) {
      if (!["FARM", "COOPERATIVE", "BUSINESS"].includes(payload.type)) {
        return {
          status: "ERR",
          message: "Supplier type must be FARM, COOPERATIVE, or BUSINESS",
        };
      }
      changes.set("type", { old: supplier.type, new: payload.type });
      supplier.type = payload.type;
    }


    if (payload.contactPerson !== undefined) {
      changes.set("contactPerson", { old: supplier.contactPerson, new: payload.contactPerson });
      supplier.contactPerson = payload.contactPerson?.toString().trim() || "";
    }


    if (payload.phone !== undefined) {
      changes.set("phone", { old: supplier.phone, new: payload.phone });
      supplier.phone = payload.phone?.toString().trim() || "";
    }


    if (payload.email !== undefined) {
      changes.set("email", { old: supplier.email, new: payload.email });
      supplier.email = payload.email?.toString().trim() || "";
    }


    if (payload.address !== undefined) {
      changes.set("address", { old: supplier.address, new: payload.address });
      supplier.address = payload.address?.toString().trim() || "";
    }


    if (payload.notes !== undefined) {
      changes.set("notes", { old: supplier.notes, new: payload.notes });
      supplier.notes = payload.notes?.toString().trim() || "";
    }


    if (payload.status !== undefined && payload.status !== supplier.status) {
      changes.set("status", { old: supplier.status, new: payload.status });
      supplier.status = payload.status;
    }


    supplier.updatedBy = new mongoose.Types.ObjectId(userId);
    await supplier.save();


    return {
      status: "OK",
      message: "Supplier updated successfully",
      data: supplier,
    };
  } catch (error) {
    return { status: "ERR", message: error.message };
  }
};


/**
 * Lấy danh sách nhà cung cấp (có search, sort, filter, pagination)
 */
const getSuppliers = async (filters = {}) => {
  try {
    const {
      page = 1,
      limit = 20,
      search = "",
      type,
      cooperationStatus,
      status,
      minTotalBatches,
      maxTotalBatches,
      minTotalProductsSupplied,
      maxTotalProductsSupplied,
      createdFrom,
      createdTo,
      updatedFrom,
      updatedTo,
      hasEmail,
      hasPhone,
      productId,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = filters;


    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit) || 20));
    const skip = (pageNum - 1) * limitNum;


    const query = {};


    // Search theo nhiều trường
    const searchValue = search?.toString().trim();
    if (searchValue) {
      const escaped = searchValue.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(escaped, "i");
      query.$or = [
        { name: regex },
        { code: regex },
        { phone: regex },
        { email: regex },
        { contactPerson: regex },
        { address: regex },
      ];
    }


    // Filter
    if (type && ["FARM", "COOPERATIVE", "BUSINESS"].includes(type)) {
      query.type = type;
    }


    if (cooperationStatus && ["ACTIVE", "SUSPENDED", "TERMINATED"].includes(cooperationStatus)) {
      query.cooperationStatus = cooperationStatus;
    }


    if (status !== undefined) {
      query.status = status === "true" || status === true;
    }


    // Filter theo tổng lô và tổng sản phẩm
    if (minTotalBatches !== undefined || maxTotalBatches !== undefined) {
      query.totalBatches = {};
      if (minTotalBatches !== undefined && !Number.isNaN(Number(minTotalBatches))) {
        query.totalBatches.$gte = Number(minTotalBatches);
      }
      if (maxTotalBatches !== undefined && !Number.isNaN(Number(maxTotalBatches))) {
        query.totalBatches.$lte = Number(maxTotalBatches);
      }
      if (Object.keys(query.totalBatches).length === 0) {
        delete query.totalBatches;
      }
    }


    if (minTotalProductsSupplied !== undefined || maxTotalProductsSupplied !== undefined) {
      query.totalProductsSupplied = {};
      if (minTotalProductsSupplied !== undefined && !Number.isNaN(Number(minTotalProductsSupplied))) {
        query.totalProductsSupplied.$gte = Number(minTotalProductsSupplied);
      }
      if (maxTotalProductsSupplied !== undefined && !Number.isNaN(Number(maxTotalProductsSupplied))) {
        query.totalProductsSupplied.$lte = Number(maxTotalProductsSupplied);
      }
      if (Object.keys(query.totalProductsSupplied).length === 0) {
        delete query.totalProductsSupplied;
      }
    }


    // Filter theo thời gian tạo/cập nhật
    if (createdFrom || createdTo) {
      const createdRange = {};
      if (createdFrom) {
        const fromDate = new Date(createdFrom);
        if (!Number.isNaN(fromDate.getTime())) {
          fromDate.setHours(0, 0, 0, 0);
          createdRange.$gte = fromDate;
        }
      }
      if (createdTo) {
        const toDate = new Date(createdTo);
        if (!Number.isNaN(toDate.getTime())) {
          toDate.setHours(23, 59, 59, 999);
          createdRange.$lte = toDate;
        }
      }
      if (Object.keys(createdRange).length > 0) {
        query.createdAt = createdRange;
      }
    }


    if (updatedFrom || updatedTo) {
      const updatedRange = {};
      if (updatedFrom) {
        const fromDate = new Date(updatedFrom);
        if (!Number.isNaN(fromDate.getTime())) {
          fromDate.setHours(0, 0, 0, 0);
          updatedRange.$gte = fromDate;
        }
      }
      if (updatedTo) {
        const toDate = new Date(updatedTo);
        if (!Number.isNaN(toDate.getTime())) {
          toDate.setHours(23, 59, 59, 999);
          updatedRange.$lte = toDate;
        }
      }
      if (Object.keys(updatedRange).length > 0) {
        query.updatedAt = updatedRange;
      }
    }


    // Filter theo email/phone tồn tại
    if (hasEmail !== undefined) {
      const hasEmailBool = hasEmail === "true" || hasEmail === true;
      query.email = hasEmailBool ? { $exists: true, $ne: "" } : { $in: [null, ""] };
    }
    if (hasPhone !== undefined) {
      const hasPhoneBool = hasPhone === "true" || hasPhone === true;
      query.phone = hasPhoneBool ? { $exists: true, $ne: "" } : { $in: [null, ""] };
    }


    // Filter theo sản phẩm cung cấp
    if (productId && mongoose.isValidObjectId(productId)) {
      query["suppliedProducts.product"] = new mongoose.Types.ObjectId(productId);
    }


    // Sort
    const allowedSortFields = [
      "name",
      "type",
      "code",
      "cooperationStatus",
      "totalBatches",
      "totalProductsSupplied",
      "status",
      "createdAt",
      "updatedAt",
    ];
    const sortField = allowedSortFields.includes(sortBy) ? sortBy : "createdAt";
    const sortDirection = sortOrder === "asc" || sortOrder === "1" || sortOrder === 1 ? 1 : -1;
    const sortObj = { [sortField]: sortDirection };


    const [data, total] = await Promise.all([
      SupplierModel.find(query)
        .populate("createdBy", "user_name email")
        .populate("updatedBy", "user_name email")
        .sort(sortObj)
        .skip(skip)
        .limit(limitNum)
        .lean(),
      SupplierModel.countDocuments(query),
    ]);


    return {
      status: "OK",
      message: "Fetched supplier list successfully",
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


/**
 * Xóa nhà cung cấp (Admin) - chỉ cho phép xóa nếu không có dữ liệu liên quan
 */
const deleteSupplier = async (supplierId, userId) => {
  try {
    if (!mongoose.isValidObjectId(supplierId)) {
      return { status: "ERR", message: "Invalid supplierId" };
    }


    const supplier = await SupplierModel.findById(supplierId);
    if (!supplier) {
      return { status: "ERR", message: "Supplier does not exist" };
    }


    // Kiểm tra có products đang sử dụng supplier này không
    const productsCount = await ProductModel.countDocuments({ supplier: supplier._id });
    if (productsCount > 0) {
      return {
        status: "ERR",
        message: `Không thể xóa nhà cung cấp vì đang có ${productsCount} sản phẩm đang sử dụng nhà cung cấp này. Vui lòng gỡ liên kết sản phẩm trước.`,
      };
    }


    // Kiểm tra có harvest batches không
    const harvestBatchesCount = await HarvestBatchModel.countDocuments({ supplier: supplier._id });
    if (harvestBatchesCount > 0) {
      return {
        status: "ERR",
        message: `Không thể xóa nhà cung cấp vì đang có ${harvestBatchesCount} lô thu hoạch. Vui lòng xóa các lô thu hoạch trước.`,
      };
    }


    await supplier.deleteOne();


    return {
      status: "OK",
      message: "Supplier deleted successfully",
    };
  } catch (error) {
    return { status: "ERR", message: error.message };
  }
};


/**
 * Lấy chi tiết nhà cung cấp
 */
const getSupplierById = async (supplierId) => {
  try {
    if (!mongoose.isValidObjectId(supplierId)) {
      return { status: "ERR", message: "Invalid supplier ID" };
    }


    const supplier = await SupplierModel.findById(supplierId)
      .populate("createdBy", "user_name email")
      .populate("updatedBy", "user_name email")
      .lean();


    if (!supplier) {
      return { status: "ERR", message: "Supplier does not exist" };
    }


    return {
      status: "OK",
      message: "Fetched supplier details successfully",
      data: supplier,
    };
  } catch (error) {
    return { status: "ERR", message: error.message };
  }
};


/**
 * Lấy danh sách suppliers đơn giản (chỉ name, _id) để admin chọn làm brand
 */
const getSuppliersForBrand = async () => {
  try {
    const suppliers = await SupplierModel.find({
      status: true,
      cooperationStatus: "ACTIVE",
    })
      .select("name _id type")
      .sort({ name: 1 })
      .lean();


    return {
      status: "OK",
      message: "Fetched supplier list successfully",
      data: suppliers,
    };
  } catch (error) {
    return { status: "ERR", message: error.message };
  }
};


/**
 * Cập nhật giá mua từ nhà cung cấp (Admin)
 */
const updatePurchaseCost = async (supplierId, userId, payload = {}) => {
  try {
    const { productId, cost } = payload;


    if (!mongoose.isValidObjectId(supplierId)) {
      return { status: "ERR", message: "Invalid supplierId" };
    }


    if (!mongoose.isValidObjectId(productId)) {
      return { status: "ERR", message: "Invalid productId" };
    }


    const costValue = Number(cost);
    if (!Number.isFinite(costValue) || costValue < 0) {
      return {
        status: "ERR",
        message: "Purchase price must be greater than or equal to 0",
      };
    }


    const supplier = await SupplierModel.findById(supplierId);
    if (!supplier) {
      return { status: "ERR", message: "Supplier does not exist" };
    }


    const product = await ProductModel.findById(productId);
    if (!product) {
      return { status: "ERR", message: "Product does not exist" };
    }


    const oldCost = supplier.purchaseCosts?.get(productId.toString()) || 0;


    // Cập nhật purchaseCosts
    if (!supplier.purchaseCosts) {
      supplier.purchaseCosts = new Map();
    }
    supplier.purchaseCosts.set(productId.toString(), costValue);
    await supplier.save();


    // ✅ Sync purchasePrice vào ProductModel
    product.purchasePrice = costValue;
    await product.save();


    return {
      status: "OK",
      message: "Purchase price updated successfully",
      data: {
        supplier: supplier,
        product: { _id: product._id, name: product.name },
        cost: costValue,
      },
    };
  } catch (error) {
    return { status: "ERR", message: error.message };
  }
};


/**
 * Cập nhật trạng thái hợp tác (Admin)
 */
const updateCooperationStatus = async (supplierId, userId, payload = {}) => {
  try {
    const { cooperationStatus, notes } = payload;


    if (!cooperationStatus || !["ACTIVE", "SUSPENDED", "TERMINATED"].includes(cooperationStatus)) {
      return {
        status: "ERR",
        message: "Cooperation status must be ACTIVE, SUSPENDED, or TERMINATED",
      };
    }


    const supplier = await SupplierModel.findById(supplierId);
    if (!supplier) {
      return { status: "ERR", message: "Supplier does not exist" };
    }


    const oldStatus = supplier.cooperationStatus;
    if (oldStatus === cooperationStatus) {
      return { status: "OK", message: "Status unchanged", data: supplier };
    }


    supplier.cooperationStatus = cooperationStatus;
    if (notes) {
      supplier.notes = notes.toString().trim();
    }
    supplier.updatedBy = new mongoose.Types.ObjectId(userId);
    await supplier.save();


    return {
      status: "OK",
      message: "Cooperation status updated successfully",
      data: supplier,
    };
  } catch (error) {
    return { status: "ERR", message: error.message };
  }
};


// ✅ Re-export các service đã tách để giữ backward compatibility
module.exports = {
  // Supplier Management
  createSupplier,
  updateSupplier,
  deleteSupplier,
  getSuppliers,
  getSupplierById,
  getSuppliersForBrand,
  updatePurchaseCost,
  updateCooperationStatus,
 
  // Harvest Batch Management (re-export từ HarvestBatchService)
  createHarvestBatch: HarvestBatchService.createHarvestBatch,
  updateHarvestBatch: HarvestBatchService.updateHarvestBatch,
  deleteHarvestBatch: HarvestBatchService.deleteHarvestBatch,
  getHarvestBatches: HarvestBatchService.getHarvestBatches,
  getHarvestBatchById: HarvestBatchService.getHarvestBatchById,
};
