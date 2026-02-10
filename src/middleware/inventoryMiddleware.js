const jwt = require("jsonwebtoken");
const UserModel = require("../models/UserModel");
require("dotenv").config();

const getToken = (req) => req.headers.authorization?.split(" ")[1] || req.headers.authorization;

const inventoryAuthMiddleware = async (req, res, next) => {
  try {
    const token = getToken(req);
    if (!token) {
      return res.status(401).json({ status: "ERR", message: "Token not provided" });
    }

    const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
    const user = await UserModel.findById(decoded._id).populate("role_id", "name");

    if (!user) {
      return res.status(404).json({ status: "ERR", message: "User not found" });
    }
    if (user.status === false) {
      return res.status(403).json({ status: "ERR", message: "Account is locked" });
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
      return res.status(401).json({ status: "ERR", message: "Token expired" });
    }
    if (error.name === "JsonWebTokenError") {
      return res.status(401).json({ status: "ERR", message: "Invalid token" });
    }
    return res.status(500).json({ status: "ERR", message: error.message });
  }
};

const inventoryAdminMiddleware = async (req, res, next) => {
  await inventoryAuthMiddleware(req, res, async () => {
    if (req.user?.role !== "admin") {
      return res.status(403).json({ status: "ERR", message: "Only Admin can access" });
    }
    next();
  });
};

const inventoryWarehouseMiddleware = async (req, res, next) => {
  await inventoryAuthMiddleware(req, res, async () => {
    const roleName = req.user?.role || "customer";
    if (roleName !== "warehouse_staff") {
      return res.status(403).json({
        status: "ERR",
        message: "Only warehouse staff can access",
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
    const isWarehouse = roleName === "warehouse_staff";

    if (!isAdmin && !isWarehouse) {
      return res.status(403).json({
        status: "ERR",
        message: "Only Admin or warehouse staff can access",
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
    const isWarehouse = roleName === "warehouse_staff";
    const isQcStaff = roleName === "qc_staff";
    
    if (!isAdmin && !isWarehouse && !isQcStaff) {
      return res.status(403).json({
        status: "ERR",
        message: "Only Admin, warehouse staff or QC staff can access",
      });
    }
    next();
  });
};

// Admin hoặc Sales-staff (dùng cho tạo pre-order receive batch, quản lý pre-order)
const inventoryAdminOrSalesStaffMiddleware = async (req, res, next) => {
  await inventoryAuthMiddleware(req, res, async () => {
    const roleName = req.user?.role || "customer";
    const isAdmin = roleName === "admin";
    const isSalesStaff = roleName === "sales-staff";
    if (!isAdmin && !isSalesStaff) {
      return res.status(403).json({
        status: "ERR",
        message: "Only Admin or Sales staff can access",
      });
    }
    next();
  });
};

// Admin, Warehouse staff hoặc Sales-staff (dùng cho GET harvest batch / preorder-batches khi sales-staff quản lý pre-order)
const inventoryAdminOrWarehouseOrSalesStaffMiddleware = async (req, res, next) => {
  await inventoryAuthMiddleware(req, res, async () => {
    const roleName = req.user?.role || "customer";
    const isAdmin = roleName === "admin";
    const isWarehouse = roleName === "warehouse_staff";
    const isSalesStaff = roleName === "sales-staff";
    if (!isAdmin && !isWarehouse && !isSalesStaff) {
      return res.status(403).json({
        status: "ERR",
        message: "Only Admin, warehouse staff or Sales staff can access",
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
  inventoryAdminOrSalesStaffMiddleware,
  inventoryAdminOrWarehouseOrSalesStaffMiddleware,
};

