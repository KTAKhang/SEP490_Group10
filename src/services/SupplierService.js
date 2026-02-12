const mongoose = require("mongoose");
const SupplierModel = require("../models/SupplierModel");
const HarvestBatchModel = require("../models/HarvestBatchModel");
const ProductModel = require("../models/ProductModel");

const HarvestBatchService = require("./HarvestBatchService");

/** Phone: only digits, spaces, + - ( ); digit count must be 10–12. Returns { valid, message }. */
function validatePhone(phoneStr) {
  if (!phoneStr || !phoneStr.toString().trim()) {
    return { valid: true };
  }
  const s = phoneStr.toString().trim();
  if (!/^[0-9+\-\s()]+$/.test(s)) {
    return { valid: false, message: "Phone number can only contain digits, spaces, and + - ( )" };
  }
  const digitCount = (s.match(/\d/g) || []).length;
  if (digitCount < 10) {
    return { valid: false, message: "Phone number must contain 10 to 12 digits" };
  }
  if (digitCount > 12) {
    return { valid: false, message: "Phone number must contain 10 to 12 digits" };
  }
  return { valid: true };
}

/** Email: detailed validation. Returns { valid, message }. */
function validateEmail(emailStr) {
  if (!emailStr || !emailStr.toString().trim()) {
    return { valid: true };
  }
  const s = emailStr.toString().trim();
  if (s.indexOf("@") === -1) {
    return { valid: false, message: "Email must contain @" };
  }
  if ((s.match(/@/g) || []).length > 1) {
    return { valid: false, message: "Email must contain exactly one @" };
  }
  const [local, domain] = s.split("@");
  if (!local || !local.length) {
    return { valid: false, message: "Email must have a local part before @" };
  }
  if (!domain || !domain.length) {
    return { valid: false, message: "Email must have a domain after @" };
  }
  if (domain.indexOf(".") === -1) {
    return { valid: false, message: "Email domain must contain a dot (e.g. example.com)" };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) {
    return { valid: false, message: "Invalid email format (e.g. name@example.com)" };
  }
  return { valid: true };
}


/**
 * Tạo nhà cung cấp mới (Admin)
 */
const createSupplier = async (userId, payload = {}) => {
  try {
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return { status: "ERR", message: "Invalid user ID" };
    }

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
    const normalizedName = name.toString().trim();
    if (normalizedName.length < 2) {
      return { status: "ERR", message: "Supplier name must be at least 2 characters" };
    }
    if (normalizedName.length > 100) {
      return { status: "ERR", message: "Supplier name must be at most 100 characters" };
    }

    if (!type || !["FARM", "COOPERATIVE", "BUSINESS"].includes(type)) {
      return {
        status: "ERR",
        message: "Supplier type must be FARM, COOPERATIVE, or BUSINESS",
      };
    }

    const contactPersonStr = (contactPerson ?? "").toString().trim();
    if (contactPersonStr.length > 50) {
      return { status: "ERR", message: "Contact person name must be at most 50 characters" };
    }

    const addressStr = (address ?? "").toString().trim();
    if (addressStr.length > 500) {
      return { status: "ERR", message: "Address must be at most 500 characters" };
    }

    const notesStr = (notes ?? "").toString().trim();
    if (notesStr.length > 1000) {
      return { status: "ERR", message: "Notes must be at most 1000 characters" };
    }

    // ✅ BR-SUP-02: At least phone or email required
    const normalizedPhone = phone?.toString().trim() || "";
    const normalizedEmail = email?.toString().trim() || "";
    if (!normalizedPhone && !normalizedEmail) {
      return {
        status: "ERR",
        message: "At least one phone number or email is required",
      };
    }
    if (normalizedPhone) {
      const phoneCheck = validatePhone(normalizedPhone);
      if (!phoneCheck.valid) {
        return { status: "ERR", message: phoneCheck.message };
      }
    }
    if (normalizedEmail) {
      const emailCheck = validateEmail(normalizedEmail);
      if (!emailCheck.valid) {
        return { status: "ERR", message: emailCheck.message };
      }
    }


    // ✅ BR-SUP-03: Check duplicate (name + phone)
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
      contactPerson: contactPersonStr || "",
      phone: normalizedPhone || "",
      email: normalizedEmail || "",
      address: addressStr || "",
      notes: notesStr || "",
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
    if (error.code === 11000) {
      return { status: "ERR", message: "Supplier with this name and phone number already exists" };
    }
    return { status: "ERR", message: error.message };
  }
};


/**
 * Cập nhật thông tin nhà cung cấp (Admin)
 */
const updateSupplier = async (supplierId, userId, payload = {}) => {
  try {
    if (!supplierId || !mongoose.Types.ObjectId.isValid(supplierId)) {
      return { status: "ERR", message: "Invalid supplier ID" };
    }
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return { status: "ERR", message: "Invalid user ID" };
    }

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
      return { status: "ERR", message: "Cannot edit a terminated supplier." };
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
      const normalizedName = payload.name.toString().trim();
      if (normalizedName.length < 2) {
        return { status: "ERR", message: "Supplier name must be at least 2 characters" };
      }
      if (normalizedName.length > 100) {
        return { status: "ERR", message: "Supplier name must be at most 100 characters" };
      }
      changes.set("name", { old: supplier.name, new: payload.name });
      // ✅ BR-SUP-03: Check duplicate (name + phone) when phone present
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
      const val = payload.contactPerson?.toString().trim() || "";
      if (val.length > 50) {
        return { status: "ERR", message: "Contact person name must be at most 50 characters" };
      }
      changes.set("contactPerson", { old: supplier.contactPerson, new: val });
      supplier.contactPerson = val;
    }

    if (payload.phone !== undefined) {
      const val = payload.phone?.toString().trim() || "";
      if (val) {
        const phoneCheck = validatePhone(val);
        if (!phoneCheck.valid) {
          return { status: "ERR", message: phoneCheck.message };
        }
      }
      changes.set("phone", { old: supplier.phone, new: val });
      supplier.phone = val;
    }

    if (payload.email !== undefined) {
      const val = payload.email?.toString().trim() || "";
      if (val) {
        const emailCheck = validateEmail(val);
        if (!emailCheck.valid) {
          return { status: "ERR", message: emailCheck.message };
        }
      }
      changes.set("email", { old: supplier.email, new: val });
      supplier.email = val;
    }

    if (payload.address !== undefined) {
      const val = payload.address?.toString().trim() || "";
      if (val.length > 500) {
        return { status: "ERR", message: "Address must be at most 500 characters" };
      }
      changes.set("address", { old: supplier.address, new: val });
      supplier.address = val;
    }

    if (payload.notes !== undefined) {
      const val = payload.notes?.toString().trim() || "";
      if (val.length > 1000) {
        return { status: "ERR", message: "Notes must be at most 1000 characters" };
      }
      changes.set("notes", { old: supplier.notes, new: val });
      supplier.notes = val;
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
    if (error.code === 11000) {
      return { status: "ERR", message: "Supplier with this name and phone number already exists" };
    }
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


    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));
    if (pageNum > 10000) {
      return { status: "ERR", message: "Invalid page (max 10000)" };
    }
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
    if (type) {
      if (!["FARM", "COOPERATIVE", "BUSINESS"].includes(type)) {
        return { status: "ERR", message: "type must be FARM, COOPERATIVE, or BUSINESS" };
      }
      query.type = type;
    }
    if (cooperationStatus) {
      if (!["ACTIVE", "TERMINATED"].includes(cooperationStatus)) {
        return { status: "ERR", message: "cooperationStatus must be ACTIVE or TERMINATED" };
      }
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
    if (!supplierId || !mongoose.Types.ObjectId.isValid(supplierId)) {
      return { status: "ERR", message: "Invalid supplier ID" };
    }

    const supplier = await SupplierModel.findById(supplierId);
    if (!supplier) {
      return { status: "ERR", message: "Supplier does not exist" };
    }

    // Check if any products use this supplier
    const productsCount = await ProductModel.countDocuments({ supplier: supplier._id });
    if (productsCount > 0) {
      return {
        status: "ERR",
        message: `Cannot delete supplier. There are ${productsCount} products using this supplier. Please unlink the products first.`,
      };
    }


    // Kiểm tra có harvest batches không
    const harvestBatchesCount = await HarvestBatchModel.countDocuments({ supplier: supplier._id });
    if (harvestBatchesCount > 0) {
      return {
        status: "ERR",
        message: `Cannot delete supplier. There are ${harvestBatchesCount} harvest batches. Please delete the harvest batches first.`,
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


    if (!supplierId || !mongoose.Types.ObjectId.isValid(supplierId)) {
      return { status: "ERR", message: "Invalid supplier ID" };
    }
    if (!productId || !mongoose.Types.ObjectId.isValid(productId)) {
      return { status: "ERR", message: "Invalid product ID" };
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


    if (!supplierId || !mongoose.Types.ObjectId.isValid(supplierId)) {
      return { status: "ERR", message: "Invalid supplier ID" };
    }
    if (!cooperationStatus || !["ACTIVE", "TERMINATED"].includes(cooperationStatus)) {
      return {
        status: "ERR",
        message: "Cooperation status must be ACTIVE or TERMINATED",
      };
    }
    if (notes !== undefined && notes !== null && notes.toString().trim().length > 1000) {
      return { status: "ERR", message: "Notes must be at most 1000 characters" };
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
