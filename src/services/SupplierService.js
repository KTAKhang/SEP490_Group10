const mongoose = require("mongoose");
const SupplierModel = require("../models/SupplierModel");
const HarvestBatchModel = require("../models/HarvestBatchModel");
const QualityVerificationModel = require("../models/QualityVerificationModel");
const SupplierPerformanceModel = require("../models/SupplierPerformanceModel");
const SupplierActivityLogModel = require("../models/SupplierActivityLogModel");
const ProductModel = require("../models/ProductModel");

// Import các service đã tách
const HarvestBatchService = require("./HarvestBatchService");
const QualityVerificationService = require("./QualityVerificationService");
const SupplierPerformanceService = require("./SupplierPerformanceService");

/**
 * Tạo nhà cung cấp mới (QC Staff)
 */
const createSupplier = async (userId, payload = {}) => {
  try {
    const {
      name,
      type,
      code,
      contactPerson,
      phone,
      email,
      address,
      notes,
      status = true,
    } = payload;

    if (!name || !name.toString().trim()) {
      return { status: "ERR", message: "Tên nhà cung cấp là bắt buộc" };
    }

    if (!type || !["FARM", "COOPERATIVE", "BUSINESS"].includes(type)) {
      return { status: "ERR", message: "Loại nhà cung cấp phải là FARM, COOPERATIVE hoặc BUSINESS" };
    }

    // ✅ BR-SUP-02: Phải có phone hoặc email (ít nhất 1)
    const normalizedPhone = phone?.toString().trim() || "";
    const normalizedEmail = email?.toString().trim() || "";
    if (!normalizedPhone && !normalizedEmail) {
      return { status: "ERR", message: "Phải có ít nhất số điện thoại hoặc email" };
    }

    // ✅ BR-SUP-03: Kiểm tra trùng (name + phone) hoặc code
    const normalizedName = name.toString().trim();
    let normalizedCode = code?.toString().trim().toUpperCase() || null;

    if (normalizedPhone) {
      const existingByNamePhone = await SupplierModel.findOne({
        name: normalizedName,
        phone: normalizedPhone,
      });
      if (existingByNamePhone) {
        return { status: "ERR", message: `Nhà cung cấp "${normalizedName}" với số điện thoại "${normalizedPhone}" đã tồn tại` };
      }
    }

    if (normalizedCode) {
      const existingByCode = await SupplierModel.findOne({ code: normalizedCode });
      if (existingByCode) {
        return { status: "ERR", message: `Mã nhà cung cấp "${normalizedCode}" đã tồn tại` };
      }
    } else {
      // ✅ Auto-generate code nếu không có để tránh duplicate key error
      // Format: {TYPE_PREFIX}{YYYYMMDD}{SEQUENCE}
      const typePrefix = {
        FARM: "F",
        COOPERATIVE: "C",
        BUSINESS: "B",
      }[type] || "S";
      
      const today = new Date();
      const dateStr = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}`;
      
      // Tìm số thứ tự tiếp theo
      const lastSupplier = await SupplierModel.findOne({
        code: { $regex: `^${typePrefix}${dateStr}` },
      }).sort({ code: -1 });
      
      let sequence = 1;
      if (lastSupplier && lastSupplier.code) {
        const lastSeq = parseInt(lastSupplier.code.slice(-3)) || 0;
        sequence = lastSeq + 1;
      }
      
      normalizedCode = `${typePrefix}${dateStr}${String(sequence).padStart(3, "0")}`;
      
      // Kiểm tra lại để đảm bảo không trùng
      const existingByGeneratedCode = await SupplierModel.findOne({ code: normalizedCode });
      if (existingByGeneratedCode) {
        // Nếu trùng (rất hiếm), tăng sequence
        sequence++;
        normalizedCode = `${typePrefix}${dateStr}${String(sequence).padStart(3, "0")}`;
      }
    }

    const supplier = new SupplierModel({
      name: normalizedName,
      type,
      code: normalizedCode,
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

    // Log activity
    await SupplierActivityLogModel.create({
      supplier: supplier._id,
      action: "CREATED",
      description: `Tạo nhà cung cấp mới: ${supplier.name}`,
      relatedEntity: "SUPPLIER",
      relatedEntityId: supplier._id,
      performedBy: new mongoose.Types.ObjectId(userId),
    });

    return {
      status: "OK",
      message: "Tạo nhà cung cấp thành công",
      data: supplier,
    };
  } catch (error) {
    return { status: "ERR", message: error.message };
  }
};

/**
 * Cập nhật thông tin nhà cung cấp (QC Staff)
 */
const updateSupplier = async (supplierId, userId, payload = {}) => {
  try {
    const supplier = await SupplierModel.findById(supplierId);
    if (!supplier) {
      return { status: "ERR", message: "Nhà cung cấp không tồn tại" };
    }

    // ✅ BR-SUP-04: Không cho chỉnh sửa Supplier TERMINATED trừ Admin
    const UserModel = require("../models/UserModel");
    const user = await UserModel.findById(userId).populate("role_id", "name");
    const userRole = user?.role_id?.name || "customer";
    const isAdmin = userRole === "admin";

    if (supplier.cooperationStatus === "TERMINATED" && !isAdmin) {
      return { 
        status: "ERR", 
        message: "Không thể chỉnh sửa nhà cung cấp đã ngừng hợp tác. Chỉ Admin mới có quyền thực hiện." 
      };
    }

    const changes = new Map();

    // Whitelist fields
    const allowed = [
      "name",
      "type",
      "code",
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
      return { status: "ERR", message: "Phải có ít nhất số điện thoại hoặc email" };
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
          return { status: "ERR", message: `Nhà cung cấp "${normalizedName}" với số điện thoại "${newPhone}" đã tồn tại` };
        }
      }
      supplier.name = normalizedName;
    }

    if (payload.type !== undefined && payload.type !== supplier.type) {
      if (!["FARM", "COOPERATIVE", "BUSINESS"].includes(payload.type)) {
        return { status: "ERR", message: "Loại nhà cung cấp phải là FARM, COOPERATIVE hoặc BUSINESS" };
      }
      changes.set("type", { old: supplier.type, new: payload.type });
      supplier.type = payload.type;
    }

    if (payload.code !== undefined) {
      const normalizedCode = payload.code?.toString().trim().toUpperCase() || null;
      // ✅ BR-SUP-03: Kiểm tra trùng code
      if (normalizedCode) {
        const existingByCode = await SupplierModel.findOne({
          _id: { $ne: supplierId },
          code: normalizedCode,
        });
        if (existingByCode) {
          return { status: "ERR", message: `Mã nhà cung cấp "${normalizedCode}" đã tồn tại` };
        }
      }
      changes.set("code", { old: supplier.code, new: normalizedCode });
      supplier.code = normalizedCode;
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

    // Log activity
    if (changes.size > 0) {
      await SupplierActivityLogModel.create({
        supplier: supplier._id,
        action: "UPDATED",
        description: `Cập nhật thông tin nhà cung cấp: ${supplier.name}`,
        relatedEntity: "SUPPLIER",
        relatedEntityId: supplier._id,
        changes: changes,
        performedBy: new mongoose.Types.ObjectId(userId),
      });
    }

    return {
      status: "OK",
      message: "Cập nhật nhà cung cấp thành công",
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
      sortBy = "createdAt",
      sortOrder = "desc",
    } = filters;

    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit) || 20));
    const skip = (pageNum - 1) * limitNum;

    const query = {};

    // Search theo tên
    if (search) {
      query.name = { $regex: search, $options: "i" };
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

    // Sort
    const allowedSortFields = ["name", "type", "cooperationStatus", "performanceScore", "createdAt", "updatedAt"];
    const sortField = allowedSortFields.includes(sortBy) ? sortBy : "createdAt";
    const sortDirection = sortOrder === "asc" ? 1 : -1;
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
      message: "Lấy danh sách nhà cung cấp thành công",
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
 * Xóa nhà cung cấp (QC Staff) - chỉ cho phép xóa nếu không có dữ liệu liên quan
 */
const deleteSupplier = async (supplierId, userId) => {
  try {
    if (!mongoose.isValidObjectId(supplierId)) {
      return { status: "ERR", message: "supplierId không hợp lệ" };
    }

    const supplier = await SupplierModel.findById(supplierId);
    if (!supplier) {
      return { status: "ERR", message: "Nhà cung cấp không tồn tại" };
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

    // Kiểm tra có quality verifications không
    const qualityVerificationsCount = await QualityVerificationModel.countDocuments({ supplier: supplier._id });
    if (qualityVerificationsCount > 0) {
      return {
        status: "ERR",
        message: `Không thể xóa nhà cung cấp vì đang có ${qualityVerificationsCount} kết quả kiểm định chất lượng.`,
      };
    }

    // Kiểm tra có performance evaluations không
    const performancesCount = await SupplierPerformanceModel.countDocuments({ supplier: supplier._id });
    if (performancesCount > 0) {
      return {
        status: "ERR",
        message: `Không thể xóa nhà cung cấp vì đang có ${performancesCount} đánh giá hiệu suất. Vui lòng xóa các đánh giá trước.`,
      };
    }

    // Log activity trước khi xóa
    await SupplierActivityLogModel.create({
      supplier: supplier._id,
      action: "DELETED",
      description: `Xóa nhà cung cấp: ${supplier.name}`,
      relatedEntity: "SUPPLIER",
      relatedEntityId: supplier._id,
      performedBy: new mongoose.Types.ObjectId(userId),
    });

    await supplier.deleteOne();

    return {
      status: "OK",
      message: "Xóa nhà cung cấp thành công",
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
      return { status: "ERR", message: "ID nhà cung cấp không hợp lệ" };
    }

    const supplier = await SupplierModel.findById(supplierId)
      .populate("createdBy", "user_name email")
      .populate("updatedBy", "user_name email")
      .lean();

    if (!supplier) {
      return { status: "ERR", message: "Nhà cung cấp không tồn tại" };
    }

    return {
      status: "OK",
      message: "Lấy chi tiết nhà cung cấp thành công",
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
      message: "Lấy danh sách nhà cung cấp thành công",
      data: suppliers,
    };
  } catch (error) {
    return { status: "ERR", message: error.message };
  }
};

/**
 * Cập nhật giá mua từ nhà cung cấp (QC Staff)
 */
const updatePurchaseCost = async (supplierId, userId, payload = {}) => {
  try {
    const { productId, cost } = payload;

    if (!mongoose.isValidObjectId(supplierId)) {
      return { status: "ERR", message: "supplierId không hợp lệ" };
    }

    if (!mongoose.isValidObjectId(productId)) {
      return { status: "ERR", message: "productId không hợp lệ" };
    }

    const costValue = Number(cost);
    if (!Number.isFinite(costValue) || costValue < 0) {
      return { status: "ERR", message: "Giá mua phải là số >= 0" };
    }

    const supplier = await SupplierModel.findById(supplierId);
    if (!supplier) {
      return { status: "ERR", message: "Nhà cung cấp không tồn tại" };
    }

    const product = await ProductModel.findById(productId);
    if (!product) {
      return { status: "ERR", message: "Sản phẩm không tồn tại" };
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

    // Log activity
    await SupplierActivityLogModel.create({
      supplier: supplier._id,
      action: "PURCHASE_COST_UPDATED",
      description: `Cập nhật giá mua: ${product.name} - ${oldCost} -> ${costValue}`,
      relatedEntity: "PRODUCT",
      relatedEntityId: productId,
      changes: new Map([["cost", { old: oldCost, new: costValue }]]),
      performedBy: new mongoose.Types.ObjectId(userId),
    });

    return {
      status: "OK",
      message: "Cập nhật giá mua thành công",
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
 * Cập nhật trạng thái hợp tác (QC Staff)
 */
const updateCooperationStatus = async (supplierId, userId, payload = {}) => {
  try {
    const { cooperationStatus, notes } = payload;

    if (!cooperationStatus || !["ACTIVE", "SUSPENDED", "TERMINATED"].includes(cooperationStatus)) {
      return { status: "ERR", message: "Trạng thái hợp tác phải là ACTIVE, SUSPENDED hoặc TERMINATED" };
    }

    const supplier = await SupplierModel.findById(supplierId);
    if (!supplier) {
      return { status: "ERR", message: "Nhà cung cấp không tồn tại" };
    }

    const oldStatus = supplier.cooperationStatus;
    if (oldStatus === cooperationStatus) {
      return { status: "OK", message: "Trạng thái không thay đổi", data: supplier };
    }

    supplier.cooperationStatus = cooperationStatus;
    if (notes) {
      supplier.notes = notes.toString().trim();
    }
    supplier.updatedBy = new mongoose.Types.ObjectId(userId);
    await supplier.save();

    // Log activity
    await SupplierActivityLogModel.create({
      supplier: supplier._id,
      action: "COOPERATION_STATUS_CHANGED",
      description: `Thay đổi trạng thái hợp tác: ${oldStatus} -> ${cooperationStatus}`,
      relatedEntity: "SUPPLIER",
      relatedEntityId: supplier._id,
      changes: new Map([["cooperationStatus", { old: oldStatus, new: cooperationStatus }]]),
      performedBy: new mongoose.Types.ObjectId(userId),
    });

    return {
      status: "OK",
      message: "Cập nhật trạng thái hợp tác thành công",
      data: supplier,
    };
  } catch (error) {
    return { status: "ERR", message: error.message };
  }
};

/**
 * Lấy lịch sử hoạt động của nhà cung cấp
 */
const getActivityLog = async (supplierId, filters = {}) => {
  try {
    if (!mongoose.isValidObjectId(supplierId)) {
      return { status: "ERR", message: "supplierId không hợp lệ" };
    }

    const {
      page = 1,
      limit = 20,
      action,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = filters;

    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit) || 20));
    const skip = (pageNum - 1) * limitNum;

    const query = {
      supplier: new mongoose.Types.ObjectId(supplierId),
    };

    if (action) {
      const allowedActions = [
        "CREATED",
        "UPDATED",
        "HARVEST_BATCH_CREATED",
        "QUALITY_VERIFIED",
        "PURCHASE_COST_UPDATED",
        "PERFORMANCE_EVALUATED",
        "COOPERATION_STATUS_CHANGED",
        "STATUS_CHANGED",
      ];
      if (allowedActions.includes(action)) {
        query.action = action;
      }
    }

    // Sort
    const allowedSortFields = ["createdAt", "action"];
    const sortField = allowedSortFields.includes(sortBy) ? sortBy : "createdAt";
    const sortDirection = sortOrder === "asc" ? 1 : -1;
    const sortObj = { [sortField]: sortDirection };

    const [data, total] = await Promise.all([
      SupplierActivityLogModel.find(query)
        .populate("performedBy", "user_name email")
        .sort(sortObj)
        .skip(skip)
        .limit(limitNum)
        .lean(),
      SupplierActivityLogModel.countDocuments(query),
    ]);

    return {
      status: "OK",
      message: "Lấy lịch sử hoạt động thành công",
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
  getActivityLog,
  
  // Harvest Batch Management (re-export từ HarvestBatchService)
  createHarvestBatch: HarvestBatchService.createHarvestBatch,
  updateHarvestBatch: HarvestBatchService.updateHarvestBatch,
  deleteHarvestBatch: HarvestBatchService.deleteHarvestBatch,
  getHarvestBatches: HarvestBatchService.getHarvestBatches,
  getHarvestBatchById: HarvestBatchService.getHarvestBatchById,
  
  // Quality Verification Management (re-export từ QualityVerificationService)
  verifyQuality: QualityVerificationService.verifyQuality,
  getQualityVerifications: QualityVerificationService.getQualityVerifications,
  getQualityVerificationById: QualityVerificationService.getQualityVerificationById,
  updateQualityVerification: QualityVerificationService.updateQualityVerification,
  deleteQualityVerification: QualityVerificationService.deleteQualityVerification,
  
  // Supplier Performance Management (re-export từ SupplierPerformanceService)
  evaluatePerformance: SupplierPerformanceService.evaluatePerformance,
  getPerformances: SupplierPerformanceService.getPerformances,
  getPerformanceById: SupplierPerformanceService.getPerformanceById,
  deletePerformance: SupplierPerformanceService.deletePerformance,
};
