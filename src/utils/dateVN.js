// ✅ Helper: Lấy ngày hiện tại theo timezone Asia/Ho_Chi_Minh (date-only, YYYY-MM-DD)
const getTodayInVietnam = () => {
  const now = new Date();
  // Chuyển sang timezone Vietnam (UTC+7)
  const vietnamTime = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" }));
  // Reset về 00:00:00 để có date-only
  vietnamTime.setHours(0, 0, 0, 0);
  return vietnamTime;
};

// ✅ Helper: Format Date thành string YYYY-MM-DD theo timezone VN
const formatDateVN = (date) => {
  if (!date) return null;
  const d = new Date(date);
  const vnDate = new Date(d.toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" }));
  const year = vnDate.getFullYear();
  const month = String(vnDate.getMonth() + 1).padStart(2, "0");
  const day = String(vnDate.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

// ✅ Helper: So sánh 2 ngày (date-only, bỏ qua giờ)
const compareDates = (date1, date2) => {
  const d1 = new Date(date1);
  d1.setHours(0, 0, 0, 0);
  const d2 = new Date(date2);
  d2.setHours(0, 0, 0, 0);
  return d1.getTime() === d2.getTime();
};

// ✅ Helper: Tính số ngày giữa 2 ngày (date-only, không tính giờ) - dùng Math.floor để chính xác hơn
const calculateDaysBetween = (date1, date2) => {
  const d1 = new Date(date1);
  d1.setHours(0, 0, 0, 0);
  const d2 = new Date(date2);
  d2.setHours(0, 0, 0, 0);
  const diffTime = d2.getTime() - d1.getTime();
  // Dùng Math.floor thay vì Math.ceil để chính xác hơn với date-only
  return Math.floor(diffTime / (1000 * 60 * 60 * 24));
};

module.exports = {
  getTodayInVietnam,
  formatDateVN,
  compareDates,
  calculateDaysBetween,
};
