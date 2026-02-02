const express = require("express");
const HomepageAssetController = require("../controller/HomepageAssetController");
const { authAdminMiddleware } = require("../middleware/authMiddleware");
const { uploadHomepageAssetImage } = require("../middleware/uploadMiddleware");

const HomepageAssetRouter = express.Router();

// Public endpoint (không cần đăng nhập) - PHẢI ĐẶT TRƯỚC route "/"
HomepageAssetRouter.get("/public", HomepageAssetController.getPublicAssets);

// Admin endpoints (chỉ admin)
// Route "/upload" phải đặt TRƯỚC route "/" để tránh conflict
HomepageAssetRouter.post("/upload", authAdminMiddleware, uploadHomepageAssetImage, HomepageAssetController.uploadImage);
HomepageAssetRouter.get("/", (req, res, next) => {
  console.log("📝 GET /admin/homepage-assets hit!");
  next();
}, authAdminMiddleware, HomepageAssetController.getAllAssets);
HomepageAssetRouter.put("/", (req, res, next) => {
  console.log("📝 PUT /admin/homepage-assets hit!");
  console.log("Body:", req.body);
  next();
}, authAdminMiddleware, HomepageAssetController.updateOrCreateAsset);

module.exports = HomepageAssetRouter;
