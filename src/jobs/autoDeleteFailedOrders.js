const cron = require("node-cron");
const mongoose = require("mongoose");

const OrderModel = require("../models/OrderModel");
const OrderDetailModel = require("../models/OrderDetailModel");
const OrderStatusModel = require("../models/OrderStatusModel");
const PaymentModel = require("../models/PaymentModel");
const ProductModel = require("../models/ProductModel");

/**
 * ⏱️ Chạy mỗi 1 phút
 * Xóa đơn VNPAY FAILED quá 10 phút không retry
 */
cron.schedule("*/1 * * * *", async () => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const failedStatus = await OrderStatusModel.findOne({ name: "PENDING" });
    if (!failedStatus) {
      await session.abortTransaction();
      return;
    }

    const now = new Date();

    const expiredOrders = await OrderModel.find({
      order_status_id: failedStatus._id,
      auto_delete: true,
      allow_retry: true,
      retry_expired_at: { $lt: now },
    }).session(session);

    for (const order of expiredOrders) {
      /* =========================
         🔄 ROLLBACK STOCK
      ========================= */
      const orderDetails = await OrderDetailModel.find(
        { order_id: order._id }
      ).session(session);

      for (const item of orderDetails) {
        await ProductModel.updateOne(
          { _id: item.product_id },
          { $inc: { onHandQuantity: item.quantity } },
          { session }
        );
      }

      /* =========================
         🧹 DELETE ORDER DETAILS
      ========================= */
      await OrderDetailModel.deleteMany(
        { order_id: order._id },
        { session }
      );

      /* =========================
         💳 DELETE PAYMENTS
      ========================= */
      await PaymentModel.deleteMany(
        { order_id: order._id },
        { session }
      );

      /* =========================
         🗑️ DELETE ORDER
      ========================= */
      await order.deleteOne({ session });

      console.log(
        `🗑️ Auto deleted order ${order._id.toString()} + rollback stock`
      );
    }

    await session.commitTransaction();
  } catch (err) {
    await session.abortTransaction();
    console.error("❌ Auto delete order job error:", err.message);
  } finally {
    session.endSession();
  }
});
console.log("🟢 Auto delete pending order cron loaded");

cron.schedule("*/1 * * * * *", async () => {
  

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    /* =========================
       🔍 GET PENDING ORDER STATUS
    ========================= */
    const pendingStatus = await OrderStatusModel.findOne({ name: "PENDING" });
    if (!pendingStatus) {
      await session.abortTransaction();
      return;
    }

    const expiredTime = new Date(Date.now() - 15 * 60 * 1000); // ⏱️ 15 minutes ago

    /* =========================
       🔍 FIND PENDING VNPAY ORDERS
       (KHÔNG CHECK createdAt của order)
    ========================= */
    const pendingOrders = await OrderModel.find({
      order_status_id: pendingStatus._id,
      payment_method: "VNPAY",
      auto_delete: true,
    }).session(session);

    for (const order of pendingOrders) {
      /* =========================
         🔍 CHECK PAYMENT EXPIRED
         (DÙNG payment.createdAt)
      ========================= */
      const payment = await PaymentModel.findOne({
        order_id: order._id,
        status: "PENDING",
        createdAt: { $lt: expiredTime },
      }).session(session);

      if (!payment) continue; // chưa quá 15 phút hoặc đã xử lý

      /* =========================
         🔄 ROLLBACK STOCK
      ========================= */
      const orderDetails = await OrderDetailModel.find({
        order_id: order._id,
      }).session(session);

      for (const item of orderDetails) {
        await ProductModel.updateOne(
          { _id: item.product_id },
          { $inc: { onHandQuantity: item.quantity } },
          { session }
        );
      }

      /* =========================
         🧹 DELETE ORDER DETAILS
      ========================= */
      await OrderDetailModel.deleteMany(
        { order_id: order._id },
        { session }
      );

      /* =========================
         💳 DELETE PAYMENT
      ========================= */
      await PaymentModel.deleteMany(
        { order_id: order._id },
        { session }
      );

      /* =========================
         🗑️ DELETE ORDER
      ========================= */
      await order.deleteOne({ session });

      console.log(
        `🗑️ Auto deleted order ${order._id.toString()} (payment pending > 15 minutes)`
      );
    }

    await session.commitTransaction();
  } catch (error) {
    await session.abortTransaction();
    console.error("❌ Auto delete pending order job error:", error.message);
  } finally {
    session.endSession();
  }
});

module.exports = {};
