const qs = require("qs");
const crypto = require("crypto");
const OrderModel = require("../models/OrderModel");
const OrderDetailModel = require("../models/OrderDetailModel");
const PaymentModel = require("../models/PaymentModel");
const OrderStatusModel = require("../models/OrderStatusModel");
const PreOrderPaymentIntentModel = require("../models/PreOrderPaymentIntentModel");
const PreOrderRemainingPaymentModel = require("../models/PreOrderRemainingPaymentModel");
const PreOrderService = require("../services/PreOrderService");
const { createVnpayUrl, refund } = require("../utils/createVnpayUrl");
const { vnpConfig } = require("../config/vnpayConfig");
const { default: mongoose } = require("mongoose");
const NotificationService = require("../services/NotificationService");
const CustomerEmailService = require("../services/CustomerEmailService");
const UserModel = require("../models/UserModel");
const ProductModel = require("../models/ProductModel");

/* =============================
   CREATE VNPAY URL
============================= */
const createVnpayPaymentUrl = async (req, res) => {
  try {
    const { order_id } = req.body;
    const user_id = req.user._id;

    const order = await OrderModel.findById(order_id);
    if (!order) throw new Error("No order found");

    if (order.user_id.toString() !== user_id.toString())
      throw new Error("You do not have permission");

    const payment = await PaymentModel.findOne({
      order_id,
      method: "VNPAY",
      type: "PAYMENT",
    });

    if (!payment || payment.status !== "PENDING")
      throw new Error("Order is not valid for payment");

    const payUrl = createVnpayUrl(order._id, payment.amount, req.ip);

    res.json({ success: true, payUrl });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

async function isOrderOutOfStock(orderId, session) {
  const orderDetails = await OrderDetailModel.find({
    order_id: orderId,
  }).session(session);

  for (const item of orderDetails) {
    const product = await ProductModel.findById(item.product_id).session(
      session,
    );
    console.log("product", product.onHandQuantity);
    console.log("item", item.quantity);

    if (!product || product.onHandQuantity < item.quantity) {
      return true;
    }
  }

  return false;
}

async function deductStock(orderId, session) {
  const orderDetails = await OrderDetailModel.find({
    order_id: orderId,
  }).session(session);

  for (const item of orderDetails) {
    const result = await ProductModel.updateOne(
      {
        _id: item.product_id,
        onHandQuantity: { $gte: item.quantity },
      },
      {
        $inc: { onHandQuantity: -item.quantity },
      },
      { session },
    );

    if (result.modifiedCount === 0) {
      throw new Error("Insufficient inventory when deducting");
    }
  }
}

/* =============================
   VNPAY RETURN URL
============================= */
const vnpayReturn = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    /* =======================
       1️⃣ GET RAW QUERY
    ======================= */
    const rawQuery = req.originalUrl.split("?")[1];
    if (!rawQuery) {
      return res.status(400).send("Missing query params");
    }

    /* =======================
       2️⃣ PARSE QUERY (NO DECODE +)
    ======================= */
    const vnpParams = qs.parse(rawQuery, {
      ignoreQueryPrefix: true,
      decoder(str) {
        return str;
      },
    });

    const secureHash = vnpParams.vnp_SecureHash;
    delete vnpParams.vnp_SecureHash;
    delete vnpParams.vnp_SecureHashType;

    /* =======================
       3️⃣ SORT PARAMS
    ======================= */
    const sortedParams = {};
    Object.keys(vnpParams)
      .sort()
      .forEach((key) => {
        sortedParams[key] = vnpParams[key];
      });

    /* =======================
       4️⃣ VERIFY SIGNATURE
    ======================= */
    const signData = qs.stringify(sortedParams, { encode: false });

    const checkHash = crypto
      .createHmac("sha512", vnpConfig.hashSecret)
      .update(signData, "utf-8")
      .digest("hex");

    if (checkHash !== secureHash) {
      return res.status(400).send("Invalid VNPay signature");
    }

    /* =======================
       5️⃣ EXTRACT DATA
    ======================= */
    const orderIdStr = sortedParams.vnp_TxnRef;
    const responseCode = sortedParams.vnp_ResponseCode;
    const transactionNo = sortedParams.vnp_TransactionNo;

    if (!orderIdStr || !transactionNo) {
      throw new Error("Missing orderId or transactionNo");
    }

    /* =======================
       PRE-ORDER: intent id as vnp_TxnRef
    ======================= */
    const preOrderIntent =
      await PreOrderPaymentIntentModel.findById(orderIdStr).session(session);
    if (preOrderIntent) {
      if (responseCode === "00") {
        await PreOrderService.fulfillPaymentIntent(orderIdStr, session);
        await session.commitTransaction();
        return res.redirect(
          "http://localhost:5173/customer/preorder-payment-result?status=success",
        );
      }
      preOrderIntent.status = "FAILED";
      await preOrderIntent.save({ session });
      await session.commitTransaction();
      return res.redirect(
        "http://localhost:5173/customer/preorder-payment-result?status=failed",
      );
    }

    const remainingIntent =
      await PreOrderRemainingPaymentModel.findById(orderIdStr).session(session);
    if (remainingIntent) {
      if (responseCode === "00") {
        await PreOrderService.fulfillRemainingPayment(orderIdStr, session);
        await session.commitTransaction();
        return res.redirect(
          "http://localhost:5173/customer/my-pre-orders?remaining=success",
        );
      }
      remainingIntent.status = "FAILED";
      await remainingIntent.save({ session });
      await session.commitTransaction();
      return res.redirect(
        "http://localhost:5173/customer/my-pre-orders?remaining=failed",
      );
    }

    const orderId = new mongoose.Types.ObjectId(orderIdStr);

    /* =======================
       6️⃣ LOAD PAYMENT
    ======================= */
    const payment = await PaymentModel.findOne({
      order_id: orderId,
      method: "VNPAY",
      type: "PAYMENT",
    }).session(session);

    if (!payment) {
      throw new Error("Payment not found");
    }

    /* =======================
       🔒 ANTI-REPLAY #1
       PAYMENT SUCCESS
    ======================= */
    if (payment.status === "SUCCESS") {
      await session.commitTransaction();
      return res.redirect(
        `http://localhost:5173/customer/payment-result?status=success&orderId=${orderId}`,
      );
    }

    /* =======================
       🔒 ANTI-REPLAY #2
       DUPLICATE TXN (OTHER PAYMENT)
    ======================= */
    const existedTxn = await PaymentModel.findOne({
      provider_txn_id: transactionNo,
      _id: { $ne: payment._id },
    }).session(session);

    if (existedTxn) {
      await session.abortTransaction();
      return res.status(409).send("Duplicate transaction");
    }

    /* =======================
       7️⃣ LOAD ORDER
    ======================= */
    const order = await OrderModel.findById(orderId).session(session);
    if (!order) {
      throw new Error("Order not found");
    }

    const paidStatus = await OrderStatusModel.findOne({
      name: "PAID",
    }).session(session);

    if (!paidStatus) {
      throw new Error("PAID status not found");
    }

    /* =======================
       🔒 ANTI-REPLAY #3
       ORDER PAID
    ======================= */
    if (order.order_status_id.equals(paidStatus._id)) {
      await session.commitTransaction();
      return res.redirect(
        `http://localhost:5173/customer/payment-result?status=success&orderId=${orderId}`,
      );
    }

    /* =======================
       8️⃣ HANDLE RESULT
    ======================= */
    // responseCode từ VNPay
    if (responseCode === "00") {
      /* =====================
     PAYMENT SUCCESS
  ===================== */
      payment.status = "SUCCESS";
      payment.provider_txn_id = transactionNo;
      payment.provider_response = sortedParams;
      await payment.save({ session });

      order.status_history.push({
        from_status: order.order_status_id,
        to_status: paidStatus._id,
        changed_by: order.user_id,
        changed_by_role: "customer",
        note: "VNPAY payment successful",
      });

      order.order_status_id = paidStatus._id;
      await order.save({ session });

      await session.commitTransaction();

      try {
        await NotificationService.sendToUser(order.user_id.toString(), {
          title: "VNPay payment successfull",
          body: `Payment successfull for order ${orderId}. Go to Order History to check your order`,
          data: {
            type: "order",
            orderId: orderId.toString(),
            action: "view_order",
          },
        });
      } catch (notifErr) {
        console.error("Failed to send payment failure notification:", notifErr);
      }

      try {
        await NotificationService.sendToRole("sales-staff", {
          title: "Order VNPay Payment Successfull",
          body: `Payment successfull for order ${orderId}`,
          data: {
            type: "order",
            orderId: orderId.toString(),
            action: "view_order",
          },
        });
      } catch (notifErr) {
        console.error("Failed to send payment failure notification:", notifErr);
      }

      try {
        const user = await UserModel.findById(order.user_id)
          .select("email user_name")
          .lean();
        if (user && user.email) {
          await CustomerEmailService.sendPaymentSuccessEmail(
            user.email,
            user.user_name || "Customer",
            orderId.toString(),
          );
        }
      } catch (emailErr) {
        console.error("Failed to send payment failure email:", emailErr);
      }

      return res.redirect(
        `http://localhost:5173/customer/payment-result?status=success&orderId=${orderId}`,
      );
    }

    /* =====================
   PAYMENT TIMEOUT
===================== */

    /* ===== PAYMENT FAILED ===== */
    payment.status = "FAILED";
    payment.provider_response = sortedParams;
    await payment.save({ session });

    /* ===== ORDER → FAILED + RETRY 10 PHÚT ===== */
    const TEN_MINUTES = 10 * 60 * 1000;

    const status = await OrderStatusModel.findOne({ name: "PENDING" }).session(
      session,
    );

    order.allow_retry = true;
    order.auto_delete = true;
    order.retry_expired_at = new Date(Date.now() + TEN_MINUTES);

    // ghi history
    order.status_history.push({
      from_status: order.order_status_id,
      to_status: status._id,
      changed_by: order.user_id,
      changed_by_role: "customer",
      note: "VNPAY payment failed – allow re-payment within 10 minutes",
    });

    order.order_status_id = status._id;
    await order.save({ session });

    /* ===== COMMIT ===== */
    await session.commitTransaction();
    try {
      await NotificationService.sendToUser(order.user_id.toString(), {
        title: "VNPay payment failed",
        body: `Payment failed for order ${orderId}. Go to Order History to re-pay in 10 minutes`,
        data: {
          type: "order",
          orderId: orderId.toString(),
          action: "retry_payment",
        },
      });
    } catch (notifErr) {
      console.error("Failed to send payment failure notification:", notifErr);
    }

    try {
      const user = await UserModel.findById(order.user_id)
        .select("email user_name")
        .lean();
      if (user && user.email) {
        await CustomerEmailService.sendPaymentFailureEmail(
          user.email,
          user.user_name || "Customer",
          orderId.toString(),
        );
      }
    } catch (emailErr) {
      console.error("Failed to send payment failure email:", emailErr);
    }

    /* ===== REDIRECT ===== */
    return res.redirect(
      `http://localhost:5173/customer/payment-fail?status=failed&orderId=${orderId}`,
    );
  } catch (err) {
    console.error("🔥 VNPAY RETURN ERROR:", err.message);
    await session.abortTransaction();
    return res.status(500).send("Payment processing error");
  } finally {
    session.endSession();
  }
};

const refundVNPay = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { order_id } = req.body;

    const payment = await PaymentModel.findOne({
      order_id,
      method: "VNPAY",
      type: "PAYMENT",
      status: "SUCCESS",
    }).session(session);

    if (!payment)
      throw new Error("No valid transaction found for refund");

    const result = await refund({
      order_id,
      amount: payment.amount,
      provider_txn_id: payment.provider_txn_id,
    });

    if (result.vnp_ResponseCode !== "00") {
      throw new Error(`Refund failed: ${result.vnp_Message}`);
    }

    await PaymentModel.create(
      [
        {
          order_id,
          type: "REFUND",
          method: "VNPAY",
          amount: payment.amount,
          status: "SUCCESS",
          provider_response: result,
          note: "Hoàn tiền VNPay",
        },
      ],
      { session },
    );

    await session.commitTransaction();
    res.json({ success: true, message: "Refund successful" });
  } catch (err) {
    await session.abortTransaction();
    res.status(400).json({
      success: false,
      message: err.message,
    });
  } finally {
    session.endSession();
  }
};

module.exports = {
  createVnpayPaymentUrl,
  vnpayReturn,
  refundVNPay,
};
