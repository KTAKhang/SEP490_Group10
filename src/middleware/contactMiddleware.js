const jwt = require("jsonwebtoken");
const UserModel = require("../models/UserModel");
require("dotenv").config();

/**
 * Middleware xác thực người dùng cho Contact Management (User hoặc Admin)
 * Kiểm tra JWT token và gán thông tin user vào req.user
 */
const contactAuthMiddleware = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(" ")[1] || req.headers.authorization;
        
        if (!token) {
            return res.status(401).json({
                status: "ERR",
                message: "Token không được cung cấp",
            });
        }

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

        req.user = {
            _id: user._id,
            user_name: user.user_name,
            email: user.email,
            role: user.role_id?.name || "customer",
            isAdmin: user.role_id?.name === "admin",
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

/**
 * Middleware xác thực chỉ Admin cho Contact Management
 * Chỉ cho phép Admin truy cập các endpoint quản lý Contact
 */
const contactAdminMiddleware = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(" ")[1] || req.headers.authorization;
        
        if (!token) {
            return res.status(401).json({
                status: "ERR",
                message: "Token không được cung cấp",
            });
        }

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
        if (roleName !== "admin") {
            return res.status(403).json({
                status: "ERR",
                message: "Chỉ Admin mới có quyền truy cập",
            });
        }

        req.user = {
            _id: user._id,
            user_name: user.user_name,
            email: user.email,
            role: roleName,
            isAdmin: true,
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

/**
 * Middleware xác thực chỉ User (không phải Admin) cho Contact Management
 * Chỉ cho phép User thông thường truy cập
 */
const contactUserMiddleware = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(" ")[1] || req.headers.authorization;
        
        if (!token) {
            return res.status(401).json({
                status: "ERR",
                message: "Token không được cung cấp",
            });
        }

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
        if (roleName === "admin") {
            return res.status(403).json({
                status: "ERR",
                message: "Admin không thể sử dụng endpoint này",
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
    contactAuthMiddleware,
    contactAdminMiddleware,
    contactUserMiddleware,
};
