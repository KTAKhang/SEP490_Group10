const cron = require("node-cron");
const PreOrderAllocationModel = require("../models/PreOrderAllocationModel");
const { triggerReadyAndNotifyForFruitType } = require("../services/preorderFulfillmentLogic");

/**
 * Khi SUM(receivedQuantity) >= SUM(allocatedKg) cho một FruitType,
 * chuyển PreOrders WAITING -> READY và gửi Email + FCM + Notification (bell).
 * Chạy mỗi 5 phút. Logic thực tế nằm trong preorderFulfillmentLogic.
 */
function run() {
  cron.schedule("*/5 * * * *", async () => {
    try {
      const allocations = await PreOrderAllocationModel.find().lean();
      const byFruit = {};
      for (const a of allocations) {
        const fid = a.fruitTypeId.toString();
        if (!byFruit[fid]) byFruit[fid] = { allocatedKg: 0 };
        byFruit[fid].allocatedKg += a.allocatedKg;
      }
      for (const fruitTypeIdStr of Object.keys(byFruit)) {
        await triggerReadyAndNotifyForFruitType(fruitTypeIdStr);
      }
    } catch (err) {
      console.error("PreOrder fulfillment job error:", err.message);
    }
  });
}

module.exports = { run };
