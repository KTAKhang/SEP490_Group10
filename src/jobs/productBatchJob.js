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
      const message = result.message || "";
      console.log(`[${formatDateTimeVN()}] Startup expired check completed:`, { resetCount, message });
      if (resetCount > 0 && result.data?.resetProducts) {
        console.log(`[${formatDateTimeVN()}] Reset products (startup):`, result.data.resetProducts);
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
 * Scheduled job: Tự động reset products hết hạn
 * - Khi server khởi động: chạy 1 lần kiểm tra sản phẩm hết hạn (bắt trường hợp miss 00:00)
 * - Hàng ngày lúc 00:00 (Asia/Ho_Chi_Minh): chạy lại
 */
const startProductBatchJob = () => {
  // ✅ Khi chạy code lên: check sản phẩm hết hạn + bắt lại sản phẩm bán hết chưa chốt lô
  runExpiredCheckOnce();
  runSoldOutCatchUpOnce();


  // Chạy mỗi ngày lúc 00:00 (theo timezone Asia/Ho_Chi_Minh)
  cron.schedule("0 0 * * *", async () => {
    console.log(`[${formatDateTimeVN()}] Starting auto-reset expired products job...`);  
    try {
      const result = await ProductBatchService.autoResetExpiredProducts();   
      if (result.status === "OK") {
        const resetCount = result.data?.resetCount || 0;
      
        console.log(`[${formatDateTimeVN()}] Auto-reset expired products completed:`, {
          resetCount: resetCount,
        });    
        // ✅ Log các sản phẩm đã được reset
        if (resetCount > 0 && result.data?.resetProducts) {
          console.log(`[${formatDateTimeVN()}] Reset products:`, result.data.resetProducts);
        }
      } else {
        console.error(`[${formatDateTimeVN()}] Auto-reset expired products failed:`, result.message);
      }
    } catch (error) {
      console.error(`[${formatDateTimeVN()}] Error in auto-reset expired products job:`, error);
    }
  }, {
    timezone: "Asia/Ho_Chi_Minh", // ✅ Set timezone cho cron job
  });
 
  console.log("✅ Product batch auto-reset expired job scheduled (runs daily at 00:00 VN time)");
};


module.exports = {
  startProductBatchJob,
};
