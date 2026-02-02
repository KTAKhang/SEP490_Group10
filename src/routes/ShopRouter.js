const express = require("express");
const ShopController = require("../controller/ShopController");
const { authAdminMiddleware } = require("../middleware/authMiddleware");
const { uploadShopImages, uploadShopDescriptionImage } = require("../middleware/uploadMiddleware");

const ShopRouter = express.Router();

// UC-01: View Shop Information (BR-02: Only ADMIN)
ShopRouter.get("/", authAdminMiddleware, ShopController.getShopInfo);

// UC-02: Update Shop Basic Information (BR-05: Only ADMIN)
ShopRouter.put("/basic-info", authAdminMiddleware, ShopController.updateShopBasicInfo);

// UC-03: Update Shop Description (BR-05: Only ADMIN)
ShopRouter.put("/description", authAdminMiddleware, ShopController.updateShopDescription);

// Upload image for shop description (CKEditor)
ShopRouter.post("/upload-description-image", authAdminMiddleware, uploadShopDescriptionImage, ShopController.uploadShopDescriptionImage);

// UC-04: Update Working Hours (BR-05: Only ADMIN)
ShopRouter.put("/working-hours", authAdminMiddleware, ShopController.updateWorkingHours);

// UC-05: Upload or Update Shop Images (BR-21: Only ADMIN)
ShopRouter.put("/images", authAdminMiddleware, uploadShopImages, ShopController.updateShopImages);

module.exports = ShopRouter;
