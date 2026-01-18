const express = require("express");
const PublicProductRouter = express.Router();
const PublicProductController = require("../controller/PublicProductController");

// Public routes - không cần authentication
PublicProductRouter.get("/featured", PublicProductController.getFeaturedProducts);
PublicProductRouter.get("/", PublicProductController.getProducts);
PublicProductRouter.get("/:id", PublicProductController.getProductById);

module.exports = PublicProductRouter;
