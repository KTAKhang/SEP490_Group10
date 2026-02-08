/**
 * Daily CRON: generate birthday vouchers for users whose birthday is today (VN time),
 * then send FCM + email. Runs at 00:05 Asia/Ho_Chi_Minh. Uses User.birthday only (no User/Profile changes).
 */
const cron = require("node-cron");
const DiscountService = require("../services/DiscountService");

const CRON_EXPRESSION = "5 0 * * *"; // 00:05 every day (minute 5, hour 0)

function startBirthdayVoucherJob() {
    cron.schedule(
        CRON_EXPRESSION,
        async () => {
            console.log("[BirthdayVoucher] Starting daily birthday voucher job...");
            try {
                const result = await DiscountService.runDailyBirthdayVouchers();
                console.log("[BirthdayVoucher] Job finished:", result);
            } catch (error) {
                console.error("[BirthdayVoucher] Job failed:", error);
            }
        },
        { timezone: "Asia/Ho_Chi_Minh" }
    );
    console.log("Birthday voucher cron scheduled (daily at 00:05 VN time)");
}

module.exports = { startBirthdayVoucherJob };
