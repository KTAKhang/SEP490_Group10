const mongoose = require("mongoose");
const InventoryTransactionModel = require("../models/InventoryTransactionModel");
const ProductModel = require("../models/ProductModel");
const { getTodayInVietnam, formatDateVN, compareDates, calculateDaysBetween } = require("../utils/dateVN");

// Build receivingStatus expression based on updated fields
const receivingStatusExpr = () => ({
  $switch: {
    branches: [
      // received <= 0 -> NOT_RECEIVED
      { case: { $lte: ["$receivedQuantity", 0] }, then: "NOT_RECEIVED" },
      // received < planned -> PARTIAL
      { case: { $lt: ["$receivedQuantity", "$plannedQuantity"] }, then: "PARTIAL" },
    ],
    default: "RECEIVED",
  },
});

const stockStatusExpr = () => ({
  $cond: [{ $gt: ["$onHandQuantity", 0] }, "IN_STOCK", "OUT_OF_STOCK"],
});

/**
 * Nhập kho (RECEIPT) - atomic & chống lệch khi concurrent
 * Rules:
 * - receivedQuantity + x <= plannedQuantity
 * - receivedQuantity += x
 * - onHandQuantity += x
 * - Nếu là lần nhập đầu tiên (receivedQuantity = 0), tự động set warehouseEntryDate = ngày hiện tại
 * - Nhận expiryDate từ payload (date picker) hoặc shelfLifeDays (số ngày)
 * - Validate: expiryDate >= ngày hiện tại + 1 ngày
 */
const createReceipt = async (userId, payload = {}) => {
  const { productId, quantity, expiryDate, shelfLifeDays, note = "", referenceType = "", referenceId = null } = payload;

  if (!mongoose.isValidObjectId(productId)) {
    return { status: "ERR", message: "productId không hợp lệ" };
  }

  const qty = Number(quantity);
  if (!Number.isFinite(qty) || qty <= 0 || !Number.isInteger(qty)) {
    return { status: "ERR", message: "Số lượng nhập kho phải là số nguyên lớn hơn 0" };
  }

  // ✅ Lấy ngày hiện tại theo timezone Asia/Ho_Chi_Minh (date-only)
  const today = getTodayInVietnam();

  // Validate expiryDate hoặc shelfLifeDays
  let finalExpiryDate = null;
  let shelfLife = null;

  // Ưu tiên expiryDate từ date picker
  if (expiryDate !== undefined && expiryDate !== null) {
    try {
      finalExpiryDate = new Date(expiryDate);
      if (isNaN(finalExpiryDate.getTime())) {
        return { status: "ERR", message: "expiryDate không hợp lệ" };
      }
      
      // Reset về 00:00:00 để so sánh ngày
      finalExpiryDate.setHours(0, 0, 0, 0);
      
      // ✅ Validate: expiryDate >= ngày hiện tại + 1 ngày (theo timezone Vietnam)
      const minDate = new Date(today);
      minDate.setDate(minDate.getDate() + 1);
      
      if (finalExpiryDate < minDate) {
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
  } 
  // Nếu không có expiryDate, dùng shelfLifeDays (backward compatible)
  else if (shelfLifeDays !== undefined && shelfLifeDays !== null) {
    shelfLife = Number(shelfLifeDays);
    if (!Number.isFinite(shelfLife) || shelfLife <= 0 || !Number.isInteger(shelfLife)) {
      return { status: "ERR", message: "shelfLifeDays phải là số nguyên > 0" };
    }
  }

  // OPTIONAL: referenceId nếu có thì phải là ObjectId
  const refIdValue = referenceId
    ? mongoose.isValidObjectId(referenceId)
      ? new mongoose.Types.ObjectId(referenceId)
      : null
    : null;
  if (referenceId && !refIdValue) {
    return { status: "ERR", message: "referenceId không hợp lệ" };
  }

  const session = await mongoose.startSession();
  try {
    let updatedProduct = null;
    let txDoc = null;

    await session.withTransaction(async () => {
      // Lấy product hiện tại để check receivedQuantity trước đó
      const currentProduct = await ProductModel.findById(productId).session(session);
      if (!currentProduct) {
        throw new Error("Sản phẩm không tồn tại");
      }

      // ✅ Validate: Nếu đã có expiryDate (Date hoặc Str) mà payload gửi expiryDate mới → trả lỗi
      // Check bằng cả Date + Str để khỏi lọt data cũ
      const hasExpiry = !!(currentProduct.expiryDate || currentProduct.expiryDateStr);
      if (hasExpiry && (finalExpiryDate !== null || shelfLife !== null)) {
        throw new Error("Hạn sử dụng đã được thiết lập và không thể thay đổi. Không thể đặt lại hạn sử dụng.");
      }

      // ✅ Lưu warehouseEntryDate là date-only (YYYY-MM-DD) theo timezone Asia/Ho_Chi_Minh
      const warehouseEntryDate = getTodayInVietnam();
      const warehouseEntryDateStr = formatDateVN(warehouseEntryDate);
      const todayStr = formatDateVN(today);

      // ✅ Logic: Nếu đã có warehouseEntryDate, chỉ cho phép nhập trong cùng ngày (theo timezone Vietnam)
      // So sánh bằng string để đơn giản và chắc chắn hơn
      if (currentProduct.warehouseEntryDateStr) {
        if (todayStr !== currentProduct.warehouseEntryDateStr) {
          throw new Error("Đơn hàng nhập kho phải hoàn thành trong cùng ngày (theo timezone Asia/Ho_Chi_Minh). Không thể nhập thêm vào ngày khác.");
        }
      } else if (currentProduct.warehouseEntryDate) {
        // Fallback: nếu chưa có Str nhưng có Date (data cũ)
        const existingEntryDate = new Date(currentProduct.warehouseEntryDate);
        existingEntryDate.setHours(0, 0, 0, 0);
        if (!compareDates(today, existingEntryDate)) {
          throw new Error("Đơn hàng nhập kho phải hoàn thành trong cùng ngày (theo timezone Asia/Ho_Chi_Minh). Không thể nhập thêm vào ngày khác.");
        }
      }

      // ✅ Logic mới: Cho phép nhập nhiều lần trong ngày dù đã set expiryDate
      // (Chỉ chặn khi qua ngày khác, không chặn khi đã set expiryDate)

      // ✅ Tính toán expiryDate và shelfLifeDays trước (nếu có)
      let expiryDateToSet = null;
      let expiryDateStrToSet = null;
      let shelfLifeDaysToSet = null;
      const existingEntryDate = currentProduct.warehouseEntryDate 
        ? new Date(currentProduct.warehouseEntryDate) 
        : warehouseEntryDate;
      existingEntryDate.setHours(0, 0, 0, 0);

      if (finalExpiryDate !== null) {
        const diffDays = calculateDaysBetween(existingEntryDate, finalExpiryDate);
        if (diffDays <= 0) {
          throw new Error("Hạn sử dụng phải sau ngày nhập kho");
        }
        expiryDateToSet = finalExpiryDate;
        expiryDateStrToSet = formatDateVN(finalExpiryDate);
        shelfLifeDaysToSet = diffDays;
      } else if (shelfLife !== null) {
        const calculatedExpiryDate = new Date(existingEntryDate);
        calculatedExpiryDate.setDate(calculatedExpiryDate.getDate() + shelfLife);
        calculatedExpiryDate.setHours(0, 0, 0, 0);
        expiryDateToSet = calculatedExpiryDate;
        expiryDateStrToSet = formatDateVN(calculatedExpiryDate);
        shelfLifeDaysToSet = shelfLife;
      }

      // ✅ Atomic update: gộp logic set warehouseEntryDate và expiryDate vào pipeline để tránh race condition
      const updatePipeline = [
        {
          $set: {
            receivedQuantity: { $add: ["$receivedQuantity", qty] },
            onHandQuantity: { $add: ["$onHandQuantity", qty] },
            // ✅ Atomic set warehouseEntryDate chỉ khi chưa có (tránh race condition)
            warehouseEntryDate: { $ifNull: ["$warehouseEntryDate", warehouseEntryDate] },
            warehouseEntryDateStr: { $ifNull: ["$warehouseEntryDateStr", warehouseEntryDateStr] },
          },
        },
      ];

      // ✅ Atomic set expiryDate chỉ khi chưa có và có giá trị mới
      if (expiryDateToSet !== null) {
        updatePipeline.push({
          $set: {
            expiryDate: { $ifNull: ["$expiryDate", expiryDateToSet] },
            expiryDateStr: { $ifNull: ["$expiryDateStr", expiryDateStrToSet] },
            shelfLifeDays: { $ifNull: ["$shelfLifeDays", shelfLifeDaysToSet] },
          },
        });
      }

      updatePipeline.push({
        $set: {
          receivingStatus: receivingStatusExpr(),
          stockStatus: stockStatusExpr(),
        },
      });

      // Atomic condition: received + qty <= planned
      updatedProduct = await ProductModel.findOneAndUpdate(
        {
          _id: new mongoose.Types.ObjectId(productId),
          $expr: {
            $lte: [{ $add: ["$receivedQuantity", qty] }, "$plannedQuantity"],
          },
        },
        updatePipeline,
        { new: true, session, runValidators: true }
      );

      if (!updatedProduct) {
        throw new Error("Nhập vượt kế hoạch (plannedQuantity)");
      }

      const created = await InventoryTransactionModel.create(
        [
          {
            product: new mongoose.Types.ObjectId(productId),
            type: "RECEIPT",
            quantity: qty,
            createdBy: new mongoose.Types.ObjectId(userId),
            note: note?.toString?.() ? note.toString() : "",
            referenceType: referenceType?.toString?.() ? referenceType.toString() : "",
            referenceId: refIdValue,
          },
        ],
        { session }
      );
      txDoc = created[0];
    });

    const populatedTx = await InventoryTransactionModel.findById(txDoc._id)
      .populate("product", "name plannedQuantity receivedQuantity onHandQuantity reservedQuantity receivingStatus stockStatus")
      .populate("createdBy", "user_name email")
      .lean();

    return {
      status: "OK",
      message: "Nhập kho thành công",
      data: {
        transaction: populatedTx,
        product: updatedProduct,
      },
    };
  } catch (error) {
    return { status: "ERR", message: error.message };
  } finally {
    session.endSession();
  }
};

module.exports = {
  createReceipt,
};

