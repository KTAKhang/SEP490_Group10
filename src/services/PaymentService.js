const PaymentModel = require("../models/PaymentModel");
const { createVnpayUrl,refund } = require("../utils/createVnpayUrl");
const OrderModel = require("../models/OrderModel");
/* ============================
   CREATE COD PAYMENT
============================ */
const createCODPayment = async ({ order_id, amount, session }) => {
  return PaymentModel.create(
    [{
      order_id,
      type: "PAYMENT",
      method: "COD",
      amount,
      status: "UNPAID", // COD chưa thu tiền
      note: "Thanh toán khi nhận hàng",
    }],
    { session }
  );
};

/* ============================
   CREATE VNPAY PENDING PAYMENT
============================ */
const createOnlinePendingPayment = async ({ order_id, amount, session }) => {
  console.log("hihi")
  return PaymentModel.create(
    [{
      order_id,
      type: "PAYMENT",
      method: "VNPAY",
      amount,
      status: "PENDING",
      note: "Chờ thanh toán VNPAY",
    }],
    { session }
  );
};

const createVnpayPaymentUrl = async ({
  order_id,
  user_id,
  ip,
}) => {
  /* =======================
     1️⃣ CHECK ORDER
  ======================= */
  const order = await OrderModel.findById(order_id);
  if (!order) {
    throw new Error("Không tìm thấy đơn hàng");
  }

  if (order.user_id.toString() !== user_id.toString()) {
    throw new Error("Không có quyền thanh toán đơn này");
  }

  /* =======================
     2️⃣ CHECK PAYMENT
  ======================= */
  const payment = await PaymentModel.findOne({
    order_id,
    method: "VNPAY",
    type: "PAYMENT",
  });

  if (!payment) {
    throw new Error("Không tìm thấy thông tin thanh toán");
  }

  if (payment.status !== "PENDING") {
    throw new Error("Đơn không hợp lệ để thanh toán");
  }

  /* =======================
     3️⃣ CREATE VNPAY URL
  ======================= */
  const payUrl = createVnpayUrl(
    order._id,
    payment.amount,
    ip
  );

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

  if (!payment)
    throw new Error("Không tìm thấy payment để hoàn tiền");

  const result = await refund({
    order_id,
    amount: payment.amount,
    provider_txn_id: payment.provider_txn_id,
  });

  if (result.vnp_ResponseCode !== "00") {
    throw new Error("VNPay refund thất bại");
  }

  await PaymentModel.create(
    [{
      order_id,
      type: "REFUND",
      method: "VNPAY",
      amount: payment.amount,
      status: "SUCCESS",
      provider_response: result,
      note: "Refund khi huỷ đơn",
    }],
    { session }
  );
};

module.exports = {
  createCODPayment,
  createOnlinePendingPayment,
  refundVNPaySync,
  createVnpayPaymentUrl
};
