const express = require("express");
const ShopController = require("../controller/ShopController");

const ShopPublicRouter = express.Router();

// Public endpoint: Get shop information (for customer - no auth required)
ShopPublicRouter.get("/public", ShopController.getShopInfo);
ShopPublicRouter.get("/", ShopController.getShopInfo); // Fallback for /shop

module.exports = ShopPublicRouter;
