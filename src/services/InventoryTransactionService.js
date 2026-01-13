const mongoose = require("mongoose");
const InventoryTransactionModel = require("../models/InventoryTransactionModel");
const ProductModel = require("../models/ProductModel");

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
  if (!Number.isFinite(qty) || qty <= 0) {
    return { status: "ERR", message: "quantity phải là số > 0" };
  }

  const now = new Date();
  now.setHours(0, 0, 0, 0); // Reset về 00:00:00 để so sánh ngày

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
      
      // Validate: expiryDate >= ngày hiện tại + 1 ngày
      const minDate = new Date(now);
      minDate.setDate(minDate.getDate() + 1);
      
      if (finalExpiryDate < minDate) {
        return { 
          status: "ERR", 
          message: `Hạn sử dụng phải tối thiểu từ ngày ${minDate.toISOString().split('T')[0]} (ngày mai)` 
        };
      }
    } catch (err) {
      return { status: "ERR", message: "expiryDate không hợp lệ" };
    }
  } 
  // Nếu không có expiryDate, dùng shelfLifeDays (backward compatible)
  else if (shelfLifeDays !== undefined && shelfLifeDays !== null) {
    shelfLife = Number(shelfLifeDays);
    if (!Number.isFinite(shelfLife) || shelfLife <= 0) {
      return { status: "ERR", message: "shelfLifeDays phải là số > 0" };
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

      const wasFirstReceipt = (currentProduct.receivedQuantity ?? 0) === 0;
      const warehouseEntryDate = new Date(); // Ngày nhập kho

      // Atomic condition: received + qty <= planned
      updatedProduct = await ProductModel.findOneAndUpdate(
        {
          _id: new mongoose.Types.ObjectId(productId),
          $expr: {
            $lte: [{ $add: ["$receivedQuantity", qty] }, "$plannedQuantity"],
          },
        },
        [
          {
            $set: {
              receivedQuantity: { $add: ["$receivedQuantity", qty] },
              onHandQuantity: { $add: ["$onHandQuantity", qty] },
            },
          },
          {
            $set: {
              receivingStatus: receivingStatusExpr(),
              stockStatus: stockStatusExpr(),
            },
          },
        ],
        { new: true, session }
      );

      if (!updatedProduct) {
        throw new Error("Nhập vượt kế hoạch (plannedQuantity)");
      }

      // Nếu là lần nhập đầu tiên, set warehouseEntryDate và shelfLifeDays/expiryDate nếu có
      if (wasFirstReceipt) {
        const updateFields = {
          warehouseEntryDate: warehouseEntryDate,
        };

        // Nếu có expiryDate từ date picker
        if (finalExpiryDate !== null) {
          // Tính shelfLifeDays từ warehouseEntryDate và expiryDate
          const diffTime = finalExpiryDate.getTime() - warehouseEntryDate.getTime();
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          
          updateFields.shelfLifeDays = diffDays;
          updateFields.expiryDate = finalExpiryDate;
        }
        // Nếu có shelfLifeDays (backward compatible)
        else if (shelfLife !== null) {
          const calculatedExpiryDate = new Date(warehouseEntryDate);
          calculatedExpiryDate.setDate(calculatedExpiryDate.getDate() + shelfLife);
          updateFields.shelfLifeDays = shelfLife;
          updateFields.expiryDate = calculatedExpiryDate;
        }

        updatedProduct = await ProductModel.findByIdAndUpdate(
          productId,
          { $set: updateFields },
          { new: true, session }
        );
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

