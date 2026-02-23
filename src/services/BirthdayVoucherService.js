/**
 * Birthday Voucher Service – automatic daily generation of personal birthday discount codes.
 * Scalable: uses indexed queries (birthdayMonth/birthdayDay), no full user scan.
 * Idempotent: skips users who already received a birthday voucher this year.
 */
const UserModel = require("../models/UserModel");
const DiscountModel = require("../models/DiscountModel");
const RoleModel = require("../models/RolesModel");
const NotificationService = require("./NotificationService");
const CustomerEmailService = require("../services/CustomerEmailService");
const birthdayConfig = require("../config/birthdayDiscountConfig");
const mongoose = require("mongoose");

/**
 * Get today's month (1–12) and day (1–31) in Asia/Ho_Chi_Minh.
 */
function getTodayMonthDay() {
    const vnNow = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" }));
    return { month: vnNow.getMonth() + 1, day: vnNow.getDate(), year: vnNow.getFullYear() };
}

/**
 * Backfill birthdayMonth and birthdayDay from birthday for users that have birthday set but missing month/day.
 * Ensures indexed query by month/day can find them. Safe to run daily.
 */
async function backfillBirthdayMonthDay() {
    const result = await UserModel.updateMany(
        {
            birthday: { $exists: true, $ne: null },
            $or: [{ birthdayMonth: null }, { birthdayDay: null }],
        },
        [
            {
                $set: {
                    birthdayMonth: { $month: "$birthday" },
                    birthdayDay: { $dayOfMonth: "$birthday" },
                },
            },
        ]
    );
    return result.modifiedCount || 0;
}

/**
 * Find customer users whose birthday is today (day+month) using indexed fields.
 * Does NOT load all users; uses birthdayMonth + birthdayDay index.
 */
async function findBirthdayCustomersToday() {
    const { month, day } = getTodayMonthDay();
    const customerRole = await RoleModel.findOne({ name: "customer" });
    if (!customerRole) return [];

    const users = await UserModel.find({
        role_id: customerRole._id,
        status: true,
        birthdayMonth: month,
        birthdayDay: day,
    })
        .select("_id email user_name")
        .lean();

    return users;
}

/**
 * Check if user already received a birthday voucher in the given calendar year.
 */
async function alreadyReceivedThisYear(userId, year) {
    const startOfYear = new Date(year, 0, 1);
    const endOfYear = new Date(year, 11, 31, 23, 59, 59, 999);
    const existing = await DiscountModel.findOne({
        isBirthdayDiscount: true,
        targetUserId: new mongoose.Types.ObjectId(userId),
        createdAt: { $gte: startOfYear, $lte: endOfYear },
    }).lean();
    return !!existing;
}

    /**
     * Create one birthday discount for a user. Called after duplicate check.
     */
    async function createBirthdayDiscount(userId, year) {
        const now = new Date();
        const expiryDays = birthdayConfig.expiryDays;
        const endDate = new Date(now);
        endDate.setDate(endDate.getDate() + expiryDays);

        const code = `BDAY-${userId}-${year}`.toUpperCase();

        const discount = new DiscountModel({
            code,
            discountPercent: birthdayConfig.discountPercent,
            minOrderValue: birthdayConfig.minOrderValue,
            maxDiscountAmount: birthdayConfig.maxDiscountAmount,
            startDate: now,
            endDate,
            usageLimit: 1,
            usedCount: 0,
            status: "APPROVED",
            isActive: true,
            createdBy: null,
            approvedBy: null,
            approvedAt: now,
            description: "Birthday voucher auto generated",
            isBirthdayDiscount: true,
            targetUserId: new mongoose.Types.ObjectId(userId),
        });

        await discount.save();
        return discount;
    }

/**
 * Send FCM + email for a created birthday voucher. Logs errors; does not throw.
 */
async function sendBirthdayNotifications(user, discount) {
    const code = discount.code;
    const message = `Happy Birthday! Here is your personal discount code: ${code}`;

    try {
        await NotificationService.sendToUser(user._id.toString(), {
            title: "Happy Birthday!",
            body: message,
            data: {
                type: "discount",
                action: "view_voucher",
                code,
                discountId: discount._id.toString(),
            },
        });
    } catch (err) {
        console.error("[BirthdayVoucher] FCM failed for user", user._id, err.message);
    }

    try {
        const emailResult = await CustomerEmailService.sendBirthdayVoucherEmail(
            user.email,
            user.user_name || "Customer",
            code
        );
        if (emailResult.status !== "OK") {
            console.error("[BirthdayVoucher] Email failed for user", user._id, emailResult.message);
        }
    } catch (err) {
        console.error("[BirthdayVoucher] Email error for user", user._id, err.message);
    }
}

/**
 * Run daily birthday voucher generation: find today's birthday users, create voucher, notify.
 * Idempotent and restart-safe; skips users who already received this year.
 */
async function runDailyBirthdayVouchers() {
    const { year } = getTodayMonthDay();
    let backfilled = 0;
    let created = 0;
    let skipped = 0;

    try {
        backfilled = await backfillBirthdayMonthDay();
        if (backfilled > 0) {
            console.log("[BirthdayVoucher] Backfilled birthdayMonth/birthdayDay for", backfilled, "users");
        }

        const users = await findBirthdayCustomersToday();
        if (users.length === 0) {
            console.log("[BirthdayVoucher] No birthday users today");
            return { created, skipped, total: 0 };
        }

        for (const user of users) {
            const userId = user._id.toString();
            const already = await alreadyReceivedThisYear(userId, year);
            if (already) {
                skipped++;
                continue;
            }

            const discount = await createBirthdayDiscount(userId, year);
            created++;
            await sendBirthdayNotifications(user, discount);
        }

        console.log("[BirthdayVoucher] Done. Created:", created, "Skipped (already this year):", skipped);
        return { created, skipped, total: users.length };
    } catch (error) {
        console.error("[BirthdayVoucher] Job error:", error);
        throw error;
    }
}

module.exports = {
    runDailyBirthdayVouchers,
    getTodayMonthDay,
    findBirthdayCustomersToday,
    backfillBirthdayMonthDay,
};
