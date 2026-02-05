const mongoose = require("mongoose");
const HarvestBatchModel = require("../models/HarvestBatchModel");
const SupplierModel = require("../models/SupplierModel");
const ProductModel = require("../models/ProductModel");


/**
 * Tạo lô thu hoạch (Admin)
 */
const createHarvestBatch = async (payload = {}) => {
  try {
    const {
      supplierId,
      productId,
      batchNumber,
      harvestDate,
      location,
      notes,
    } = payload;


    if (!mongoose.isValidObjectId(supplierId)) {
      return { status: "ERR", message: "Invalid supplierId" };
    }


    if (!mongoose.isValidObjectId(productId)) {
      return { status: "ERR", message: "Invalid productId" };
    }


    if (!batchNumber || !batchNumber.toString().trim()) {
      return { status: "ERR", message: "Batch number is required" };
    }


    if (!harvestDate) {
      return { status: "ERR", message: "Harvest date is required" };
    }


    // ✅ BR-SUP-12: Validation harvestDate không được lớn hơn ngày hiện tại
    const harvestDateObj = new Date(harvestDate);
    harvestDateObj.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (harvestDateObj > today) {
      return {
        status: "ERR",
        message: "Harvest date cannot be later than today",
      };
    }

    // Kiểm tra supplier và product tồn tại
    const supplier = await SupplierModel.findById(supplierId);
    if (!supplier) {
      return { status: "ERR", message: "Supplier does not exist" };
    }


    const product = await ProductModel.findById(productId);
    if (!product) {
      return { status: "ERR", message: "Product does not exist" };
    }


    // ✅ BR-SUP-26: Không cho tạo harvest batch với supplier SUSPENDED/TERMINATED
    if (supplier.cooperationStatus !== "ACTIVE") {
      return {
        status: "ERR",
        message: `Không thể tạo lô thu hoạch cho nhà cung cấp có trạng thái ${supplier.cooperationStatus}. Chỉ nhà cung cấp ACTIVE mới được phép.`
      };
    }


    // ✅ Validation: product phải có supplier trùng với supplierId
    if (!product.supplier || product.supplier.toString() !== supplierId) {
      return {
        status: "ERR",
        message: `Product "${product.name}" does not belong to supplier "${supplier.name}". Please choose a product from this supplier.`,
      };
    }

    // ✅ Validation: cùng supplier + product + ngày thu hoạch thì batchNumber không được trùng
    const harvestDateNormalized = new Date(harvestDate);
    harvestDateNormalized.setHours(0, 0, 0, 0);
    const batchNumberTrimmed = batchNumber.toString().trim();
    const existingSameDay = await HarvestBatchModel.findOne({
      supplier: new mongoose.Types.ObjectId(supplierId),
      product: new mongoose.Types.ObjectId(productId),
      batchNumber: batchNumberTrimmed,
      harvestDate: { $gte: harvestDateNormalized, $lt: new Date(harvestDateNormalized.getTime() + 24 * 60 * 60 * 1000) },
    });
    if (existingSameDay) {
      return {
        status: "ERR",
        message: `Số lô "${batchNumberTrimmed}" đã tồn tại cho sản phẩm này trong cùng ngày thu hoạch. Vui lòng chọn số lô khác.`,
      };
    }


    const harvestBatch = new HarvestBatchModel({
      supplier: new mongoose.Types.ObjectId(supplierId),
      product: new mongoose.Types.ObjectId(productId),
      batchNumber: batchNumberTrimmed,
      harvestDate: new Date(harvestDate),
      location: location?.toString().trim() || "",
      notes: notes?.toString().trim() || "",
    });


    await harvestBatch.save();


    // Cập nhật thống kê supplier
    supplier.totalBatches = (supplier.totalBatches || 0) + 1;
    await supplier.save();


    const populated = await HarvestBatchModel.findById(harvestBatch._id)
      .populate("supplier", "name type")
      .populate("product", "name brand")
      .lean();


    return {
      status: "OK",
      message: "Harvest batch created successfully",
      data: populated,
    };
  } catch (error) {
    return { status: "ERR", message: error.message };
  }
};


/**
 * Cập nhật lô thu hoạch (Admin)
 */
const updateHarvestBatch = async (harvestBatchId, payload = {}) => {
  try {
    if (!mongoose.isValidObjectId(harvestBatchId)) {
      return { status: "ERR", message: "Invalid harvestBatchId" };
    }


    const harvestBatch = await HarvestBatchModel.findById(harvestBatchId);
    if (!harvestBatch) {
      return { status: "ERR", message: "Harvest batch does not exist" };
    }


    // Không cho sửa nếu đã nhập kho (receivedQuantity > 0)
    if (harvestBatch.receivedQuantity > 0) {
      return {
        status: "ERR",
        message: "Cannot edit a harvest batch that has already been received (receivedQuantity > 0)",
      };
    }


    // Whitelist fields có thể sửa
    const allowed = ["batchNumber", "harvestDate", "location", "notes", "receiptEligible", "visibleInReceipt"];
    for (const key of Object.keys(payload)) {
      if (!allowed.includes(key)) delete payload[key];
    }


    const changes = new Map();


    if (payload.batchNumber !== undefined) {
      const newBatchNumber = payload.batchNumber?.toString().trim() || "";
      if (!newBatchNumber) {
        return { status: "ERR", message: "Batch number cannot be empty" };
      }
      if (harvestBatch.batchNumber !== newBatchNumber) {
        // ✅ Validation: cùng supplier + product + ngày thu hoạch thì batchNumber không được trùng
        const harvestDateNorm = harvestBatch.harvestDate ? new Date(harvestBatch.harvestDate) : null;
        if (harvestDateNorm) {
          harvestDateNorm.setHours(0, 0, 0, 0);
          const endOfDay = new Date(harvestDateNorm.getTime() + 24 * 60 * 60 * 1000);
          const existingSameDay = await HarvestBatchModel.findOne({
            supplier: harvestBatch.supplier,
            product: harvestBatch.product,
            batchNumber: newBatchNumber,
            harvestDate: { $gte: harvestDateNorm, $lt: endOfDay },
            _id: { $ne: harvestBatchId },
          });
          if (existingSameDay) {
            return {
              status: "ERR",
              message: `Số lô "${newBatchNumber}" đã tồn tại cho sản phẩm này trong cùng ngày thu hoạch. Vui lòng chọn số lô khác.`,
            };
          }
        }
        changes.set("batchNumber", { old: harvestBatch.batchNumber, new: newBatchNumber });
        harvestBatch.batchNumber = newBatchNumber;
      }
    }


    if (payload.harvestDate !== undefined) {
      const harvestDateObj = new Date(payload.harvestDate);
      harvestDateObj.setHours(0, 0, 0, 0);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (harvestDateObj > today) {
        return {
          status: "ERR",
          message: "Harvest date cannot be later than today",
        };
      }
      changes.set("harvestDate", { old: harvestBatch.harvestDate, new: harvestDateObj });
      harvestBatch.harvestDate = harvestDateObj;
    }


    if (payload.location !== undefined) {
      const newLocation = payload.location?.toString().trim() || "";
      if (harvestBatch.location !== newLocation) {
        changes.set("location", { old: harvestBatch.location, new: newLocation });
        harvestBatch.location = newLocation;
      }
    }
    if (payload.notes !== undefined) {
      const newNotes = payload.notes?.toString().trim() || "";
      if (harvestBatch.notes !== newNotes) {
        changes.set("notes", { old: harvestBatch.notes, new: newNotes });
        harvestBatch.notes = newNotes;
      }
    }
    if (payload.receiptEligible !== undefined) {
      harvestBatch.receiptEligible = payload.receiptEligible === true || payload.receiptEligible === "true";
    }
    if (payload.visibleInReceipt !== undefined) {
      harvestBatch.visibleInReceipt = payload.visibleInReceipt === true || payload.visibleInReceipt === "true";
    }
    await harvestBatch.save();


    const populated = await HarvestBatchModel.findById(harvestBatch._id)
      .populate("supplier", "name type")
      .populate("product", "name brand")
      .lean();


    return {
      status: "OK",
      message: "Harvest batch updated successfully",
      data: populated,
    };
  } catch (error) {
    return { status: "ERR", message: error.message };
  }
};


/**
 * Xóa lô thu hoạch (Admin)
 */
const deleteHarvestBatch = async (harvestBatchId) => {
  try {
    if (!mongoose.isValidObjectId(harvestBatchId)) {
      return { status: "ERR", message: "Invalid harvestBatchId" };
    }


    const harvestBatch = await HarvestBatchModel.findById(harvestBatchId);
    if (!harvestBatch) {
      return { status: "ERR", message: "Harvest batch does not exist" };
    }


    // Không cho xóa nếu đã nhập kho
    if (harvestBatch.receivedQuantity > 0) {
      return {
        status: "ERR",
        message: "Cannot delete a harvest batch that has already been received (receivedQuantity > 0)",
      };
    }


    const supplierId = harvestBatch.supplier;
    await harvestBatch.deleteOne();


    // Cập nhật thống kê supplier
    const supplier = await SupplierModel.findById(supplierId);
    if (supplier && supplier.totalBatches > 0) {
      supplier.totalBatches = Math.max(0, supplier.totalBatches - 1);
      await supplier.save();
    }


    return {
      status: "OK",
      message: "Harvest batch deleted successfully",
    };
  } catch (error) {
    return { status: "ERR", message: error.message };
  }
};


/**
 * Lấy danh sách lô thu hoạch (Admin)
 */
const getHarvestBatches = async (filters = {}) => {
  try {
    const {
      page = 1,
      limit = 20,
      search = "",
      supplierId,
      productId,
      minReceivedQuantity,
      maxReceivedQuantity,
      harvestDateFrom,
      harvestDateTo,
      createdFrom,
      createdTo,
      updatedFrom,
      updatedTo,
      hasInventoryTransactions,
      receiptEligible,
      visibleInReceipt,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = filters;


    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit) || 20));
    const skip = (pageNum - 1) * limitNum;


    const query = {};


    // Search
    const searchValue = search?.toString().trim();
    if (searchValue) {
      const escaped = searchValue.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(escaped, "i");
      query.$or = [
        { batchNumber: regex },
        { batchCode: regex },
        { location: regex },
        { notes: regex },
      ];
    }


    // Filter
    if (supplierId && mongoose.isValidObjectId(supplierId)) {
      query.supplier = new mongoose.Types.ObjectId(supplierId);
    }


    if (productId && mongoose.isValidObjectId(productId)) {
      query.product = new mongoose.Types.ObjectId(productId);
    }
    if (minReceivedQuantity !== undefined || maxReceivedQuantity !== undefined) {
      query.receivedQuantity = {};
      if (minReceivedQuantity !== undefined && !Number.isNaN(Number(minReceivedQuantity))) {
        query.receivedQuantity.$gte = Number(minReceivedQuantity);
      }
      if (maxReceivedQuantity !== undefined && !Number.isNaN(Number(maxReceivedQuantity))) {
        query.receivedQuantity.$lte = Number(maxReceivedQuantity);
      }
      if (Object.keys(query.receivedQuantity).length === 0) {
        delete query.receivedQuantity;
      }
    }


    if (harvestDateFrom || harvestDateTo) {
      const range = {};
      if (harvestDateFrom) {
        const fromDate = new Date(harvestDateFrom);
        if (!Number.isNaN(fromDate.getTime())) {
          fromDate.setHours(0, 0, 0, 0);
          range.$gte = fromDate;
        }
      }
      if (harvestDateTo) {
        const toDate = new Date(harvestDateTo);
        if (!Number.isNaN(toDate.getTime())) {
          toDate.setHours(23, 59, 59, 999);
          range.$lte = toDate;
        }
      }
      if (Object.keys(range).length > 0) {
        query.harvestDate = range;
      }
    }


    if (createdFrom || createdTo) {
      const range = {};
      if (createdFrom) {
        const fromDate = new Date(createdFrom);
        if (!Number.isNaN(fromDate.getTime())) {
          fromDate.setHours(0, 0, 0, 0);
          range.$gte = fromDate;
        }
      }
      if (createdTo) {
        const toDate = new Date(createdTo);
        if (!Number.isNaN(toDate.getTime())) {
          toDate.setHours(23, 59, 59, 999);
          range.$lte = toDate;
        }
      }
      if (Object.keys(range).length > 0) {
        query.createdAt = range;
      }
    }


    if (updatedFrom || updatedTo) {
      const range = {};
      if (updatedFrom) {
        const fromDate = new Date(updatedFrom);
        if (!Number.isNaN(fromDate.getTime())) {
          fromDate.setHours(0, 0, 0, 0);
          range.$gte = fromDate;
        }
      }
      if (updatedTo) {
        const toDate = new Date(updatedTo);
        if (!Number.isNaN(toDate.getTime())) {
          toDate.setHours(23, 59, 59, 999);
          range.$lte = toDate;
        }
      }
      if (Object.keys(range).length > 0) {
        query.updatedAt = range;
      }
    }


    if (hasInventoryTransactions !== undefined) {
      const hasTx = hasInventoryTransactions === "true" || hasInventoryTransactions === true;
      query.inventoryTransactionIds = hasTx ? { $exists: true, $ne: [] } : { $in: [null, []] };
    }
    // Filter by receipt eligibility (only batches eligible for warehouse receipt)
    if (receiptEligible !== undefined) {
      query.receiptEligible = receiptEligible === "true" || receiptEligible === true;
    }
    // Filter by visibility in receipt selection (hide batches already used)
    if (visibleInReceipt !== undefined) {
      query.visibleInReceipt = visibleInReceipt === "true" || visibleInReceipt === true;
    }
    // Sort
    const allowedSortFields = [
      "batchNumber",
      "batchCode",
      "harvestDate",
      "receivedQuantity",
      "receiptEligible",
      "visibleInReceipt",
      "createdAt",
      "updatedAt",
    ];
    const sortField = allowedSortFields.includes(sortBy) ? sortBy : "createdAt";
    const sortDirection = sortOrder === "asc" || sortOrder === "1" || sortOrder === 1 ? 1 : -1;
    const sortObj = { [sortField]: sortDirection };


    const [data, total] = await Promise.all([
      HarvestBatchModel.find(query)
        .populate("supplier", "name type")
        .populate("product", "name brand")
        .sort(sortObj)
        .skip(skip)
        .limit(limitNum)
        .lean(),
      HarvestBatchModel.countDocuments(query),
    ]);


    return {
      status: "OK",
      message: "Fetched harvest batch list successfully",
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
 * Lấy chi tiết lô thu hoạch
 */
const getHarvestBatchById = async (harvestBatchId) => {
  try {
    if (!mongoose.isValidObjectId(harvestBatchId)) {
      return { status: "ERR", message: "Invalid harvest batch ID" };
    }


    const harvestBatch = await HarvestBatchModel.findById(harvestBatchId)
      .populate("supplier", "name type cooperationStatus")
      .populate("product", "name brand")
      .lean();


    if (!harvestBatch) {
      return { status: "ERR", message: "Harvest batch does not exist" };
    }


    return {
      status: "OK",
      message: "Fetched harvest batch details successfully",
      data: harvestBatch,
    };
  } catch (error) {
    return { status: "ERR", message: error.message };
  }
};


module.exports = {
  createHarvestBatch,
  updateHarvestBatch,
  deleteHarvestBatch,
  getHarvestBatches,
  getHarvestBatchById,
};
