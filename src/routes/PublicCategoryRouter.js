const express = require("express");
const PublicCategoryRouter = express.Router();
const PublicCategoryController = require("../controller/PublicCategoryController");

// Public routes - không cần authentication
PublicCategoryRouter.get("/", PublicCategoryController.getCategories);

module.exports = PublicCategoryRouter;
