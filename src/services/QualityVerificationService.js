const mongoose = require("mongoose");
const QualityVerificationModel = require("../models/QualityVerificationModel");
const HarvestBatchModel = require("../models/HarvestBatchModel");
const SupplierModel = require("../models/SupplierModel");
const ProductModel = require("../models/ProductModel");
const SupplierActivityLogModel = require("../models/SupplierActivityLogModel");

/**
 * Xác minh chất lượng sản phẩm từ nhà cung cấp (QC Staff)
 */
const verifyQuality = async (userId, payload = {}) => {
  try {
    const {
      supplierId,
      productId,
      harvestBatchId,
      verificationResult,
      criteria,
      approvedQuantity,
      rejectedQuantity,
      notes,
    } = payload;

    if (!mongoose.isValidObjectId(supplierId)) {
      return { status: "ERR", message: "supplierId không hợp lệ" };
    }

    if (!mongoose.isValidObjectId(productId)) {
      return { status: "ERR", message: "productId không hợp lệ" };
    }

    if (!verificationResult || !["PASSED", "FAILED", "CONDITIONAL"].includes(verificationResult)) {
      return { status: "ERR", message: "Kết quả kiểm tra phải là PASSED, FAILED hoặc CONDITIONAL" };
    }

    const approvedQty = Number(approvedQuantity) || 0;
    const rejectedQty = Number(rejectedQuantity) || 0;

    if (!Number.isInteger(approvedQty) || approvedQty < 0) {
      return { status: "ERR", message: "approvedQuantity phải là số nguyên >= 0" };
    }

    if (!Number.isInteger(rejectedQty) || rejectedQty < 0) {
      return { status: "ERR", message: "rejectedQuantity phải là số nguyên >= 0" };
    }

    // Kiểm tra supplier và product tồn tại
    const supplier = await SupplierModel.findById(supplierId);
    if (!supplier) {
      return { status: "ERR", message: "Nhà cung cấp không tồn tại" };
    }

    const product = await ProductModel.findById(productId);
    if (!product) {
      return { status: "ERR", message: "Sản phẩm không tồn tại" };
    }

    // ✅ Validation: product phải có supplier trùng với supplierId
    if (!product.supplier || product.supplier.toString() !== supplierId) {
      return {
        status: "ERR",
        message: `Sản phẩm "${product.name}" không thuộc nhà cung cấp "${supplier.name}". Vui lòng chọn đúng sản phẩm của nhà cung cấp này.`,
      };
    }

    // Kiểm tra harvestBatch nếu có
    let harvestBatch = null;
    if (harvestBatchId) {
      if (!mongoose.isValidObjectId(harvestBatchId)) {
        return { status: "ERR", message: "harvestBatchId không hợp lệ" };
      }
      harvestBatch = await HarvestBatchModel.findById(harvestBatchId);
      if (!harvestBatch) {
        return { status: "ERR", message: "Lô thu hoạch không tồn tại" };
      }

      // ✅ Validation: approvedQuantity + rejectedQuantity <= harvestBatch.quantity
      if (approvedQty + rejectedQty > harvestBatch.quantity) {
        return {
          status: "ERR",
          message: `Tổng approvedQuantity (${approvedQty}) + rejectedQuantity (${rejectedQty}) = ${approvedQty + rejectedQty} không được vượt quá quantity của lô thu hoạch (${harvestBatch.quantity})`,
        };
      }

      // ✅ BR-SUP-16: Kiểm tra harvestBatch đã có quality verification chưa
      const existingVerification = await QualityVerificationModel.findOne({ harvestBatch: harvestBatch._id });
      if (existingVerification) {
        return {
          status: "ERR",
          message: `Lô thu hoạch "${harvestBatch.batchNumber}" đã có kết quả kiểm định chất lượng. Mỗi lô chỉ có 1 kết quả cuối cùng.`,
        };
      }
    }

    // ✅ Validation: approvedQuantity + rejectedQuantity > 0
    if (approvedQty + rejectedQty === 0) {
      return {
        status: "ERR",
        message: "Tổng approvedQuantity + rejectedQuantity phải lớn hơn 0. Ít nhất một trong hai phải có giá trị > 0.",
      };
    }

    // ✅ Validation: approvedQuantity > 0 nếu verificationResult = PASSED
    if (verificationResult === "PASSED" && approvedQty === 0) {
      return {
        status: "ERR",
        message: "Nếu kết quả kiểm tra là PASSED, approvedQuantity phải lớn hơn 0.",
      };
    }

    // ✅ Validation: rejectedQuantity > 0 hoặc có lý do nếu verificationResult = FAILED
    if (verificationResult === "FAILED") {
      if (rejectedQty === 0 && (!notes || !notes.trim())) {
        return {
          status: "ERR",
          message: "Nếu kết quả kiểm tra là FAILED, rejectedQuantity phải lớn hơn 0 hoặc phải có ghi chú lý do.",
        };
      }
    }

    // ✅ Validation criteria (0-10 range)
    if (criteria) {
      const criteriaFields = ["appearance", "freshness", "size", "color", "defects"];
      for (const field of criteriaFields) {
        if (criteria[field] !== undefined) {
          const value = Number(criteria[field]);
          if (!Number.isFinite(value) || value < 0 || value > 10) {
            return {
              status: "ERR",
              message: `Criteria.${field} phải là số từ 0 đến 10.`,
            };
          }
        }
      }
    }

    const qualityVerification = new QualityVerificationModel({
      supplier: new mongoose.Types.ObjectId(supplierId),
      product: new mongoose.Types.ObjectId(productId),
      harvestBatch: harvestBatchId ? new mongoose.Types.ObjectId(harvestBatchId) : null,
      verificationResult,
      criteria: criteria || {},
      approvedQuantity: approvedQty,
      rejectedQuantity: rejectedQty,
      notes: notes?.toString().trim() || "",
      verifiedBy: new mongoose.Types.ObjectId(userId),
      verifiedAt: new Date(),
    });

    await qualityVerification.save();

    // Cập nhật trạng thái harvestBatch nếu có
    if (harvestBatchId && harvestBatch) {
      // ✅ BR-SUP-16: Mỗi lô chỉ có 1 kết quả cuối cùng: APPROVED hoặc REJECTED
      if (verificationResult === "PASSED") {
        harvestBatch.status = "APPROVED"; // ✅ BR-SUP-13: APPROVED thay vì VERIFIED
      } else if (verificationResult === "FAILED") {
        harvestBatch.status = "REJECTED";
      } else {
        harvestBatch.status = "APPROVED"; // CONDITIONAL cũng coi như approved (có điều kiện)
      }
      await harvestBatch.save();
    }

    // Log activity
    await SupplierActivityLogModel.create({
      supplier: supplier._id,
      action: "QUALITY_VERIFIED",
      description: `Xác minh chất lượng: ${verificationResult} - Sản phẩm: ${product.name}`,
      relatedEntity: "QUALITY_VERIFICATION",
      relatedEntityId: qualityVerification._id,
      changes: new Map([
        ["verificationResult", verificationResult],
        ["approvedQuantity", approvedQty],
        ["rejectedQuantity", rejectedQty],
      ]),
      performedBy: new mongoose.Types.ObjectId(userId),
    });

    const populated = await QualityVerificationModel.findById(qualityVerification._id)
      .populate("supplier", "name type")
      .populate("product", "name brand")
      .populate("harvestBatch", "batchNumber harvestDate")
      .populate("verifiedBy", "user_name email")
      .lean();

    return {
      status: "OK",
      message: "Xác minh chất lượng thành công",
      data: populated,
    };
  } catch (error) {
    return { status: "ERR", message: error.message };
  }
};

/**
 * Lấy danh sách xác minh chất lượng (QC Staff)
 */
const getQualityVerifications = async (filters = {}) => {
  try {
    const {
      page = 1,
      limit = 20,
      search = "",
      supplierId,
      productId,
      harvestBatchId,
      verificationResult,
      sortBy = "verifiedAt",
      sortOrder = "desc",
    } = filters;

    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit) || 20));
    const skip = (pageNum - 1) * limitNum;

    const query = {};

    // Search (theo notes, verificationResult)
    if (search) {
      query.$or = [
        { notes: { $regex: search, $options: "i" } },
        { verificationResult: { $regex: search, $options: "i" } },
      ];
    }

    // Filter
    if (supplierId && mongoose.isValidObjectId(supplierId)) {
      query.supplier = new mongoose.Types.ObjectId(supplierId);
    }

    if (productId && mongoose.isValidObjectId(productId)) {
      query.product = new mongoose.Types.ObjectId(productId);
    }

    if (harvestBatchId && mongoose.isValidObjectId(harvestBatchId)) {
      query.harvestBatch = new mongoose.Types.ObjectId(harvestBatchId);
    }

    if (verificationResult && ["PASSED", "FAILED", "CONDITIONAL"].includes(verificationResult)) {
      query.verificationResult = verificationResult;
    }

    // Sort
    const allowedSortFields = ["verifiedAt", "overallScore", "approvedQuantity", "rejectedQuantity", "createdAt", "updatedAt"];
    const sortField = allowedSortFields.includes(sortBy) ? sortBy : "verifiedAt";
    const sortDirection = sortOrder === "asc" ? 1 : -1;
    const sortObj = { [sortField]: sortDirection };

    const [data, total] = await Promise.all([
      QualityVerificationModel.find(query)
        .populate("supplier", "name type")
        .populate("product", "name brand")
        .populate("harvestBatch", "batchNumber harvestDate")
        .populate("verifiedBy", "user_name email")
        .sort(sortObj)
        .skip(skip)
        .limit(limitNum)
        .lean(),
      QualityVerificationModel.countDocuments(query),
    ]);

    return {
      status: "OK",
      message: "Lấy danh sách xác minh chất lượng thành công",
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
 * Lấy chi tiết xác minh chất lượng
 */
const getQualityVerificationById = async (verificationId) => {
  try {
    if (!mongoose.isValidObjectId(verificationId)) {
      return { status: "ERR", message: "ID xác minh chất lượng không hợp lệ" };
    }

    const verification = await QualityVerificationModel.findById(verificationId)
      .populate("supplier", "name type")
      .populate("product", "name brand")
      .populate("harvestBatch", "batchNumber harvestDate")
      .populate("verifiedBy", "user_name email")
      .lean();

    if (!verification) {
      return { status: "ERR", message: "Xác minh chất lượng không tồn tại" };
    }

    return {
      status: "OK",
      message: "Lấy chi tiết xác minh chất lượng thành công",
      data: verification,
    };
  } catch (error) {
    return { status: "ERR", message: error.message };
  }
};

/**
 * Cập nhật quality verification (QC Staff) - chỉ cho phép sửa nếu chưa nhập kho
 */
const updateQualityVerification = async (verificationId, userId, payload = {}) => {
  try {
    if (!mongoose.isValidObjectId(verificationId)) {
      return { status: "ERR", message: "verificationId không hợp lệ" };
    }

    const verification = await QualityVerificationModel.findById(verificationId);
    if (!verification) {
      return { status: "ERR", message: "Xác minh chất lượng không tồn tại" };
    }

    // Không cho sửa nếu harvestBatch đã nhập kho
    if (verification.harvestBatch) {
      const harvestBatch = await HarvestBatchModel.findById(verification.harvestBatch);
      if (harvestBatch && harvestBatch.receivedQuantity > 0) {
        return {
          status: "ERR",
          message: "Không thể chỉnh sửa xác minh chất lượng của lô thu hoạch đã được nhập kho (receivedQuantity > 0)",
        };
      }
    }

    const changes = new Map();

    // Whitelist fields có thể sửa
    if (payload.verificationResult !== undefined) {
      if (!["PASSED", "FAILED", "CONDITIONAL"].includes(payload.verificationResult)) {
        return { status: "ERR", message: "verificationResult phải là PASSED, FAILED hoặc CONDITIONAL" };
      }
      if (verification.verificationResult !== payload.verificationResult) {
        changes.set("verificationResult", { old: verification.verificationResult, new: payload.verificationResult });
        verification.verificationResult = payload.verificationResult;
      }
    }

    if (payload.approvedQuantity !== undefined) {
      const approvedQty = Number(payload.approvedQuantity);
      if (!Number.isInteger(approvedQty) || approvedQty < 0) {
        return { status: "ERR", message: "approvedQuantity phải là số nguyên >= 0" };
      }
      if (verification.approvedQuantity !== approvedQty) {
        changes.set("approvedQuantity", { old: verification.approvedQuantity, new: approvedQty });
        verification.approvedQuantity = approvedQty;
      }
    }

    if (payload.rejectedQuantity !== undefined) {
      const rejectedQty = Number(payload.rejectedQuantity);
      if (!Number.isInteger(rejectedQty) || rejectedQty < 0) {
        return { status: "ERR", message: "rejectedQuantity phải là số nguyên >= 0" };
      }
      if (verification.rejectedQuantity !== rejectedQty) {
        changes.set("rejectedQuantity", { old: verification.rejectedQuantity, new: rejectedQty });
        verification.rejectedQuantity = rejectedQty;
      }
    }

    // Validate sau khi update
    if (verification.approvedQuantity + verification.rejectedQuantity === 0) {
      return {
        status: "ERR",
        message: "Tổng approvedQuantity + rejectedQuantity phải lớn hơn 0",
      };
    }

    if (verification.verificationResult === "PASSED" && verification.approvedQuantity === 0) {
      return {
        status: "ERR",
        message: "Nếu kết quả kiểm tra là PASSED, approvedQuantity phải lớn hơn 0",
      };
    }

    if (payload.criteria !== undefined) {
      const criteriaFields = ["appearance", "freshness", "size", "color", "defects"];
      for (const field of criteriaFields) {
        if (payload.criteria[field] !== undefined) {
          const value = Number(payload.criteria[field]);
          if (!Number.isFinite(value) || value < 0 || value > 10) {
            return {
              status: "ERR",
              message: `Criteria.${field} phải là số từ 0 đến 10`,
            };
          }
          if (verification.criteria[field] !== value) {
            if (!changes.has("criteria")) changes.set("criteria", { old: verification.criteria, new: {} });
            changes.get("criteria").new[field] = value;
            verification.criteria[field] = value;
          }
        }
      }
    }

    if (payload.notes !== undefined) {
      const newNotes = payload.notes?.toString().trim() || "";
      if (verification.notes !== newNotes) {
        changes.set("notes", { old: verification.notes, new: newNotes });
        verification.notes = newNotes;
      }
    }

    await verification.save();

    // Cập nhật harvestBatch status nếu có
    if (verification.harvestBatch) {
      const harvestBatch = await HarvestBatchModel.findById(verification.harvestBatch);
      if (harvestBatch) {
        if (verification.verificationResult === "PASSED") {
          harvestBatch.status = "APPROVED";
        } else if (verification.verificationResult === "FAILED") {
          harvestBatch.status = "REJECTED";
        } else {
          harvestBatch.status = "APPROVED";
        }
        await harvestBatch.save();
      }
    }

    // Log activity nếu có thay đổi
    if (changes.size > 0) {
      await SupplierActivityLogModel.create({
        supplier: verification.supplier,
        action: "QUALITY_VERIFICATION_UPDATED",
        description: `Cập nhật xác minh chất lượng: ${verification.verificationResult}`,
        relatedEntity: "QUALITY_VERIFICATION",
        relatedEntityId: verification._id,
        changes: changes,
        performedBy: new mongoose.Types.ObjectId(userId),
      });
    }

    const populated = await QualityVerificationModel.findById(verification._id)
      .populate("supplier", "name type")
      .populate("product", "name brand")
      .populate("harvestBatch", "batchNumber harvestDate")
      .populate("verifiedBy", "user_name email")
      .lean();

    return {
      status: "OK",
      message: "Cập nhật xác minh chất lượng thành công",
      data: populated,
    };
  } catch (error) {
    return { status: "ERR", message: error.message };
  }
};

/**
 * Xóa quality verification (QC Staff) - chỉ cho phép xóa nếu chưa nhập kho
 */
const deleteQualityVerification = async (verificationId, userId) => {
  try {
    if (!mongoose.isValidObjectId(verificationId)) {
      return { status: "ERR", message: "verificationId không hợp lệ" };
    }

    const verification = await QualityVerificationModel.findById(verificationId);
    if (!verification) {
      return { status: "ERR", message: "Xác minh chất lượng không tồn tại" };
    }

    // Không cho xóa nếu harvestBatch đã nhập kho
    if (verification.harvestBatch) {
      const harvestBatch = await HarvestBatchModel.findById(verification.harvestBatch);
      if (harvestBatch && harvestBatch.receivedQuantity > 0) {
        return {
          status: "ERR",
          message: "Không thể xóa xác minh chất lượng của lô thu hoạch đã được nhập kho (receivedQuantity > 0)",
        };
      }

      // Reset harvestBatch status về PENDING
      harvestBatch.status = "PENDING";
      await harvestBatch.save();
    }

    const supplierId = verification.supplier;
    await verification.deleteOne();

    // Log activity
    await SupplierActivityLogModel.create({
      supplier: supplierId,
      action: "QUALITY_VERIFICATION_DELETED",
      description: `Xóa xác minh chất lượng: ${verification.verificationResult}`,
      relatedEntity: "QUALITY_VERIFICATION",
      relatedEntityId: verification._id,
      performedBy: new mongoose.Types.ObjectId(userId),
    });

    return {
      status: "OK",
      message: "Xóa xác minh chất lượng thành công",
    };
  } catch (error) {
    return { status: "ERR", message: error.message };
  }
};

module.exports = {
  verifyQuality,
  getQualityVerifications,
  getQualityVerificationById,
  updateQualityVerification,
  deleteQualityVerification,
};
