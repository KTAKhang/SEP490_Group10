const cron = require("node-cron");
const mongoose = require("mongoose");
const PaymentModel = require("../models/PaymentModel");
const { refund: refundVNPay } = require("../utils/createVnpayUrl");

cron.schedule("*/10 * * * * *", async () => {
  console.log("⏳ VNPay Refund Cron started...");

  const refunds = await PaymentModel.find({
    type: "REFUND",
    method: "VNPAY",
    status: "PENDING",
  }).limit(1);

  for (const refundDoc of refunds) {
    let lockedRefund;
    let payment;

    /* ========== TX1: LOCK ========= */
    const session1 = await mongoose.startSession();
    try {
      session1.startTransaction();

      lockedRefund = await PaymentModel.findOneAndUpdate(
        { _id: refundDoc._id, status: "PENDING" },
        { status: "PROCESSING" },
        { new: true, session: session1 },
      );

      if (!lockedRefund) {
        await session1.abortTransaction();
        session1.endSession();
        continue;
      }

      payment = await PaymentModel.findOne({
        order_id: lockedRefund.order_id,
        type: "PAYMENT",
        method: "VNPAY",
        status: "SUCCESS",
      }).session(session1);

      if (!payment) {
        lockedRefund.status = "FAILED";
        lockedRefund.note = "Không tìm thấy payment gốc";
        await lockedRefund.save({ session: session1 });
      }

      await session1.commitTransaction();
    } catch (err) {
      await session1.abortTransaction();
      console.error("🔥 TX1 error:", err.message);
      session1.endSession();
      continue;
    }
    session1.endSession();

    if (!payment) continue;

    console.log("🧪 DEBUG DATA:", {
      refund_id: lockedRefund._id.toString(),
      payment_txn: payment.provider_response?.vnp_TransactionNo,
      pay_date: payment.provider_response?.vnp_PayDate,
    });

    console.log("🔎 payment.provider_response:", payment.provider_response);

    /* ========== CALL VNPAY ========= */
    let result;
    try {
      result = await refundVNPay({
        payment,
        refund: lockedRefund,
      });
      console.log("🎯 VNPAY RESULT:", result);
    } catch (err) {
      console.error(
        "🔥 VNPay API error:",
        err.message,
        err.response?.status,
        err.response?.data,
      );
      continue;
    }

    /* ========== TX2: UPDATE ========= */
    const session2 = await mongoose.startSession();
    try {
      session2.startTransaction();

      lockedRefund.status =
        result.vnp_ResponseCode === "00" ? "SUCCESS" : "FAILED";
      lockedRefund.provider_response = result;

      await lockedRefund.save({ session: session2 });
      await session2.commitTransaction();

      console.log(
        `✅ Refund ${lockedRefund.status} | Order ${lockedRefund.order_id}`,
      );
    } catch (err) {
      await session2.abortTransaction();
      console.error("🔥 TX2 error:", err.message);
    } finally {
      session2.endSession();
    }
  }
});
