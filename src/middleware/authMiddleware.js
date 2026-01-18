const jwt = require("jsonwebtoken");
const dotenv = require("dotenv");
dotenv.config();
const UserModel = require("../models/UserModel");

const authAdminMiddleware = async (req, res, next) => {
    const authHeader = req.headers?.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ message: "No token provided", status: "ERR" });
    }

    const token = authHeader.split(" ")[1];

    try {
        const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
        const userData = await UserModel.findById(decoded._id).populate("role_id", "name");

        if (userData?.role_id?.name === "admin") {
            req.user = decoded;
            return next();
        }

        return res.status(403).json({ message: "Access denied", status: "ERR" });
    } catch (err) {
        return res.status(401).json({ message: "Invalid token", status: "ERR" });
    }
};


const authMiddleware = async (req, res, next) => {
    const authHeader = req.headers?.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ message: "No token provided", status: "ERR" });
    }

    const token = authHeader.split(" ")[1];

    try {
        const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
        const userData = await UserModel.findById(decoded._id).populate("role_id", "name");

        // Nếu là admin hoặc đang truy cập thông tin của chính họ
        if (userData?.role_id?.name === "admin" || decoded._id === req.params._id) {
            req.user = userData;
            return next();
        }

        return res.status(403).json({ message: "Access denied", status: "ERR" });
    } catch (err) {
        return res.status(401).json({ message: "Invalid token", status: "ERR" });
    }
};


const authUserMiddleware = (req, res, next) => {
    try {
        const authHeader = req.headers?.authorization;
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return res
                .status(401)
                .json({ message: "No token provided", status: "ERR" });
        }

        const token = authHeader.split(" ")[1];

        jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
            if (err) {
                return res
                    .status(403)
                    .json({ message: "Token is not valid", status: "ERR" });
            }

            req.user = decoded;
            next();
        });
    } catch (error) {
        return res
            .status(500)
            .json({ message: "Internal server error", status: "ERR" });
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

module.exports = { authMiddleware, authAdminMiddleware, authUserMiddleware, customerMiddleware };