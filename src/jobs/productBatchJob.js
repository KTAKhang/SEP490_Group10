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
 * Scheduled job: Auto-reset products hết hạn
 * Chạy mỗi ngày lúc 00:00 (theo timezone Asia/Ho_Chi_Minh)
 * Cron expression: "0 0 * * *" = 00:00 mỗi ngày (theo server timezone)
 * 
 * Lưu ý: Server timezone nên được set về Asia/Ho_Chi_Minh hoặc tính toán offset
 */
const startProductBatchJob = () => {
  // Chạy mỗi ngày lúc 00:00 (theo server timezone)
  // Nếu server timezone là UTC, thì 00:00 UTC = 07:00 VN
  // Để chạy đúng 00:00 VN, cần set: "0 17 * * *" (17:00 UTC = 00:00 VN+7)
  // Hoặc tốt hơn: set server timezone về Asia/Ho_Chi_Minh
  
  // Tạm thời dùng "0 0 * * *" và giả định server timezone = VN
  // Nếu server timezone khác, cần điều chỉnh cron expression
  cron.schedule("0 0 * * *", async () => {
    console.log(`[${formatDateTimeVN()}] Starting auto-reset expired products job...`);
    
    try {
      const result = await ProductBatchService.autoResetExpiredProducts();
      
      if (result.status === "OK") {
        const resetCount = result.data?.resetCount || 0;
        const errors = result.data?.errors || [];
        
        console.log(`[${formatDateTimeVN()}] Auto-reset completed:`, {
          resetCount: resetCount,
          errors: errors.length,
        });
        
        // ✅ (Optional) Gửi notification cho admin
        // Có thể gửi email hoặc log vào database
        if (resetCount > 0 && result.data?.resetProducts) {
          console.log(`[${formatDateTimeVN()}] Reset products:`, result.data.resetProducts);
        }
        
        if (errors.length > 0) {
          console.error(`[${formatDateTimeVN()}] Errors during auto-reset:`, errors);
        }
      } else {
        console.error(`[${formatDateTimeVN()}] Auto-reset failed:`, result.message);
      }
    } catch (error) {
      console.error(`[${formatDateTimeVN()}] Error in auto-reset job:`, error);
    }
  }, {
    timezone: "Asia/Ho_Chi_Minh", // ✅ Set timezone cho cron job
  });
  
  console.log("✅ Product batch auto-reset job scheduled (runs daily at 00:00 VN time)");
};

module.exports = {
  startProductBatchJob,
};
