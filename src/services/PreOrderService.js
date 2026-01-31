const FruitTypeModel = require("../models/FruitTypeModel");
const PreOrderModel = require("../models/PreOrderModel");
const PreOrderPaymentIntentModel = require("../models/PreOrderPaymentIntentModel");
const PreOrderRemainingPaymentModel = require("../models/PreOrderRemainingPaymentModel");
const { isPreOrderLockedByHarvest } = require("./FruitTypeService");
const { createPreOrderVnpayUrl } = require("../utils/createVnpayUrl");

const INTENT_EXPIRE_MINUTES = 15;
const CANCEL_WINDOW_HOURS = 24;

async function createPaymentIntentAndGetPayUrl({ userId, fruitTypeId, quantityKg, ip, receiverInfo }) {
  const fruitType = await FruitTypeModel.findById(fruitTypeId).lean();
    if (!fruitType) throw new Error("Fruit type not found");
    if (!fruitType.allowPreOrder || fruitType.status !== "ACTIVE") {
      throw new Error("This fruit type does not accept pre-orders");
    }
    if (isPreOrderLockedByHarvest(fruitType.estimatedHarvestDate)) {
      throw new Error("Pre-order closed for this fruit: less than 3 days until harvest.");
    }
    const qty = Number(quantityKg);
    if (isNaN(qty) || qty < fruitType.minOrderKg || qty > fruitType.maxOrderKg) {
      throw new Error("Quantity (kg) must be between " + fruitType.minOrderKg + " and " + fruitType.maxOrderKg);
    }
    // Pre-order: luôn chỉ thu tiền cọc 50%; 50% còn lại thanh toán sau khi phân bổ
    const depositPct = 50;
    const amount = Math.round((depositPct / 100) * fruitType.estimatedPrice * qty);
    const expiresAt = new Date(Date.now() + INTENT_EXPIRE_MINUTES * 60 * 1000);
    const intentPayload = {
      userId,
      fruitTypeId,
      quantityKg: qty,
      amount,
      status: "PENDING",
      expiresAt,
    };
    if (receiverInfo) {
      intentPayload.receiver_name = receiverInfo.receiver_name ? String(receiverInfo.receiver_name).trim() : "";
      intentPayload.receiver_phone = receiverInfo.receiver_phone ? String(receiverInfo.receiver_phone).trim() : "";
      intentPayload.receiver_address = receiverInfo.receiver_address ? String(receiverInfo.receiver_address).trim() : "";
    }
    const intent = await PreOrderPaymentIntentModel.create(intentPayload);
    const payUrl = createPreOrderVnpayUrl(intent._id.toString(), amount, ip);
  return { success: true, paymentIntentId: intent._id.toString(), payUrl, expiresAt: intent.expiresAt };
}

/** Admin: danh sách đơn đặt trước đã đặt cọc thành công (có thể lọc status). */
async function getAdminPreOrderList(filters = {}) {
  const { status, page = 1, limit = 20 } = filters;
  const query = { status: { $nin: ["CANCELLED"] } };
  if (status) query.status = status;
  const skip = (Math.max(1, page) - 1) * Math.max(1, Math.min(100, limit));
  const [list, total] = await Promise.all([
    PreOrderModel.find(query)
      .populate("userId", "user_name email")
      .populate("fruitTypeId", "name estimatedPrice")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Math.max(1, Math.min(100, limit)))
      .lean(),
    PreOrderModel.countDocuments(query),
  ]);
  return {
    status: "OK",
    data: list,
    pagination: { page: Math.max(1, page), limit: Math.max(1, Math.min(100, limit)), total, totalPages: Math.ceil(total / Math.max(1, Math.min(100, limit))) },
  };
}

/** Admin: chi tiết một đơn đặt trước (số lượng, địa chỉ, khách hàng). */
async function getAdminPreOrderDetail(id) {
  const po = await PreOrderModel.findById(id)
    .populate("userId", "user_name email")
    .populate("fruitTypeId", "name estimatedPrice estimatedHarvestDate")
    .lean();
  if (!po) throw new Error("Pre-order not found");
  return { status: "OK", data: po };
}

async function getMyPreOrders(userId) {
  const list = await PreOrderModel.find({ userId })
    .populate("fruitTypeId", "name estimatedPrice estimatedHarvestDate")
    .sort({ createdAt: -1 })
    .lean();
  const CANCEL_MS = CANCEL_WINDOW_HOURS * 60 * 60 * 1000;
  const data = list.map((po) => {
    const canCancel =
      (po.status === "WAITING_FOR_PRODUCT" || po.status === "READY_FOR_FULFILLMENT") &&
      new Date(po.createdAt).getTime() + CANCEL_MS > Date.now();
    return { ...po, canCancel };
  });
  const dataWithRemaining = data.map((po) => {
    const depositPaid = po.depositPaid ?? 0;
    const totalAmount = po.totalAmount ?? 0;
    const remainingAmount = po.remainingPaidAt ? 0 : Math.max(0, totalAmount - depositPaid);
    return { ...po, remainingAmount, canPayRemaining: po.status === "READY_FOR_FULFILLMENT" && remainingAmount > 0 };
  });
  return { status: "OK", data: dataWithRemaining };
}

const REMAINING_INTENT_EXPIRE_MINUTES = 15;

/** Tạo intent thanh toán phần còn lại, trả về payUrl. Không qua checkout, dùng địa chỉ đã lưu. */
async function createRemainingPaymentIntent(preOrderId, userId, ip) {
  const po = await PreOrderModel.findOne({ _id: preOrderId, userId }).lean();
  if (!po) throw new Error("Pre-order not found");
  if (po.status !== "READY_FOR_FULFILLMENT") throw new Error("Remaining payment only when order is ready for fulfillment");
  if (po.remainingPaidAt) throw new Error("Order already fully paid");
  const totalAmount = po.totalAmount ?? 0;
  const depositPaid = po.depositPaid ?? 0;
  const remaining = Math.round(totalAmount - depositPaid);
  if (remaining <= 0) throw new Error("No remaining amount to pay");

  const expiresAt = new Date(Date.now() + REMAINING_INTENT_EXPIRE_MINUTES * 60 * 1000);
  const doc = await PreOrderRemainingPaymentModel.create({
    preOrderId: po._id,
    amount: remaining,
    status: "PENDING",
    expiresAt,
  });
  const payUrl = createPreOrderVnpayUrl(doc._id.toString(), remaining, ip);
  return { success: true, payUrl, expiresAt };
}

async function cancelPreOrder(preOrderId, userId) {
  const po = await PreOrderModel.findOne({ _id: preOrderId, userId });
  if (!po) throw new Error("Pre-order not found");
  throw new Error("Pre-orders cannot be cancelled. You confirmed this at checkout.");
}

async function fulfillPaymentIntent(intentId, session) {
  const intent = await PreOrderPaymentIntentModel.findById(intentId).session(session);
  if (!intent) throw new Error("PreOrder payment intent not found");
  if (intent.status === "SUCCESS") return null;
  if (intent.status !== "PENDING") throw new Error("Intent not pending");
  if (new Date() > new Date(intent.expiresAt)) {
    intent.status = "EXPIRED";
    await intent.save({ session });
    throw new Error("Payment intent expired");
  }
  const fruitType = await FruitTypeModel.findById(intent.fruitTypeId).session(session).lean();
  const totalAmount = fruitType ? Math.round(fruitType.estimatedPrice * intent.quantityKg) : 0;
  const preOrderPayload = {
    userId: intent.userId,
    fruitTypeId: intent.fruitTypeId,
    quantityKg: intent.quantityKg,
    status: "WAITING_FOR_PRODUCT",
    paymentStatus: "PAID",
    depositPaid: intent.amount,
    totalAmount,
    remainingPaidAt: null,
  };
  if (intent.receiver_name != null) preOrderPayload.receiver_name = intent.receiver_name;
  if (intent.receiver_phone != null) preOrderPayload.receiver_phone = intent.receiver_phone;
  if (intent.receiver_address != null) preOrderPayload.receiver_address = intent.receiver_address;
  const preOrder = await PreOrderModel.create([preOrderPayload], { session });
  intent.status = "SUCCESS";
  await intent.save({ session });
  return preOrder[0];
}

/** Xử lý callback VNPay thành công cho thanh toán phần còn lại. */
async function fulfillRemainingPayment(remainingIntentId, session) {
  const intent = await PreOrderRemainingPaymentModel.findById(remainingIntentId).session(session);
  if (!intent) return null;
  if (intent.status === "SUCCESS") return null;
  if (intent.status !== "PENDING") throw new Error("Intent is not pending");
  if (new Date() > new Date(intent.expiresAt)) {
    intent.status = "EXPIRED";
    await intent.save({ session });
    throw new Error("Payment session expired");
  }
  await PreOrderModel.updateOne(
    { _id: intent.preOrderId },
    { $set: { remainingPaidAt: new Date() } },
    { session }
  );
  intent.status = "SUCCESS";
  await intent.save({ session });
  return intent;
}

module.exports = {
  createPaymentIntentAndGetPayUrl,
  getMyPreOrders,
  getAdminPreOrderList,
  getAdminPreOrderDetail,
  createRemainingPaymentIntent,
  cancelPreOrder,
  fulfillPaymentIntent,
  fulfillRemainingPayment,
  CANCEL_WINDOW_HOURS,
};
