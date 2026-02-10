/**
 * Pre-order Service
 *
 * Business logic for customer pre-orders (deposit + remaining payment) and admin pre-order management.
 *
 * This service handles:
 * - Customer: create payment intent (deposit 50%), pay remaining 50% after allocation, list my pre-orders
 * - Admin: list/filter pre-orders, view detail, mark completed when delivery is done, mark refund
 *
 * Core flow:
 * 1. Customer creates payment intent → pays deposit via VNPay → fulfillPaymentIntent creates PreOrder (WAITING_FOR_ALLOCATION)
 * 2. Admin allocates stock (FIFO); allocated orders → ALLOCATED_WAITING_PAYMENT; customer pays remaining → READY_FOR_FULFILLMENT
 * 3. Admin marks completed when delivery is done (status COMPLETED)
 *
 * Pre-orders cannot be cancelled by customer.
 *
 * @module services/PreOrderService
 */

const FruitTypeModel = require("../models/FruitTypeModel");
const PreOrderModel = require("../models/PreOrderModel");
const UserModel = require("../models/UserModel");
const PreOrderPaymentIntentModel = require("../models/PreOrderPaymentIntentModel");
const PreOrderRemainingPaymentModel = require("../models/PreOrderRemainingPaymentModel");
const { isPreOrderLockedByHarvest, DAYS_BEFORE_HARVEST_TO_LOCK } = require("./FruitTypeService");
const { createPreOrderVnpayUrl } = require("../utils/createVnpayUrl");

/** Payment intent expiry in minutes (VNPay redirect). */
const INTENT_EXPIRE_MINUTES = 15;
/** Reserved: cancel window in hours (pre-orders are not cancellable). */
const CANCEL_WINDOW_HOURS = 24;

/**
 * Create a deposit payment intent and return VNPay URL for customer to pay 50% deposit.
 *
 * Business rules:
 * - Fruit type must exist, allowPreOrder = true, status = ACTIVE
 * - Pre-order is locked N days before estimated harvest (no new orders; N = DAYS_BEFORE_HARVEST_TO_LOCK in FruitTypeService)
 * - Quantity must be within fruit type minOrderKg..maxOrderKg
 * - Deposit is always 50% of (estimatedPrice * quantityKg)
 *
 * Flow:
 * 1. Load fruit type and validate eligibility
 * 2. Compute deposit amount (50%) and expiry
 * 3. Create PreOrderPaymentIntent (status PENDING)
 * 4. Build VNPay URL and return
 *
 * @param {Object} params - Input parameters
 * @param {string} params.userId - Logged-in user ID
 * @param {string} params.fruitTypeId - Fruit type ID
 * @param {number} params.quantityKg - Order quantity in kg
 * @param {string} params.ip - Client IP for VNPay
 * @param {Object} [params.receiverInfo] - Optional receiver_name, receiver_phone, receiver_address
 * @returns {Promise<{ success: boolean, paymentIntentId: string, payUrl: string, expiresAt: Date }>}
 */
async function createPaymentIntentAndGetPayUrl({ userId, fruitTypeId, quantityKg, ip, receiverInfo }) {
  const fruitType = await FruitTypeModel.findById(fruitTypeId).lean();
  if (!fruitType) throw new Error("Fruit type not found");
  if (!fruitType.allowPreOrder || fruitType.status !== "ACTIVE") {
    throw new Error("This fruit type does not accept pre-orders");
  }
  if (isPreOrderLockedByHarvest(fruitType.estimatedHarvestDate)) {
    throw new Error(`Pre-order closed for this fruit: less than ${DAYS_BEFORE_HARVEST_TO_LOCK} days until harvest.`);
  }
  const qty = Number(quantityKg);
  if (isNaN(qty) || qty < fruitType.minOrderKg || qty > fruitType.maxOrderKg) {
    throw new Error("Quantity (kg) must be between " + fruitType.minOrderKg + " and " + fruitType.maxOrderKg);
  }
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

/**
 * Admin: list pre-orders with optional filter by status, keyword search (customer name/email, product name), sort and pagination.
 *
 * Flow:
 * 1. Build query: exclude CANCELLED; optional status filter; keyword matches userId (user_name/email) or fruitTypeId (name)
 * 2. Apply sort (createdAt | status | totalAmount), skip/limit for pagination
 * 3. Return list (populated userId, fruitTypeId) and pagination metadata
 *
 * @param {Object} [filters={}] - Filter and pagination options
 * @param {string} [filters.status] - Optional status filter (WAITING_FOR_ALLOCATION | WAITING_FOR_NEXT_BATCH | ALLOCATED_WAITING_PAYMENT | READY_FOR_FULFILLMENT | COMPLETED)
 * @param {string} [filters.keyword] - Search term for customer name/email or fruit type name
 * @param {number} [filters.page=1] - Page number
 * @param {number} [filters.limit=20] - Items per page
 * @param {string} [filters.sortBy="createdAt"] - Sort field: createdAt | status | totalAmount
 * @param {string} [filters.sortOrder="desc"] - asc | desc
 * @returns {Promise<{ status: string, data: Array, pagination: Object }>}
 */
async function getAdminPreOrderList(filters = {}) {
  const { status, page = 1, limit = 20, keyword, sortBy = "createdAt", sortOrder = "desc" } = filters;
  const query = { status: { $nin: ["CANCELLED"] } };
  if (status) query.status = status;
  if (keyword && String(keyword).trim()) {
    const k = String(keyword).trim();
    const [userIds, fruitTypeIds] = await Promise.all([
      UserModel.find({ $or: [{ user_name: { $regex: k, $options: "i" } }, { email: { $regex: k, $options: "i" } }] }).distinct("_id"),
      FruitTypeModel.find({ name: { $regex: k, $options: "i" } }).distinct("_id"),
    ]);
    query.$or = [{ userId: { $in: userIds } }, { fruitTypeId: { $in: fruitTypeIds } }];
    if (userIds.length === 0 && fruitTypeIds.length === 0) {
      query._id = null;
    }
  }
  const limitNum = Math.max(1, Math.min(100, Number(limit) || 20));
  const pageNum = Math.max(1, Number(page) || 1);
  const skip = (pageNum - 1) * limitNum;
  const sortField = ["createdAt", "status", "totalAmount"].includes(sortBy) ? sortBy : "createdAt";
  const sortOpt = { [sortField]: sortOrder === "asc" ? 1 : -1 };

  const [list, total] = await Promise.all([
    PreOrderModel.find(query)
      .populate("userId", "user_name email")
      .populate("fruitTypeId", "name estimatedPrice")
      .sort(sortOpt)
      .skip(skip)
      .limit(limitNum)
      .lean(),
    PreOrderModel.countDocuments(query),
  ]);
  return {
    status: "OK",
    data: list,
    pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) },
  };
}

/**
 * Admin: get a single pre-order by ID with populated customer and fruit type.
 *
 * @param {string} id - Pre-order document ID
 * @returns {Promise<{ status: string, data: Object }>} Pre-order with userId (user_name, email), fruitTypeId (name, estimatedPrice, estimatedHarvestDate)
 */
async function getAdminPreOrderDetail(id) {
  const po = await PreOrderModel.findById(id)
    .populate("userId", "user_name email")
    .populate("fruitTypeId", "name estimatedPrice estimatedHarvestDate")
    .lean();
  if (!po) throw new Error("Pre-order not found");
  return { status: "OK", data: po };
}

/**
 * Customer: list my pre-orders with optional status filter, sort and pagination. Enriches each order with remainingAmount and canPayRemaining.
 *
 * Business rules:
 * - canPayRemaining = true only when: status ALLOCATED_WAITING_PAYMENT and remaining amount > 0
 * - remainingAmount = 0 if remainingPaidAt is set; otherwise totalAmount - depositPaid
 *
 * Flow:
 * 1. Build filter by userId and optional status; apply sort and pagination
 * 2. Fetch pre-orders and total count in parallel
 * 3. For each pre-order: compute remainingAmount, set canPayRemaining (status === ALLOCATED_WAITING_PAYMENT && remainingAmount > 0)
 *
 * @param {string} userId - Logged-in customer user ID
 * @param {Object} [query={}] - Query options
 * @param {number} [query.page=1] - Page number
 * @param {number} [query.limit=20] - Items per page
 * @param {string} [query.sortBy="createdAt"] - createdAt | status | totalAmount
 * @param {string} [query.sortOrder="desc"] - asc | desc
 * @param {string} [query.status] - Optional: WAITING_FOR_ALLOCATION | WAITING_FOR_NEXT_BATCH | ALLOCATED_WAITING_PAYMENT | READY_FOR_FULFILLMENT | COMPLETED
 * @returns {Promise<{ status: string, data: Array, pagination: Object }>}
 */
const PREORDER_STATUSES = ["WAITING_FOR_ALLOCATION", "WAITING_FOR_NEXT_BATCH", "ALLOCATED_WAITING_PAYMENT", "READY_FOR_FULFILLMENT", "COMPLETED", "REFUND", "CANCELLED", "WAITING_FOR_PRODUCT"];

async function getMyPreOrders(userId, query = {}) {
  const { page = 1, limit = 20, sortBy = "createdAt", sortOrder = "desc", status } = query;
  const limitNum = Math.max(1, Math.min(100, Number(limit) || 20));
  const pageNum = Math.max(1, Number(page) || 1);
  const skip = (pageNum - 1) * limitNum;
  const sortField = ["createdAt", "status", "totalAmount"].includes(sortBy) ? sortBy : "createdAt";
  const sortOpt = { [sortField]: sortOrder === "asc" ? 1 : -1 };

  const filter = { userId };
  if (status && PREORDER_STATUSES.includes(status)) {
    filter.status = status;
  }

  const [list, total] = await Promise.all([
    PreOrderModel.find(filter)
      .populate("fruitTypeId", "name estimatedPrice estimatedHarvestDate")
      .sort(sortOpt)
      .skip(skip)
      .limit(limitNum)
      .lean(),
    PreOrderModel.countDocuments(filter),
  ]);

  const dataWithRemaining = list.map((po) => {
    const depositPaid = po.depositPaid ?? 0;
    const totalAmount = po.totalAmount ?? 0;
    const remainingAmount = po.remainingPaidAt ? 0 : Math.max(0, totalAmount - depositPaid);
    const canPayRemaining = po.status === "ALLOCATED_WAITING_PAYMENT" && remainingAmount > 0;
    return { ...po, remainingAmount, canPayRemaining };
  });
  return {
    status: "OK",
    data: dataWithRemaining,
    pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) },
  };
}

/** Remaining payment intent expiry in minutes (VNPay redirect). */
const REMAINING_INTENT_EXPIRE_MINUTES = 15;

/**
 * Create a remaining-payment intent (50% balance) and return VNPay URL. Allowed only when pre-order status is ALLOCATED_WAITING_PAYMENT.
 *
 * Business rules:
 * - Pre-order must belong to userId and exist
 * - status must be ALLOCATED_WAITING_PAYMENT (stock allocated, waiting for remaining 50%)
 * - Order must not already be fully paid (remainingPaidAt null)
 * - Remaining amount = totalAmount - depositPaid must be > 0
 *
 * Flow:
 * 1. Load pre-order and validate ownership and status
 * 2. Compute remaining amount and create PreOrderRemainingPayment (PENDING)
 * 3. Build VNPay URL and return
 *
 * @param {string} preOrderId - Pre-order document ID
 * @param {string} userId - Logged-in customer user ID
 * @param {string} ip - Client IP for VNPay
 * @returns {Promise<{ success: boolean, payUrl: string, expiresAt: Date }>}
 */
async function createRemainingPaymentIntent(preOrderId, userId, ip) {
  const po = await PreOrderModel.findOne({ _id: preOrderId, userId }).lean();
  if (!po) throw new Error("Pre-order not found");
  if (po.status !== "ALLOCATED_WAITING_PAYMENT") {
    throw new Error("Remaining payment is available only when stock is allocated. Current status: " + (po.status || "unknown"));
  }
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

/**
 * Customer cancel pre-order. Business rule: pre-orders are not cancellable; always throws.
 *
 * @param {string} preOrderId - Pre-order document ID
 * @param {string} userId - Logged-in customer user ID
 * @throws {Error} Always, with message that pre-orders cannot be cancelled
 */
async function cancelPreOrder(preOrderId, userId) {
  const po = await PreOrderModel.findOne({ _id: preOrderId, userId });
  if (!po) throw new Error("Pre-order not found");
  throw new Error("Pre-orders cannot be cancelled. You confirmed this at checkout.");
}

/**
 * Fulfill deposit payment intent (VNPay callback): create PreOrder (WAITING_FOR_ALLOCATION), mark intent SUCCESS. Runs inside a MongoDB session.
 *
 * @param {string} intentId - PreOrderPaymentIntent document ID
 * @param {Object} session - MongoDB client session
 * @returns {Promise<Object|null>} Created pre-order document or null if already fulfilled
 */
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
    status: "WAITING_FOR_ALLOCATION",
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

/**
 * Fulfill remaining payment intent (VNPay callback): set pre-order remainingPaidAt and status READY_FOR_FULFILLMENT, mark intent SUCCESS. Runs inside a MongoDB session.
 *
 * Business rules:
 * - Intent must exist, be PENDING, and not expired
 * - Idempotent: if intent already SUCCESS, return null
 * - Updates: PreOrder.remainingPaidAt = now, PreOrder.status = READY_FOR_FULFILLMENT; intent.status = SUCCESS
 *
 * Flow:
 * 1. Load intent with session; if SUCCESS return null; validate PENDING and not expired
 * 2. Update pre-order by intent.preOrderId: set remainingPaidAt and status READY_FOR_FULFILLMENT
 * 3. Mark intent SUCCESS
 *
 * @param {string} remainingIntentId - PreOrderRemainingPayment document ID
 * @param {Object} session - MongoDB client session
 * @returns {Promise<Object|null>} Updated intent document or null if already fulfilled
 */
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
  const preOrder = await PreOrderModel.findById(intent.preOrderId).session(session).select("fruitTypeId").lean();
  const fruitTypeId = preOrder?.fruitTypeId?._id || preOrder?.fruitTypeId;
  const now = new Date();
  await PreOrderModel.updateOne(
    { _id: intent.preOrderId },
    { $set: { remainingPaidAt: now, status: "READY_FOR_FULFILLMENT" } },
    { session }
  );
  intent.status = "SUCCESS";
  await intent.save({ session });
  if (fruitTypeId) {
    const FruitTypeService = require("./FruitTypeService");
    FruitTypeService.maybeSetInactiveWhenDemandZero(fruitTypeId).catch((e) =>
      console.warn("FruitTypeService.maybeSetInactiveWhenDemandZero failed:", e.message)
    );
  }
  return intent;
}

/**
 * Admin: mark pre-order as COMPLETED when delivery is done. Allowed only when current status is READY_FOR_FULFILLMENT.
 *
 * Flow:
 * 1. Load pre-order; validate exists and status === READY_FOR_FULFILLMENT
 * 2. Update status to COMPLETED
 * 3. Return updated document with populated userId and fruitTypeId
 *
 * @param {string} preOrderId - Pre-order document ID
 * @returns {Promise<{ status: string, data: Object }>}
 */
async function markPreOrderCompleted(preOrderId) {
  const po = await PreOrderModel.findById(preOrderId).lean();
  if (!po) throw new Error("Pre-order not found");
  if (po.status !== "READY_FOR_FULFILLMENT") {
    throw new Error("Only orders with status Ready for fulfillment can be marked completed. Current: " + (po.status || "unknown"));
  }
  await PreOrderModel.updateOne({ _id: preOrderId }, { $set: { status: "COMPLETED" } });
  const FruitTypeService = require("./FruitTypeService");
  const fruitTypeId = po.fruitTypeId && (po.fruitTypeId._id || po.fruitTypeId);
  if (fruitTypeId) {
    FruitTypeService.maybeSetInactiveWhenDemandZero(fruitTypeId).catch((e) =>
      console.warn("FruitTypeService.maybeSetInactiveWhenDemandZero failed:", e.message)
    );
  }
  return { status: "OK", data: await PreOrderModel.findById(preOrderId).populate("userId", "user_name email").populate("fruitTypeId", "name estimatedPrice").lean() };
}

/**
 * Admin: mark pre-order as Refund (customer contacted for refund; refund handled outside system).
 * Allowed from any status except already REFUND.
 *
 * @param {string} preOrderId - Pre-order document ID
 * @returns {Promise<{ status: string, data: Object }>}
 */
async function markPreOrderRefunded(preOrderId) {
  const po = await PreOrderModel.findById(preOrderId).lean();
  if (!po) throw new Error("Pre-order not found");
  if (po.status === "REFUND") {
    throw new Error("This pre-order is already marked as Refund.");
  }
  await PreOrderModel.updateOne({ _id: preOrderId }, { $set: { status: "REFUND" } });
  const FruitTypeService = require("./FruitTypeService");
  const fruitTypeId = po.fruitTypeId && (po.fruitTypeId._id || po.fruitTypeId);
  if (fruitTypeId) {
    FruitTypeService.maybeSetInactiveWhenDemandZero(fruitTypeId).catch((e) =>
      console.warn("FruitTypeService.maybeSetInactiveWhenDemandZero failed:", e.message)
    );
  }
  return { status: "OK", data: await PreOrderModel.findById(preOrderId).populate("userId", "user_name email").populate("fruitTypeId", "name estimatedPrice").lean() };
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
  markPreOrderCompleted,
  markPreOrderRefunded,
  CANCEL_WINDOW_HOURS,
};
