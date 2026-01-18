const PaymentModel = require("../models/PaymentModel");
const { createVnpayUrl,refund } = require("../utils/createVnpayUrl");
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
};
