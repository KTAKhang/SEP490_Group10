const cron = require("node-cron");
const mongoose = require("mongoose");


const OrderModel = require("../models/OrderModel");
const OrderDetailModel = require("../models/OrderDetailModel");
const OrderStatusModel = require("../models/OrderStatusModel");
const PaymentModel = require("../models/PaymentModel");
const ProductModel = require("../models/ProductModel");
const NotificationService = require("../services/NotificationService");


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
console.log("🟢 Auto delete pending order cron loaded");


cron.schedule("*/1 * * * *", async () => {
  const session = await mongoose.startSession();
  session.startTransaction();


  try {
    const expiredTime = new Date(Date.now() - 1 * 60 * 1000); // 15 phút


    /* =========================
       🔍 FIND EXPIRED VNPAY PAYMENTS
    ========================= */
    const expiredPayments = await PaymentModel.find({
      type: "PAYMENT",
      method: "VNPAY",
      status: "PENDING",
      createdAt: { $lt: expiredTime },
    }).session(session);


    for (const payment of expiredPayments) {
      const order = await OrderModel.findById(payment.order_id).session(session);
      if (!order) continue;


      /* =========================
         🔄 RELEASE RESERVED STOCK
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
         ⏰ MARK PAYMENT TIMEOUT
      ========================= */
      payment.status = "TIMEOUT";
      payment.note = "Payment timeout after 15 minutes";


      await payment.save({ session });


      /* =========================
         🔔 NOTIFY USER
      ========================= */
      // await NotificationService.sendToUser(order.user_id, {
      //   title: "Payment timeout",
      //   body: `Payment for order ${order._id.toString()} has expired after 15 minutes. Products were released back to stock.`,
      //   data: {
      //     type: "payment",
      //     orderId: order._id.toString(),
      //     action: "payment_timeout",
      //   },
      // });
      console.log(
        `⏰ Payment ${payment._id.toString()} marked TIMEOUT`,
      );
    }
    await session.commitTransaction();
  } catch (error) {
    await session.abortTransaction();
    console.error("❌ Payment timeout cron error:", error.message);
  } finally {
    session.endSession();
  }
});
module.exports = {};

