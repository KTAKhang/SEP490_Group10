const jwt = require("jsonwebtoken");
const dotenv = require("dotenv");
dotenv.config();
const UserModel = require("../models/UserModel");

// Middleware: Require authentication (any logged-in user)
const newsAuthMiddleware = async (req, res, next) => {
  const authHeader = req.headers?.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "No token provided", status: "ERR" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
    const userData = await UserModel.findById(decoded._id).populate("role_id", "name");

    if (!userData) {
      return res.status(401).json({ message: "User not found", status: "ERR" });
    }

    req.user = {
      _id: userData._id.toString(),
      role_name: userData.role_id?.name || null,
    };

    return next();
  } catch (err) {
    return res.status(401).json({ message: "Invalid token", status: "ERR" });
  }
};

// Middleware: Optional authentication (for public endpoints)
const newsOptionalAuthMiddleware = async (req, res, next) => {
  const authHeader = req.headers?.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    req.user = null;
    return next();
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
    const userData = await UserModel.findById(decoded._id).populate("role_id", "name");

    if (userData) {
      req.user = {
        _id: userData._id.toString(),
        role_name: userData.role_id?.name || null,
      };
    } else {
      req.user = null;
    }
  } catch (err) {
    req.user = null;
  }

  return next();
};

// Middleware: Require admin or sales-staff role (for create/update/delete endpoints)
const newsAdminOrSalesStaffMiddleware = async (req, res, next) => {
  const authHeader = req.headers?.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "No token provided", status: "ERR" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
    const userData = await UserModel.findById(decoded._id).populate("role_id", "name");

    if (!userData) {
      return res.status(401).json({ message: "User not found", status: "ERR" });
    }

    // Check if user is locked
    if (userData.status === false) {
      return res.status(403).json({ message: "Account is locked", status: "ERR" });
    }

    const roleName = userData.role_id?.name || null;
    
    // Only allow admin or sales-staff
    if (roleName !== "admin" && roleName !== "sales-staff") {
      return res.status(403).json({ 
        message: "Access denied. Admin or sales staff only.", 
        status: "ERR" 
      });
    }

    req.user = {
      _id: userData._id.toString(),
      role_name: roleName,
    };

    return next();
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({ message: "Token has expired", status: "ERR" });
    }
    if (err.name === "JsonWebTokenError") {
      return res.status(401).json({ message: "Invalid token", status: "ERR" });
    }
    return res.status(401).json({ message: "Invalid token", status: "ERR" });
  }
};

module.exports = {
  newsAuthMiddleware,
  newsOptionalAuthMiddleware,
  newsAdminOrSalesStaffMiddleware,
};
