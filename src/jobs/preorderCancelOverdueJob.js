/**
 * Pre-order Cancel Overdue Job
 *
 * Automatically cancels pre-orders that have been in ALLOCATED_WAITING_PAYMENT
 * (allocated, waiting for remaining payment) for more than 7 days.
 * Business rule: if customer does not pay remaining within 7 days, order is cancelled.
 *
 * Runs once daily at 00:10 (Asia/Ho_Chi_Minh). Uses updatedAt to determine how long
 * the order has been in current status (updatedAt is set when status becomes ALLOCATED_WAITING_PAYMENT).
 *
 * @module jobs/preorderCancelOverdueJob
 */
const cron = require("node-cron");
const PreOrderModel = require("../models/PreOrderModel");
const PreOrderService = require("../services/PreOrderService");

/** Cron expression: 00:10 every day (VN time). */
const CRON_DAILY = "10 0 * * *";

/** Days after which ALLOCATED_WAITING_PAYMENT is auto-cancelled. */
const DAYS_OVERDUE = 7;

function run() {
  cron.schedule(
    CRON_DAILY,
    async () => {
      try {
        const cutoff = new Date(Date.now() - DAYS_OVERDUE * 24 * 60 * 60 * 1000);
        const overdue = await PreOrderModel.find({
          status: "ALLOCATED_WAITING_PAYMENT",
          updatedAt: { $lt: cutoff },
        })
          .select("_id")
          .lean();
        let cancelled = 0;
        for (const po of overdue) {
          try {
            await PreOrderService.markPreOrderCancelled(po._id.toString());
            cancelled += 1;
          } catch (err) {
            console.warn("PreOrder cancel overdue: skip order", po._id, err.message);
          }
        }
        if (cancelled > 0) {
          console.log(`Pre-order cancel overdue job: cancelled ${cancelled} order(s) (ALLOCATED_WAITING_PAYMENT > ${DAYS_OVERDUE} days)`);
        }
      } catch (err) {
        console.error("Pre-order cancel overdue job error:", err.message);
      }
    },
    { timezone: "Asia/Ho_Chi_Minh" }
  );
  console.log(`Pre-order cancel overdue job scheduled (daily at 00:10 VN time, cancel if > ${DAYS_OVERDUE} days in ALLOCATED_WAITING_PAYMENT)`);
}

module.exports = { run, DAYS_OVERDUE };
