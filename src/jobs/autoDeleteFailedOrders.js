const cron = require("node-cron");
const mongoose = require("mongoose");

const OrderModel = require("../models/OrderModel");
const OrderDetailModel = require("../models/OrderDetailModel");
const OrderStatusModel = require("../models/OrderStatusModel");
const PaymentModel = require("../models/PaymentModel");
const ProductModel = require("../models/ProductModel");
const NotificationService = require("../services/NotificationService");
const CustomerEmailService = require("../services/CustomerEmailService");
const UserModel = require("../models/UserModel");

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
      const orderDetails = await OrderDetailModel.find({
        order_id: order._id,
      }).session(session);

      for (const item of orderDetails) {
        await ProductModel.updateOne(
          { _id: item.product_id },
          { $inc: { onHandQuantity: item.quantity } },
          { session },
        );
      }

      /* =========================
         🧹 DELETE ORDER DETAILS
      ========================= */
      await OrderDetailModel.deleteMany({ order_id: order._id }, { session });

      /* =========================
         💳 DELETE PAYMENTS
      ========================= */
      await PaymentModel.deleteMany({ order_id: order._id }, { session });

      /* =========================
         🗑️ DELETE ORDER
      ========================= */
      await order.deleteOne({ session });
      await NotificationService.sendToUser(order.user_id, {
        title: "Order Removed",
        body: `Your order ${order._id.toString()} was automatically removed because the payment was not completed within 10 minutes.`,
        data: {
          type: "order",
          orderId: order._id.toString(),
          action: "order_removed",
        },
      });

      console.log(
        `🗑️ Auto deleted order ${order._id.toString()} + rollback stock`,
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

cron.schedule("*/1 * * * *", async () => {
  

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

      // Notify user via FCM (non-blocking)
      try {
        await NotificationService.sendToUser(order.user_id, {
          title: "Order Removed",
          body: `Đơn hàng ${order._id.toString()} đã được xoá tự động vì thanh toán chưa hoàn tất (pending > 15 phút).`,
          data: {
            type: "order",
            orderId: order._id.toString(),
            action: "order_removed",
          },
        });
      } catch (notifErr) {
        console.error("Failed to send auto-delete notification:", notifErr);
      }

      // Send email to user if available (non-blocking)
      try {
        const user = await UserModel.findById(order.user_id).select("email user_name").lean();
        if (user && user.email) {
          await CustomerEmailService.sendPaymentFailureEmail(
            user.email,
            user.user_name || "Khách hàng",
            order._id.toString(),
          );
        }
      } catch (emailErr) {
        console.error("Failed to send auto-delete email:", emailErr);
      }

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
