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
    console.log(`[${formatDateTimeVN()}] Starting mark expired products for reset job...`);
    
    try {
      const result = await ProductBatchService.markExpiredProductsForReset();
      
      if (result.status === "OK") {
        const markedCount = result.data?.markedCount || 0;
        
        console.log(`[${formatDateTimeVN()}] Mark expired products completed:`, {
          markedCount: markedCount,
        });
        
        // ✅ (Optional) Gửi notification cho admin
        // Có thể gửi email hoặc log vào database
        if (markedCount > 0 && result.data?.markedProducts) {
          console.log(`[${formatDateTimeVN()}] Marked products (waiting for admin confirmation):`, result.data.markedProducts);
        }
      } else {
        console.error(`[${formatDateTimeVN()}] Mark expired products failed:`, result.message);
      }
    } catch (error) {
      console.error(`[${formatDateTimeVN()}] Error in mark expired products job:`, error);
    }
  }, {
    timezone: "Asia/Ho_Chi_Minh", // ✅ Set timezone cho cron job
  });
  
  console.log("✅ Product batch mark expired job scheduled (runs daily at 00:00 VN time)");
};

module.exports = {
  startProductBatchJob,
};
