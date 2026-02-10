/**
 * Pre-order Fulfillment Job (daily reminder)
 *
 * Sends pay-remaining reminder (email + FCM) to customers with pre-orders in ALLOCATED_WAITING_PAYMENT.
 * Runs once daily at 09:00 (Asia/Ho_Chi_Minh). Change CRON_DAILY expression to change schedule.
 *
 * @module jobs/preorderFulfillmentJob
 */
const cron = require("node-cron");
const PreOrderAllocationModel = require("../models/PreOrderAllocationModel");
const { triggerReadyAndNotifyForFruitType } = require("../services/preorderFulfillmentLogic");

/** Cron expression: 09:00 every day (VN time). */
const CRON_DAILY = "0 9 * * *";

/**
 * Schedule the daily pre-order pay-remaining reminder job.
 * For each fruit type with allocation, triggers notifications for ALLOCATED_WAITING_PAYMENT orders.
 */
function run() {
  cron.schedule(
    CRON_DAILY,
    async () => {
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
    },
    { timezone: "Asia/Ho_Chi_Minh" }
  );
  console.log("Pre-order pay-remaining reminder job scheduled (daily at 09:00 VN time)");
}

module.exports = { run };
