const qs = require("qs");
const crypto = require("crypto");
const OrderModel = require("../models/OrderModel");
const PaymentModel = require("../models/PaymentModel");
const OrderStatusModel = require("../models/OrderStatusModel");
const { createVnpayUrl,refund } = require("../utils/createVnpayUrl");
const { vnpConfig } = require("../config/vnpayConfig");
const { default: mongoose } = require("mongoose");

/* =============================
   CREATE VNPAY URL
============================= */
const createVnpayPaymentUrl = async (req, res) => {
  try {
    const { order_id } = req.body;
    const user_id = req.user._id;

    const order = await OrderModel.findById(order_id);
    if (!order) throw new Error("Không tìm thấy đơn hàng");

    if (order.user_id.toString() !== user_id.toString())
      throw new Error("Không có quyền");

    const payment = await PaymentModel.findOne({
      order_id,
      method: "VNPAY",
      type: "PAYMENT",
    });

    if (!payment || payment.status !== "PENDING")
      throw new Error("Đơn không hợp lệ để thanh toán");

    const payUrl = createVnpayUrl(order._id, payment.amount, req.ip);

    res.json({ success: true, payUrl });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

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
        `http://localhost:5173/customer/payment-result?status=success&orderId=${orderId}`
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
        `http://localhost:5173/customer/payment-result?status=success&orderId=${orderId}`
      );
    }

    /* =======================
       8️⃣ HANDLE RESULT
    ======================= */
    if (responseCode === "00") {
      /* ===== PAYMENT SUCCESS ===== */
      payment.status = "SUCCESS";
      payment.provider_txn_id = transactionNo;
      payment.provider_response = sortedParams;
      await payment.save({ session });

      order.status_history.push({
        from_status: order.order_status_id,
        to_status: paidStatus._id,
        changed_by: order.user_id,
        changed_by_role: "customer",
        note: "Thanh toán VNPAY thành công",
      });

      order.order_status_id = paidStatus._id;
      await order.save({ session });

      await session.commitTransaction();

      return res.redirect(
        `http://localhost:5173/customer/payment-result?status=success&orderId=${orderId}`
      );
    }

    /* ===== PAYMENT FAILED ===== */
    payment.status = "FAILED";
    payment.provider_response = sortedParams;
    await payment.save({ session });

    await session.commitTransaction();

    return res.redirect(
      `http://localhost:5173/customer/payment-result?status=failed&orderId=${orderId}`
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
      throw new Error("Không tìm thấy giao dịch hợp lệ để hoàn tiền");

    const result = await refund({
      order_id,
      amount: payment.amount,
      provider_txn_id: payment.provider_txn_id,
    });

    if (result.vnp_ResponseCode !== "00") {
      throw new Error(`Refund thất bại: ${result.vnp_Message}`);
    }

    await PaymentModel.create(
      [{
        order_id,
        type: "REFUND",
        method: "VNPAY",
        amount: payment.amount,
        status: "SUCCESS",
        provider_response: result,
        note: "Hoàn tiền VNPay",
      }],
      { session }
    );

    await session.commitTransaction();
    res.json({ success: true, message: "Hoàn tiền thành công" });

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
