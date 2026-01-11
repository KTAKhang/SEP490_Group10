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
module.exports = { authMiddleware, authAdminMiddleware, authUserMiddleware };