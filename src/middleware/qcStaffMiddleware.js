const jwt = require("jsonwebtoken");
const UserModel = require("../models/UserModel");
require("dotenv").config();

// Role nhân viên QC trong DB
const QC_STAFF_ROLE_NAME = "qc_staff";

const getToken = (req) => req.headers.authorization?.split(" ")[1] || req.headers.authorization;

const qcStaffAuthMiddleware = async (req, res, next) => {
  try {
    const token = getToken(req);
    if (!token) {
      return res.status(401).json({ status: "ERR", message: "Token không được cung cấp" });
    }

    const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
    const user = await UserModel.findById(decoded._id).populate("role_id", "name");

    if (!user) {
      return res.status(404).json({ status: "ERR", message: "Người dùng không tồn tại" });
    }
    if (user.status === false) {
      return res.status(403).json({ status: "ERR", message: "Tài khoản bị khóa" });
    }

    const roleName = user.role_id?.name || "customer";
    req.user = {
      _id: user._id,
      user_name: user.user_name,
      email: user.email,
      role: roleName,
      isAdmin: roleName === "admin",
    };

    next();
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({ status: "ERR", message: "Token đã hết hạn" });
    }
    if (error.name === "JsonWebTokenError") {
      return res.status(401).json({ status: "ERR", message: "Token không hợp lệ" });
    }
    return res.status(500).json({ status: "ERR", message: error.message });
  }
};

// Middleware chỉ cho phép QC Staff
const qcStaffMiddleware = async (req, res, next) => {
  await qcStaffAuthMiddleware(req, res, async () => {
    const roleName = req.user?.role || "customer";
    if (roleName !== QC_STAFF_ROLE_NAME) {
      return res.status(403).json({
        status: "ERR",
        message: "Chỉ nhân viên QC mới có quyền truy cập",
      });
    }
    next();
  });
};

// Middleware cho phép cả Admin và QC Staff
const adminOrQcStaffMiddleware = async (req, res, next) => {
  await qcStaffAuthMiddleware(req, res, async () => {
    const roleName = req.user?.role || "customer";
    const isAdmin = roleName === "admin";
    const isQcStaff = roleName === QC_STAFF_ROLE_NAME;
    
    if (!isAdmin && !isQcStaff) {
      return res.status(403).json({
        status: "ERR",
        message: "Chỉ Admin hoặc nhân viên QC mới có quyền truy cập",
      });
    }
    next();
  });
};

module.exports = {
  qcStaffAuthMiddleware,
  qcStaffMiddleware,
  adminOrQcStaffMiddleware,
  QC_STAFF_ROLE_NAME,
};
