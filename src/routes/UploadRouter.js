const express = require("express");
const ShopController = require("../controller/ShopController");
const { authAdminMiddleware } = require("../middleware/authMiddleware");
const { uploadShopImage } = require("../middleware/uploadMiddleware");

const UploadRouter = express.Router();

// Upload shop image (single image for editor or gallery)
UploadRouter.post("/shop-image", authAdminMiddleware, uploadShopImage, ShopController.uploadShopImage);

module.exports = UploadRouter;
