const { getTodayInVietnam } = require("./dateVN");
/**
 * Tính số ngày từ referenceDate đến expiry (date-only).
 * @param {Date|String} expiryDate - expiryDate hoặc expiryDateStr
 * @param {Date} referenceDate - ngày tham chiếu (thường là hôm nay VN)
 * @returns {number|null} Số ngày còn lại đến hạn (≥0 = chưa hết hạn, <0 = đã hết hạn), null nếu không có expiry
 */
const getDaysUntilExpiry = (expiryDate, referenceDate) => {
  if (expiryDate == null) return null;
  const expiry = typeof expiryDate === "string" ? new Date(expiryDate + "T12:00:00") : new Date(expiryDate);
  if (Number.isNaN(expiry.getTime())) return null;
  const ref = new Date(referenceDate);
  ref.setHours(0, 0, 0, 0);
  expiry.setHours(0, 0, 0, 0);
  const diffMs = expiry.getTime() - ref.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
};
/**
 * Tính giá bán hiệu lực cho khách: nếu còn ≤ nearExpiryDaysThreshold ngày thì giảm nearExpiryDiscountPercent%.
 * @param {Object} product - Document product (price, expiryDateStr hoặc expiryDate, nearExpiryDaysThreshold, nearExpiryDiscountPercent)
 * @param {Date} [referenceDate] - Ngày tham chiếu (mặc định: hôm nay VN)
 * @returns {{ effectivePrice: number, isNearExpiry: boolean, originalPrice: number }}
 */
const getEffectivePrice = (product, referenceDate) => {
  const originalPrice = Number(product?.price) || 0;
  const refDate = referenceDate || getTodayInVietnam();
  const expiryStr = product?.expiryDateStr ?? null;
  const expiryDate = product?.expiryDate ?? null;
  const expiry = expiryStr || expiryDate;
  const daysUntil = getDaysUntilExpiry(expiry, refDate);
  const effectivePrice = isNearExpiry
    ? Math.round(originalPrice * (1 - discountPercent / 100) * 100) / 100
    : originalPrice;
  return {
    effectivePrice,
    isNearExpiry: !!isNearExpiry,
    originalPrice,
  };
};
module.exports = {
  getDaysUntilExpiry,
  getEffectivePrice,
};
