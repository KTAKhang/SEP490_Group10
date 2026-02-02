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
 * After allocation: verify stock is fully received for this fruit type, then send email and FCM to all customers
 * with WAITING_FOR_PRODUCT pre-orders for that fruit type, asking them to pay the remaining 50%. Does NOT update
 * pre-order status (READY_FOR_FULFILLMENT is set only when customer pays remaining via fulfillRemainingPayment).
 *
 * Flow:
 * 1. Load allocation for fruitTypeId; if allocatedKg <= 0, return { updated: 0 }
 * 2. Load PreOrderStock for fruitTypeId; if receivedKg < allocatedKg, return { updated: 0 }
 * 3. Load all pre-orders for this fruitTypeId with status WAITING_FOR_PRODUCT (cursor = list of pre-orders)
 * 4. Collect unique userIds and fruitTypeIds; load User and FruitType for email/notification
 * 5. For each pre-order: send PreOrderReady email (customer email, name, fruit name, quantityKg, DAYS_TO_PAY)
 * 6. For each unique userId: send FCM notification (title/body/data) to pay remaining balance
 * 7. Return { updated: ids.length }
 *
 * @param {string} fruitTypeIdStr - Fruit type ObjectId as string
 * @returns {Promise<{ updated: number }>} Number of pre-orders notified (0 if allocation/stock not ready)
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
    status: "WAITING_FOR_PRODUCT",
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

module.exports = { triggerReadyAndNotifyForFruitType, DAYS_TO_PAY };
