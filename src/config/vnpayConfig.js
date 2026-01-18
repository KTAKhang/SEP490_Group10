module.exports.vnpConfig = {
  tmnCode: process.env.VNP_TMN_CODE,
  hashSecret: process.env.VNP_HASH_SECRET,
  url: "https://sandbox.vnpayment.vn/paymentv2/vpcpay.html",
  refundUrl: "https://sandbox.vnpayment.vn/merchant_webapi/api/transaction",
  returnUrl: process.env.VNP_RETURN_URL,
};
