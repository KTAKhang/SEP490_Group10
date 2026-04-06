const PaymentModel = require("../models/PaymentModel");
const { createVnpayUrl, refund } = require("../utils/createVnpayUrl");
const OrderModel = require("../models/OrderModel");
/* ============================
   CREATE COD PAYMENT
============================ */
const createCODPayment = async ({ order_id, amount, session }) => {
  // 1️⃣ Validate order_id
  if (!order_id) {
    throw new Error("order_id is required");
  }

  // 2️⃣ Validate amount
  if (amount == null) {
    throw new Error("amount is required");
  }

  if (typeof amount !== "number" || isNaN(amount)) {
    throw new Error("amount must be a valid number");
  }

  if (amount <= 0) {
    throw new Error("amount must be greater than 0");
  }

  // 3️⃣ Optional: validate session (nếu dùng transaction)
  if (!session) {
    throw new Error("session is required for transaction");
  }

  // 4️⃣ Create payment
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
    { session }
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


const createVnpayPaymentUrl = async ({ order_id, user_id, ip, isMobile, session }) => {
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
  const payUrl = createVnpayUrl(order._id, payment.amount, ip,isMobile);


  return payUrl;
};


module.exports = {
  createCODPayment,
  createOnlinePendingPayment,
  createVnpayPaymentUrl,
};
