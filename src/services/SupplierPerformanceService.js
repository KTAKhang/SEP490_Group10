const mongoose = require("mongoose");
const SupplierPerformanceModel = require("../models/SupplierPerformanceModel");
const SupplierModel = require("../models/SupplierModel");
const SupplierActivityLogModel = require("../models/SupplierActivityLogModel");

/**
 * Đánh giá hiệu suất nhà cung cấp (QC Staff)
 */
const evaluatePerformance = async (userId, payload = {}) => {
  try {
    const {
      supplierId,
      period,
      metrics,
      notes,
    } = payload;

    if (!mongoose.isValidObjectId(supplierId)) {
      return { status: "ERR", message: "supplierId không hợp lệ" };
    }

    if (!period || !/^\d{4}-\d{2}$/.test(period)) {
      return { status: "ERR", message: "period phải có format YYYY-MM" };
    }

    // ✅ Validation: period phải là tháng hiện tại hoặc quá khứ, không được tương lai
    const [year, month] = period.split("-").map(Number);
    const periodDate = new Date(year, month - 1, 1);
    const today = new Date();
    const currentPeriod = new Date(today.getFullYear(), today.getMonth(), 1);
    if (periodDate > currentPeriod) {
      return {
        status: "ERR",
        message: "Period không được là tháng tương lai. Chỉ có thể đánh giá cho tháng hiện tại hoặc quá khứ.",
      };
    }

    // ✅ Validation: metrics không được null/undefined nếu tạo mới
    const isNew = !(await SupplierPerformanceModel.findOne({
      supplier: new mongoose.Types.ObjectId(supplierId),
      period,
    }));
    if (isNew && !metrics) {
      return {
        status: "ERR",
        message: "Khi tạo mới performance evaluation, metrics là bắt buộc.",
      };
    }

    const supplier = await SupplierModel.findById(supplierId);
    if (!supplier) {
      return { status: "ERR", message: "Nhà cung cấp không tồn tại" };
    }

    // Kiểm tra đã có performance cho period này chưa
    let performance = await SupplierPerformanceModel.findOne({
      supplier: new mongoose.Types.ObjectId(supplierId),
      period,
    });

    if (performance) {
      // Cập nhật
      if (metrics) {
        if (metrics.qualityRate !== undefined) {
          performance.metrics.qualityRate = Math.max(0, Math.min(100, Number(metrics.qualityRate) || 0));
        }
        if (metrics.onTimeDeliveryRate !== undefined) {
          performance.metrics.onTimeDeliveryRate = Math.max(0, Math.min(100, Number(metrics.onTimeDeliveryRate) || 0));
        }
        if (metrics.totalQuantitySupplied !== undefined) {
          performance.metrics.totalQuantitySupplied = Math.max(0, Number(metrics.totalQuantitySupplied) || 0);
        }
        if (metrics.totalBatches !== undefined) {
          performance.metrics.totalBatches = Math.max(0, Number(metrics.totalBatches) || 0);
        }
        if (metrics.rejectedBatches !== undefined) {
          const rejectedBatches = Math.max(0, Number(metrics.rejectedBatches) || 0);
          // ✅ Validation: rejectedBatches không được lớn hơn totalBatches
          if (rejectedBatches > performance.metrics.totalBatches) {
            return {
              status: "ERR",
              message: `rejectedBatches (${rejectedBatches}) không được lớn hơn totalBatches (${performance.metrics.totalBatches})`,
            };
          }
          performance.metrics.rejectedBatches = rejectedBatches;
        }
        if (metrics.averageQualityScore !== undefined) {
          performance.metrics.averageQualityScore = Math.max(0, Math.min(100, Number(metrics.averageQualityScore) || 0));
        }
      }
      if (notes !== undefined) {
        performance.notes = notes?.toString().trim() || "";
      }
      performance.evaluatedBy = new mongoose.Types.ObjectId(userId);
    } else {
      // Tạo mới
      const rejectedBatchesValue = Math.max(0, Number(metrics?.rejectedBatches) || 0);
      const totalBatchesValue = Math.max(0, Number(metrics?.totalBatches) || 0);

      // ✅ Validation: rejectedBatches không được lớn hơn totalBatches
      if (rejectedBatchesValue > totalBatchesValue) {
        return {
          status: "ERR",
          message: `rejectedBatches (${rejectedBatchesValue}) không được lớn hơn totalBatches (${totalBatchesValue})`,
        };
      }

      performance = new SupplierPerformanceModel({
        supplier: new mongoose.Types.ObjectId(supplierId),
        period,
        metrics: {
          qualityRate: Math.max(0, Math.min(100, Number(metrics?.qualityRate) || 0)),
          onTimeDeliveryRate: Math.max(0, Math.min(100, Number(metrics?.onTimeDeliveryRate) || 0)),
          totalQuantitySupplied: Math.max(0, Number(metrics?.totalQuantitySupplied) || 0),
          totalBatches: totalBatchesValue,
          rejectedBatches: rejectedBatchesValue,
          averageQualityScore: Math.max(0, Math.min(100, Number(metrics?.averageQualityScore) || 0)),
        },
        notes: notes?.toString().trim() || "",
        evaluatedBy: new mongoose.Types.ObjectId(userId),
      });
    }

    await performance.save();

    // Cập nhật performanceScore của supplier (lấy từ performance mới nhất)
    const latestPerformance = await SupplierPerformanceModel.findOne({
      supplier: new mongoose.Types.ObjectId(supplierId),
    }).sort({ period: -1 });

    if (latestPerformance) {
      supplier.performanceScore = latestPerformance.overallScore;
      await supplier.save();
    }

    // Log activity
    await SupplierActivityLogModel.create({
      supplier: supplier._id,
      action: "PERFORMANCE_EVALUATED",
      description: `Đánh giá hiệu suất: Kỳ ${period} - Điểm: ${performance.overallScore}`,
      relatedEntity: "PERFORMANCE",
      relatedEntityId: performance._id,
      changes: new Map([["overallScore", performance.overallScore], ["rating", performance.rating]]),
      performedBy: new mongoose.Types.ObjectId(userId),
    });

    const populated = await SupplierPerformanceModel.findById(performance._id)
      .populate("supplier", "name type")
      .populate("evaluatedBy", "user_name email")
      .lean();

    return {
      status: "OK",
      message: "Đánh giá hiệu suất thành công",
      data: populated,
    };
  } catch (error) {
    return { status: "ERR", message: error.message };
  }
};

/**
 * Lấy danh sách đánh giá hiệu suất nhà cung cấp (QC Staff)
 */
const getPerformances = async (filters = {}) => {
  try {
    const {
      page = 1,
      limit = 20,
      search = "",
      supplierId,
      period,
      rating,
      minScore,
      maxScore,
      sortBy = "period",
      sortOrder = "desc",
    } = filters;

    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit) || 20));
    const skip = (pageNum - 1) * limitNum;

    const query = {};

    // Search (theo period, notes, rating)
    if (search) {
      query.$or = [
        { period: { $regex: search, $options: "i" } },
        { notes: { $regex: search, $options: "i" } },
        { rating: { $regex: search, $options: "i" } },
      ];
    }

    // Filter
    if (supplierId && mongoose.isValidObjectId(supplierId)) {
      query.supplier = new mongoose.Types.ObjectId(supplierId);
    }

    if (period && /^\d{4}-\d{2}$/.test(period)) {
      query.period = period;
    }

    if (rating && ["EXCELLENT", "GOOD", "FAIR", "POOR"].includes(rating)) {
      query.rating = rating;
    }

    if (minScore !== undefined || maxScore !== undefined) {
      query.overallScore = {};
      if (minScore !== undefined) {
        const min = Number(minScore);
        if (Number.isFinite(min)) {
          query.overallScore.$gte = min;
        }
      }
      if (maxScore !== undefined) {
        const max = Number(maxScore);
        if (Number.isFinite(max)) {
          query.overallScore.$lte = max;
        }
      }
    }

    // Sort
    const allowedSortFields = ["period", "overallScore", "rating", "createdAt", "updatedAt"];
    const sortField = allowedSortFields.includes(sortBy) ? sortBy : "period";
    const sortDirection = sortOrder === "asc" ? 1 : -1;
    const sortObj = { [sortField]: sortDirection };

    const [data, total] = await Promise.all([
      SupplierPerformanceModel.find(query)
        .populate("supplier", "name type cooperationStatus")
        .populate("evaluatedBy", "user_name email")
        .sort(sortObj)
        .skip(skip)
        .limit(limitNum)
        .lean(),
      SupplierPerformanceModel.countDocuments(query),
    ]);

    return {
      status: "OK",
      message: "Lấy danh sách đánh giá hiệu suất thành công",
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
 * Lấy chi tiết đánh giá hiệu suất nhà cung cấp
 */
const getPerformanceById = async (performanceId) => {
  try {
    if (!mongoose.isValidObjectId(performanceId)) {
      return { status: "ERR", message: "ID đánh giá hiệu suất không hợp lệ" };
    }

    const performance = await SupplierPerformanceModel.findById(performanceId)
      .populate("supplier", "name type cooperationStatus")
      .populate("evaluatedBy", "user_name email")
      .lean();

    if (!performance) {
      return { status: "ERR", message: "Đánh giá hiệu suất không tồn tại" };
    }

    return {
      status: "OK",
      message: "Lấy chi tiết đánh giá hiệu suất thành công",
      data: performance,
    };
  } catch (error) {
    return { status: "ERR", message: error.message };
  }
};

/**
 * Xóa đánh giá hiệu suất nhà cung cấp (QC Staff)
 */
const deletePerformance = async (performanceId, userId) => {
  try {
    if (!mongoose.isValidObjectId(performanceId)) {
      return { status: "ERR", message: "performanceId không hợp lệ" };
    }

    const performance = await SupplierPerformanceModel.findById(performanceId);
    if (!performance) {
      return { status: "ERR", message: "Đánh giá hiệu suất không tồn tại" };
    }

    const supplierId = performance.supplier;
    await performance.deleteOne();

    // Cập nhật performanceScore của supplier (lấy từ performance mới nhất)
    const supplier = await SupplierModel.findById(supplierId);
    if (supplier) {
      const latestPerformance = await SupplierPerformanceModel.findOne({
        supplier: supplierId,
      }).sort({ period: -1 });

      if (latestPerformance) {
        supplier.performanceScore = latestPerformance.overallScore;
      } else {
        supplier.performanceScore = 0;
      }
      await supplier.save();
    }

    // Log activity
    await SupplierActivityLogModel.create({
      supplier: supplierId,
      action: "PERFORMANCE_DELETED",
      description: `Xóa đánh giá hiệu suất: Kỳ ${performance.period}`,
      relatedEntity: "PERFORMANCE",
      relatedEntityId: performance._id,
      performedBy: new mongoose.Types.ObjectId(userId),
    });

    return {
      status: "OK",
      message: "Xóa đánh giá hiệu suất thành công",
    };
  } catch (error) {
    return { status: "ERR", message: error.message };
  }
};

module.exports = {
  evaluatePerformance,
  getPerformances,
  getPerformanceById,
  deletePerformance,
};
