const cron = require("node-cron");
const ProductBatchService = require("../services/ProductBatchService");
const { formatDateVN } = require("../utils/dateVN");


// ✅ Helper: Format datetime cho log (theo timezone VN)
const formatDateTimeVN = () => {
  const now = new Date();
  const vnTime = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" }));
  const dateStr = formatDateVN(vnTime);
  const hours = String(vnTime.getHours()).padStart(2, "0");
  const minutes = String(vnTime.getMinutes()).padStart(2, "0");
  const seconds = String(vnTime.getSeconds()).padStart(2, "0");
  return `${dateStr} ${hours}:${minutes}:${seconds}`;
};


/**
 * Chạy một lần: kiểm tra và reset sản phẩm hết hạn (dùng khi server khởi động lại sau khi miss 00:00)
 */
const runExpiredCheckOnce = async () => {
  console.log(`[${formatDateTimeVN()}] Running startup check: expired products...`);
  try {
    const result = await ProductBatchService.autoResetExpiredProducts();
    if (result.status === "OK") {
      const resetCount = result.data?.resetCount || 0;
      const skippedCount = result.data?.skippedCount || 0;
      const message = result.message || "";
      console.log(`[${formatDateTimeVN()}] Startup expired check completed:`, { resetCount, skippedCount, message });
      if (resetCount > 0 && result.data?.resetProducts) {
        console.log(`[${formatDateTimeVN()}] Reset products (startup):`, result.data.resetProducts);
      }
      if (skippedCount > 0 && result.data?.skippedProducts) {
        console.log(`[${formatDateTimeVN()}] Skipped (orders in transition):`, result.data.skippedProducts);
      }
    } else {
      console.error(`[${formatDateTimeVN()}] Startup expired check failed:`, result.message);
    }
  } catch (error) {
    console.error(`[${formatDateTimeVN()}] Error in startup expired check:`, error);
  }
};


/**
 * Chạy một lần: chốt lô các sản phẩm đã bán hết nhưng chưa được reset (bắt lại trường hợp bán hết trước khi có auto-reset)
 */
const runSoldOutCatchUpOnce = async () => {
  console.log(`[${formatDateTimeVN()}] Running startup check: sold-out products (catch-up)...`);
  try {
    const result = await ProductBatchService.autoResetSoldOutProductsCatchUp();
    if (result.status === "OK") {
      const resetCount = result.data?.resetCount || 0;
      console.log(`[${formatDateTimeVN()}] Startup sold-out catch-up completed:`, { resetCount });
      if (resetCount > 0 && result.data?.resetProducts) {
        console.log(`[${formatDateTimeVN()}] Chốt lô (catch-up):`, result.data.resetProducts);
      }
    } else {
      console.error(`[${formatDateTimeVN()}] Startup sold-out catch-up failed:`, result.message);
    }
  } catch (error) {
    console.error(`[${formatDateTimeVN()}] Error in startup sold-out catch-up:`, error);
  }
};


/**
 * Scheduled job: Tự động chốt lô
 * - Chạy hàng ngày lúc 00:00 (Asia/Ho_Chi_Minh).
 * - 1) Expired: reset sản phẩm hết hạn (chỉ khi đơn COMPLETED/CANCELLED/REFUND).
 * - 2) Sold-out catch-up: chốt lô đã bán hết nhưng chưa reset (chờ qua ngày hoặc nhận đủ).
 */
const startProductBatchJob = () => {
  cron.schedule("0 0 * * *", async () => {
    console.log(`[${formatDateTimeVN()}] Starting product batch jobs...`);
    try {
      const expiredResult = await ProductBatchService.autoResetExpiredProducts();
      if (expiredResult.status === "OK") {
        const resetCount = expiredResult.data?.resetCount || 0;
        const skippedCount = expiredResult.data?.skippedCount || 0;
        console.log(`[${formatDateTimeVN()}] Auto-reset expired products completed:`, { resetCount, skippedCount });
        if (resetCount > 0 && expiredResult.data?.resetProducts) {
          console.log(`[${formatDateTimeVN()}] Reset products (expired):`, expiredResult.data.resetProducts);
        }
        if (skippedCount > 0 && expiredResult.data?.skippedProducts) {
          console.log(`[${formatDateTimeVN()}] Skipped (orders in transition):`, expiredResult.data.skippedProducts);
        }
      } else {
        console.error(`[${formatDateTimeVN()}] Auto-reset expired products failed:`, expiredResult.message);
      }
      const soldOutResult = await ProductBatchService.autoResetSoldOutProductsCatchUp();
      if (soldOutResult.status === "OK") {
        const catchUpCount = soldOutResult.data?.resetCount || 0;
        console.log(`[${formatDateTimeVN()}] Sold-out catch-up completed:`, { resetCount: catchUpCount });
        if (catchUpCount > 0 && soldOutResult.data?.resetProducts) {
          console.log(`[${formatDateTimeVN()}] Chốt lô (sold-out catch-up):`, soldOutResult.data.resetProducts);
        }
      } else {
        console.error(`[${formatDateTimeVN()}] Sold-out catch-up failed:`, soldOutResult.message);
      }
    } catch (error) {
      console.error(`[${formatDateTimeVN()}] Error in product batch jobs:`, error);
    }
  }, {
    timezone: "Asia/Ho_Chi_Minh", // ✅ Set timezone cho cron job
  });
 
  console.log("✅ Product batch jobs scheduled (expired + sold-out catch-up, daily at 00:00 VN)");
};


module.exports = {
  startProductBatchJob,
};
