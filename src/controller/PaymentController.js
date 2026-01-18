const qs = require("qs");
const crypto = require("crypto");
const OrderModel = require("../models/OrderModel");
const PaymentModel = require("../models/PaymentModel");
const OrderStatusModel = require("../models/OrderStatusModel");
const { createVnpayUrl,refund } = require("../utils/createVnpayUrl");
const { vnpConfig } = require("../config/vnpayConfig");

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
  // 1️⃣ LẤY RAW QUERY STRING (QUAN TRỌNG)
  const rawQuery = req.originalUrl.split("?")[1];

  // 2️⃣ PARSE NHƯNG KHÔNG DECODE "+"
  const vnpParams = qs.parse(rawQuery, {
    ignoreQueryPrefix: true,
    decoder(str) {
      return str;
    },
  });

  const secureHash = vnpParams.vnp_SecureHash;
  delete vnpParams.vnp_SecureHash;
  delete vnpParams.vnp_SecureHashType;

  // 3️⃣ SORT PARAMS
  const sortedParams = {};
  Object.keys(vnpParams)
    .sort()
    .forEach((key) => {
      sortedParams[key] = vnpParams[key];
    });

  // 4️⃣ STRINGIFY GIỮ NGUYÊN "+"
  const signData = qs.stringify(sortedParams, { encode: false });

  const checkHash = crypto
    .createHmac("sha512", vnpConfig.hashSecret)
    .update(signData, "utf-8")
    .digest("hex");

  if (checkHash !== secureHash) {
    console.log("❌ INVALID SIGNATURE");
    console.log("SIGN DATA:", signData);
    console.log("CHECK HASH:", checkHash);
    console.log("VNP HASH:", secureHash);
    return res.status(400).send("Invalid signature");
  }

  console.log("✅ SIGNATURE VALID");

  /* =======================
     HANDLE PAYMENT
  ======================= */
  const orderId = sortedParams.vnp_TxnRef;
  const responseCode = sortedParams.vnp_ResponseCode;

  const payment = await PaymentModel.findOne({
    order_id: orderId,
    method: "VNPAY",
    type: "PAYMENT",
  });

  if (!payment) return res.status(404).send("Payment not found");

  if (responseCode === "00") {
    payment.status = "SUCCESS";
    payment.provider_txn_id = sortedParams.vnp_TransactionNo;
    payment.provider_response = sortedParams;
    await payment.save();

    const paidStatus = await OrderStatusModel.findOne({ name: "PAID" });
    await OrderModel.updateOne(
      { _id: orderId },
      { order_status_id: paidStatus._id }
    );

    return res.redirect(
      `http://localhost:5173/payment-result?status=success&orderId=${orderId}`
    );
  } else {
    payment.status = "FAILED";
    await payment.save();

    return res.redirect(
      `http://localhost:5173/payment-result?status=failed`
    );
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
