const jwt = require("jsonwebtoken");
const UserModel = require("../models/UserModel");
require("dotenv").config();

// Role nhân viên quản lý kho trong DB (hỗ trợ cả warehouse_staff và warehouse-staff)
const WAREHOUSE_ROLE_NAMES = ["warehouse_staff", "warehouse-staff"];

const getToken = (req) => req.headers.authorization?.split(" ")[1] || req.headers.authorization;

const inventoryAuthMiddleware = async (req, res, next) => {
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

const inventoryAdminMiddleware = async (req, res, next) => {
  await inventoryAuthMiddleware(req, res, async () => {
    if (req.user?.role !== "admin") {
      return res.status(403).json({ status: "ERR", message: "Chỉ Admin mới có quyền truy cập" });
    }
    next();
  });
};

const inventoryWarehouseMiddleware = async (req, res, next) => {
  await inventoryAuthMiddleware(req, res, async () => {
    const roleName = req.user?.role || "customer";
    if (!WAREHOUSE_ROLE_NAMES.includes(roleName)) {
      return res.status(403).json({
        status: "ERR",
        message: "Chỉ nhân viên kho mới có quyền truy cập",
      });
    }
    next();
  });
};

// Middleware cho phép cả Admin và Warehouse staff (dùng cho xem sản phẩm)
const inventoryAdminOrWarehouseMiddleware = async (req, res, next) => {
  await inventoryAuthMiddleware(req, res, async () => {
    const roleName = req.user?.role || "customer";
    const isAdmin = roleName === "admin";
    const isWarehouse = WAREHOUSE_ROLE_NAMES.includes(roleName);
    
    if (!isAdmin && !isWarehouse) {
      return res.status(403).json({
        status: "ERR",
        message: "Chỉ Admin hoặc nhân viên kho mới có quyền truy cập",
      });
    }
    next();
  });
};

// Middleware cho phép Admin, Warehouse staff và QC Staff (dùng cho xem sản phẩm - QC Staff cần để update purchase cost)
const inventoryAdminOrWarehouseOrQcStaffMiddleware = async (req, res, next) => {
  await inventoryAuthMiddleware(req, res, async () => {
    const roleName = req.user?.role || "customer";
    const isAdmin = roleName === "admin";
    const isWarehouse = WAREHOUSE_ROLE_NAMES.includes(roleName);
    const isQcStaff = roleName === "qc_staff";
    
    if (!isAdmin && !isWarehouse && !isQcStaff) {
      return res.status(403).json({
        status: "ERR",
        message: "Chỉ Admin, nhân viên kho hoặc nhân viên QC mới có quyền truy cập",
      });
    }
    next();
  });
};

module.exports = {
  inventoryAuthMiddleware,
  inventoryAdminMiddleware,
  inventoryWarehouseMiddleware,
  inventoryAdminOrWarehouseMiddleware,
  inventoryAdminOrWarehouseOrQcStaffMiddleware,
  WAREHOUSE_ROLE_NAMES,
};

