/**
 * Pre-order Fulfillment Logic (post-allocation notifications)
 *
 * Called after admin allocates stock for a fruit type. Does NOT change pre-order status to READY_FOR_FULFILLMENT
 * (status becomes READY only after customer pays the remaining 50%). This module only sends email and FCM
 * notifications to customers asking them to pay the remaining balance. Does not use Product model.
 */

const mongoose = require("mongoose");
const PreOrderModel = require("../models/PreOrderModel");
const PreOrderAllocationModel = require("../models/PreOrderAllocationModel");
const PreOrderStockModel = require("../models/PreOrderStockModel");
const UserModel = require("../models/UserModel");
const FruitTypeModel = require("../models/FruitTypeModel");
const NotificationService = require("./NotificationService");
const CustomerEmailService = require("./CustomerEmailService");

/** Number of days given to customer to pay remaining balance (used in email/notification copy). */
const DAYS_TO_PAY = 7;

/**
 * After allocation: send email and FCM to all customers with ALLOCATED_WAITING_PAYMENT pre-orders for that fruit type,
 * asking them to pay the remaining 50%. Does NOT update pre-order status (READY_FOR_FULFILLMENT is set only when
 * customer pays remaining via fulfillRemainingPayment).
 *
 * Flow:
 * 1. Load allocation for fruitTypeId; if allocatedKg <= 0, return { updated: 0 }
 * 2. Load PreOrderStock for fruitTypeId; if receivedKg < allocatedKg, return { updated: 0 }
 * 3. Load all pre-orders for this fruitTypeId with status ALLOCATED_WAITING_PAYMENT
 * 4. For each: send PreOrderReady email and FCM to pay remaining balance
 *
 * @param {string} fruitTypeIdStr - Fruit type ObjectId as string
 * @returns {Promise<{ updated: number }>} Number of pre-orders notified (0 if none)
 */
async function triggerReadyAndNotifyForFruitType(fruitTypeIdStr) {
  const allocation = await PreOrderAllocationModel.findOne({
    fruitTypeId: new mongoose.Types.ObjectId(fruitTypeIdStr),
  }).lean();
  const allocatedKg = allocation?.allocatedKg ?? 0;
  if (allocatedKg <= 0) return { updated: 0 };

  const stock = await PreOrderStockModel.findOne({
    fruitTypeId: new mongoose.Types.ObjectId(fruitTypeIdStr),
  }).lean();
  const receivedKg = stock?.receivedKg ?? 0;
  if (receivedKg < allocatedKg) return { updated: 0 };

  const fruitTypeObjId = new mongoose.Types.ObjectId(fruitTypeIdStr);
  const cursor = await PreOrderModel.find({
    fruitTypeId: fruitTypeObjId,
    status: "ALLOCATED_WAITING_PAYMENT",
  })
    .select("_id userId fruitTypeId quantityKg")
    .lean();

  const ids = cursor.map((d) => d._id);
  const userIds = [...new Set(cursor.map((d) => d.userId.toString()))];
  const fruitTypeIds = [...new Set(cursor.map((d) => d.fruitTypeId.toString()))];
  if (ids.length === 0) return { updated: 0 };

  const users = await UserModel.find({ _id: { $in: userIds.map((id) => new mongoose.Types.ObjectId(id)) } })
    .select("email user_name")
    .lean();
  const userMap = Object.fromEntries(users.map((u) => [u._id.toString(), u]));

  const fruitTypes = await FruitTypeModel.find({ _id: { $in: fruitTypeIds.map((id) => new mongoose.Types.ObjectId(id)) } })
    .select("name")
    .lean();
  const fruitTypeMap = Object.fromEntries(fruitTypes.map((f) => [f._id.toString(), f]));

  for (const po of cursor) {
    try {
      const u = userMap[po.userId.toString()];
      const ft = fruitTypeMap[po.fruitTypeId.toString()];
      if (u?.email) {
        await CustomerEmailService.sendPreOrderReadyEmail(
          u.email,
          u.user_name,
          ft?.name,
          po.quantityKg || 0,
          DAYS_TO_PAY
        );
      }
    } catch (e) {
      console.warn("PreOrder ready email skip:", e.message);
    }
  }

  const fcmBody = `Please pay the remaining amount within ${DAYS_TO_PAY} days. If not paid in full, the order may be cancelled and the deposit will not be refunded.`;
  for (const uid of userIds) {
    try {
      await NotificationService.sendToUser(uid, {
        title: "Pre-order ready – Pay remaining balance",
        body: fcmBody,
        data: { type: "preorder", action: "view_my_preorders" },
      });
    } catch (e) {
      console.warn("PreOrder notify skip:", e.message);
    }
  }

  return { updated: ids.length };
}

/**
 * Notify customer when their pre-order is moved to WAITING_FOR_NEXT_BATCH (allocation attempted but
 * insufficient stock). Triggered ONLY from PreOrderAllocationService.upsertAllocation when we set
 * status from WAITING_FOR_ALLOCATION/WAITING_FOR_PRODUCT → WAITING_FOR_NEXT_BATCH (one order per run).
 * Sends FCM + Email: reason (supplier delivered less), status, commitment to allocate next batch,
 * no payment required at this step.
 *
 * @param {Object} preOrder - PreOrder document (or lean) with _id, userId, fruitTypeId, quantityKg
 * @returns {Promise<{ sent: boolean }>}
 */
async function notifyPreOrderDelayed(preOrder) {
  if (!preOrder || !preOrder.userId || !preOrder.fruitTypeId) return { sent: false };
  const userIdStr = preOrder.userId.toString();
  const fruitTypeIdStr = preOrder.fruitTypeId.toString();

  const [user, fruitType] = await Promise.all([
    UserModel.findById(preOrder.userId).select("email user_name").lean(),
    FruitTypeModel.findById(preOrder.fruitTypeId).select("name").lean(),
  ]);
  if (!user) return { sent: false };

  const fruitName = fruitType?.name || "sản phẩm đặt trước";
  const qty = preOrder.quantityKg ?? 0;

  if (user.email) {
    try {
      await CustomerEmailService.sendPreOrderDelayedEmail(
        user.email,
        user.user_name,
        fruitName,
        qty
      );
    } catch (e) {
      console.warn("PreOrder delayed email skip:", e.message);
    }
  }

  try {
    await NotificationService.sendToUser(userIdStr, {
      title: "Pre-order delayed – Next batch priority",
      body: "Your pre-order could not be allocated this round (supplier delivered less). Your order will be prioritized in the next receive batch. No payment needed now.",
      data: { type: "preorder", action: "view_my_preorders", status: "WAITING_FOR_NEXT_BATCH" },
    });
  } catch (e) {
    console.warn("PreOrder delayed FCM skip:", e.message);
  }

  return { sent: true };
}

module.exports = { triggerReadyAndNotifyForFruitType, notifyPreOrderDelayed, DAYS_TO_PAY };
