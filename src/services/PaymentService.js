const PaymentModel = require("../models/PaymentModel");
const { createVnpayUrl, refund } = require("../utils/createVnpayUrl");
const OrderModel = require("../models/OrderModel");
/* ============================
   CREATE COD PAYMENT
============================ */
const createCODPayment = async ({ order_id, amount, session }) => {
  return PaymentModel.create(
    [
      {
        order_id,
        type: "PAYMENT",
        method: "COD",
        amount,
        status: "UNPAID", // COD chưa thu tiền
        note: "Payment upon delivery",
      },
    ],
    { session },
  );
};


/* ============================
   CREATE VNPAY PENDING PAYMENT
============================ */
const createOnlinePendingPayment = async ({ order_id, amount, session }) => {
  return PaymentModel.create(
    [
      {
        order_id,
        type: "PAYMENT",
        method: "VNPAY",
        amount,
        status: "PENDING",
        note: "Waiting for VNPAY payment",
      },
    ],
    { session },
  );
};


const createVnpayPaymentUrl = async ({ order_id, user_id, ip, session }) => {
  /* =======================
     1️⃣ CHECK ORDER
  ======================= */
  console.log("order_id", order_id);
  const order = await OrderModel.findById(order_id).session(session);
  if (!order) {
    throw new Error("No order found.");
  }


  if (order.user_id.toString() !== user_id.toString()) {
    throw new Error("No payment is required for this order.");
  }


  /* =======================
     2️⃣ CHECK PAYMENT
  ======================= */
  const payment = await PaymentModel.findOne({
    order_id,
    method: "VNPAY",
    type: "PAYMENT",
  }).session(session);
  if (!payment) {
    throw new Error("Payment information not found");
  }


  if (payment.status !== "PENDING") {
    throw new Error("The order is invalid for payment");
  }


  /* =======================
     3️⃣ CREATE VNPAY URL
  ======================= */
  const payUrl = createVnpayUrl(order._id, payment.amount, ip);


  return payUrl;
};
/* ============================
   REFUND VNPAY (SYNC – NGAY LẬP TỨC)
============================ */
const refundVNPaySync = async ({ order_id, session }) => {
  const payment = await PaymentModel.findOne({
    order_id,
    method: "VNPAY",
    type: "PAYMENT",
    status: "SUCCESS",
  }).session(session);


  if (!payment) throw new Error("Payment not found for refund");


  const result = await refund({
    order_id,
    amount: payment.amount,
    provider_txn_id: payment.provider_txn_id,
  });


  if (result.vnp_ResponseCode !== "00") {
    throw new Error("VNPay refund failed");
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
        note: "Refund for cancelled order",
      },
    ],
    { session },
  );
};


module.exports = {
  createCODPayment,
  createOnlinePendingPayment,
  refundVNPaySync,
  createVnpayPaymentUrl,
};
