const qs = require("qs");
const axios = require("axios");
const crypto = require("crypto");
const { vnpConfig } = require("../config/vnpayConfig");

const pad = (n) => n.toString().padStart(2, "0");

const createDate = () => {
  const d = new Date();
  return (
    d.getFullYear() +
    pad(d.getMonth() + 1) +
    pad(d.getDate()) +
    pad(d.getHours()) +
    pad(d.getMinutes()) +
    pad(d.getSeconds())
  );
};

const createVnpayUrl = (orderId, amount, ipAddr = "127.0.0.1") => {
  const dt = new Date();
  const yyyyMMddHHmmss =
    `${dt.getFullYear()}${pad(dt.getMonth() + 1)}${pad(dt.getDate())}` +
    `${pad(dt.getHours())}${pad(dt.getMinutes())}${pad(dt.getSeconds())}`;

  const normalizedIp =
    (ipAddr || "127.0.0.1").includes("::") ? "127.0.0.1" : ipAddr;

  const baseParams = {
    vnp_Version: "2.1.0",
    vnp_Command: "pay",
    vnp_TmnCode: vnpConfig.tmnCode,
    vnp_Locale: "vn",
    vnp_CurrCode: "VND",
    vnp_TxnRef: orderId.toString(),
    vnp_OrderInfo: `Thanh toán cho đơn hàng ${orderId}`,
    vnp_OrderType: "billpayment",
    vnp_Amount: amount,
    vnp_ReturnUrl: vnpConfig.returnUrl,
    vnp_IpAddr: normalizedIp,
    vnp_CreateDate: yyyyMMddHHmmss,
  };

  const encodeParams = (obj) => {
    const encoded = {};
    Object.keys(obj).forEach((k) => {
      encoded[k] = encodeURIComponent(obj[k]).replace(/%20/g, "+");
    });
    return encoded;
  };

  const paramsForSign = encodeParams(baseParams);

  const sortedParams = {};
  Object.keys(paramsForSign)
    .sort()
    .forEach((k) => (sortedParams[k] = paramsForSign[k]));

  const signData = qs.stringify(sortedParams, { encode: false });

  const secureHash = crypto
    .createHmac("sha512", vnpConfig.hashSecret)
    .update(signData, "utf-8")
    .digest("hex");

  const finalParams = {
    ...paramsForSign,
    vnp_SecureHashType: "HmacSHA512",
    vnp_SecureHash: secureHash,
  };

  return `${vnpConfig.url}?${qs.stringify(finalParams, { encode: false })}`;
};

const refund = async ({ payment, refund }) => {
  if (!payment?.provider_response) {
    throw new Error("Missing payment.provider_response");
  }

  const payload = {
    vnp_RequestId: Date.now().toString(),
    vnp_Version: "2.1.0",
    vnp_Command: "refund",
    vnp_TmnCode: vnpConfig.tmnCode,
    vnp_TransactionType: "02", // hoàn toàn phần
    vnp_TxnRef: payment.provider_response.vnp_TxnRef,
    vnp_Amount: refund.amount*100, // ✅ REFUND → KHÔNG * 100
    vnp_TransactionNo: payment.provider_response.vnp_TransactionNo,
    vnp_TransactionDate: payment.provider_response.vnp_PayDate,
    vnp_CreateBy: "system",
    vnp_CreateDate: createDate(),
    vnp_IpAddr: "127.0.0.1",
    vnp_OrderInfo: "Hoan tien don hang",
  };

  const signData = [
    payload.vnp_RequestId,
    payload.vnp_Version,
    payload.vnp_Command,
    payload.vnp_TmnCode,
    payload.vnp_TransactionType,
    payload.vnp_TxnRef,
    payload.vnp_Amount,
    payload.vnp_TransactionNo,
    payload.vnp_TransactionDate,
    payload.vnp_CreateBy,
    payload.vnp_CreateDate,
    payload.vnp_IpAddr,
    payload.vnp_OrderInfo,
  ].join("|");

  payload.vnp_SecureHash = crypto
    .createHmac("sha512", vnpConfig.hashSecret)
    .update(signData, "utf8")
    .digest("hex");

  console.log("🔐 SIGN DATA:", signData);
  console.log("📦 REFUND PAYLOAD:", payload);

  const res = await axios.post(vnpConfig.refundUrl, payload, {
    headers: { "Content-Type": "application/json" },
    timeout: 15000,
  });

  return res.data;
};


module.exports = { createVnpayUrl,refund };
