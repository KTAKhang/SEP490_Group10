/**
 * Kiểm tra đủ hàng từ Kho trả đơn (PreOrderStock) → chuyển PreOrder sang READY + gửi Email + FCM + Notification.
 * Không dùng Product.
 */
const mongoose = require("mongoose");
const PreOrderModel = require("../models/PreOrderModel");
const PreOrderAllocationModel = require("../models/PreOrderAllocationModel");
const PreOrderStockModel = require("../models/PreOrderStockModel");
const UserModel = require("../models/UserModel");
const FruitTypeModel = require("../models/FruitTypeModel");
const NotificationService = require("./NotificationService");
const CustomerEmailService = require("./CustomerEmailService");

const DAYS_TO_PAY = 7;

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

  await PreOrderModel.updateMany(
    { _id: { $in: ids } },
    { $set: { status: "READY_FOR_FULFILLMENT" } }
  );

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
