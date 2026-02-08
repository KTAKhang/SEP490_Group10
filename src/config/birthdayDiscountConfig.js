/**
 * Birthday voucher configuration.
 * Override via environment variables.
 */
module.exports = {
    /** Discount percentage (e.g. 10 or 15) */
    discountPercent: Number(process.env.BIRTHDAY_DISCOUNT_PERCENT) || 10,
    /** Minimum order value to use the voucher */
    minOrderValue: Number(process.env.BIRTHDAY_MIN_ORDER) || 100000,
    /** Maximum discount amount in VND */
    maxDiscountAmount: Number(process.env.BIRTHDAY_MAX_DISCOUNT) || 50000,
    /** Voucher validity in days (from creation) */
    expiryDays: Number(process.env.BIRTHDAY_VOUCHER_DAYS) || 7,
};
