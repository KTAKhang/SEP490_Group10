const jwt = require("jsonwebtoken");
const dotenv = require("dotenv");
dotenv.config();
const UserModel = require("../models/UserModel");


const authAdminMiddleware = async (req, res, next) => {
    try {
        const authHeader = req.headers?.authorization;
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return res.status(401).json({
                status: "ERR",
                message: "Token is not provided",
            });
        }


        const token = authHeader.split(" ")[1];
        const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);


        const user = await UserModel.findById(decoded._id).populate("role_id", "name");


        if (!user) {
            return res.status(404).json({
                status: "ERR",
                message: "User not found",
            });
        }


        if (user.status === false) {
            return res.status(403).json({
                status: "ERR",
                message: "Account is locked",
            });
        }


        if (user.role_id?.name !== "admin") {
            return res.status(403).json({
                status: "ERR",
                message: "Access denied",
            });
        }


        req.user = user;
        next();
    } catch (error) {
        if (error.name === "TokenExpiredError") {
            return res.status(401).json({
                status: "ERR",
                message: "Token has expired",
            });
        }


        if (error.name === "JsonWebTokenError") {
            return res.status(401).json({
                status: "ERR",
                message: "Invalid token",
            });
        }


        return res.status(500).json({
            status: "ERR",
            message: error.message,
        });
    }
};

const authMiddleware = async (req, res, next) => {
    try {
        const authHeader = req.headers?.authorization;
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return res.status(401).json({
                status: "ERR",
                message: "Token is not provided",
            });
        }


        const token = authHeader.split(" ")[1];
        const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);


        const user = await UserModel.findById(decoded._id).populate("role_id", "name");


        if (!user) {
            return res.status(404).json({
                status: "ERR",
                message: "User not found",
            });
        }


        if (user.status === false) {
            return res.status(403).json({
                status: "ERR",
                message: "Account is locked",
            });
        }


        const isAdmin = user.role_id?.name === "admin";
        const isOwner = decoded._id === req.params._id;


        if (!isAdmin && !isOwner) {
            return res.status(403).json({
                status: "ERR",
                message: "Access denied",
            });
        }


        req.user = user;
        next();
    } catch (error) {
        if (error.name === "TokenExpiredError") {
            return res.status(401).json({
                status: "ERR",
                message: "Token has expired",
            });
        }


        if (error.name === "JsonWebTokenError") {
            return res.status(401).json({
                status: "ERR",
                message: "Invalid token",
            });
        }


        return res.status(500).json({
            status: "ERR",
            message: error.message,
        });
    }
};

const authUserMiddleware = async (req, res, next) => {
    try {
        const authHeader = req.headers?.authorization;
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return res.status(401).json({
                status: "ERR",
                message: "Token is not provided",
            });
        }


        const token = authHeader.split(" ")[1];
        const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);


        const user = await UserModel.findById(decoded._id).populate("role_id", "name");


        if (!user) {
            return res.status(404).json({
                status: "ERR",
                message: "User not found",
            });
        }


        if (user.status === false) {
            return res.status(403).json({
                status: "ERR",
                message: "Account is locked",
            });
        }


        req.user = user;
        next();
    } catch (error) {
        if (error.name === "TokenExpiredError") {
            return res.status(401).json({
                status: "ERR",
                message: "Token has expired",
            });
        }


        if (error.name === "JsonWebTokenError") {
            return res.status(401).json({
                status: "ERR",
                message: "Invalid token",
            });
        }


        return res.status(500).json({
            status: "ERR",
            message: error.message,
        });
    }
};


/**
 * athour: KhoaNDCE170420
 * menthod: authSalesStaffMiddleware
 * Authentication & Authorization middleware for Sales Staff
 *
 * - Verifies JWT access token from `Authorization` header (Bearer token)
 * - Checks whether the authenticated user has role `sales-staff`
 * - Attaches decoded user info to `req.user` if authorized
 * - Protect routes where only Sales Staff are allowed
 *   (e.g. create / update discount codes in PENDING status)
 *
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 * @param {import("express").NextFunction} next
 * @returns {Response|void}
 * - 401 Unauthorized: Missing or invalid token
 * - 403 Forbidden: Authenticated but not sales staff
 * - Calls `next()` if access is granted
 */
const authSalesStaffMiddleware = async (req, res, next) => {
    const authHeader = req.headers?.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ message: "No token provided", status: "ERR" });
    }


    const token = authHeader.split(" ")[1];


    try {
        const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
        const userData = await UserModel.findById(decoded._id).populate("role_id", "name");


        if (userData?.role_id?.name === "sales-staff") {
            req.user = decoded;
            return next();
        }


        return res.status(403).json({ message: "Access denied. Sales staff only.", status: "ERR" });
    } catch (err) {
        return res.status(401).json({ message: "Invalid token", status: "ERR" });
    }
};
/**
 * Cho phép Admin hoặc Sales-staff quản lý order (danh sách, chi tiết, cập nhật trạng thái).
 * Gắn full user (populate role_id) giống authAdminMiddleware.
 */
const authAdminOrSalesStaffForOrderMiddleware = async (req, res, next) => {
    try {
        const authHeader = req.headers?.authorization;
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return res.status(401).json({
                status: "ERR",
                message: "Token is not provided",
            });
        }

        if (!user) {
            return res.status(404).json({
                status: "ERR",
                message: "User not found",
            });
        }
        if (user.status === false) {
            return res.status(403).json({
                status: "ERR",
                message: "Account is locked",
            });
        }
        const roleName = user.role_id?.name?.toLowerCase?.();
        if (roleName !== "admin" && roleName !== "sales-staff") {
            return res.status(403).json({
                status: "ERR",
                message: "Access denied",
            });
        }
        req.user = user;
        next();
    } catch (error) {
        if (error.name === "TokenExpiredError") {
            return res.status(401).json({
                status: "ERR",
                message: "Token has expired",
            });
        }
        if (error.name === "JsonWebTokenError") {
            return res.status(401).json({
                status: "ERR",
                message: "Invalid token",
            });
        }
        return res.status(500).json({
            status: "ERR",
            message: error.message,
        });
    }
};
const authStaffOrAdminMiddleware = async (req, res, next) => {
    const authHeader = req.headers?.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ message: "No token provided", status: "ERR" });
    }


    const token = authHeader.split(" ")[1];


    try {
        const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
        const userData = await UserModel.findById(decoded._id).populate("role_id", "name");


        if (userData?.role_id?.name === "sales-staff" || userData?.role_id?.name === "admin") {
            req.user = decoded;
            return next();
        }


        return res.status(403).json({ message: "Access denied. Staff or admin only.", status: "ERR" });
    } catch (err) {
        return res.status(401).json({ message: "Invalid token", status: "ERR" });
    }
};
/**
 * Middleware xác thực chỉ Customer (không phải Admin hoặc warehouse_staff)
 * Chỉ cho phép Customer (role = "customer") truy cập
 */
const customerMiddleware = async (req, res, next) => {
    try {
        const authHeader = req.headers?.authorization;
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return res.status(401).json({
                status: "ERR",
                message: "Token không được cung cấp",
            });
        }


        const token = authHeader.split(" ")[1];


        const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
        const user = await UserModel.findById(decoded._id).populate("role_id", "name");


        if (!user) {
            return res.status(404).json({
                status: "ERR",
                message: "Người dùng không tồn tại",
            });
        }


        if (user.status === false) {
            return res.status(403).json({
                status: "ERR",
                message: "Tài khoản bị khóa",
            });
        }


        const roleName = user.role_id?.name || "customer";


        // Chỉ cho phép Customer (không phải admin hoặc warehouse_staff)
        if (roleName !== "customer") {
            return res.status(403).json({
                status: "ERR",
                message: "Chỉ khách hàng mới có thể sử dụng tính năng này",
            });
        }


        req.user = {
            _id: user._id,
            user_name: user.user_name,
            email: user.email,
            role: roleName,
            isAdmin: false,
        };


        next();
    } catch (error) {
        if (error.name === "TokenExpiredError") {
            return res.status(401).json({
                status: "ERR",
                message: "Token đã hết hạn",
            });
        }
        if (error.name === "JsonWebTokenError") {
            return res.status(401).json({
                status: "ERR",
                message: "Token không hợp lệ",
            });
        }
        return res.status(500).json({
            status: "ERR",
            message: error.message,
        });
    }
};
module.exports = {
    authMiddleware,
    authAdminMiddleware,
    authUserMiddleware,
    customerMiddleware,
    authSalesStaffMiddleware,
    authStaffOrAdminMiddleware,
    authAdminOrSalesStaffForOrderMiddleware,
};
