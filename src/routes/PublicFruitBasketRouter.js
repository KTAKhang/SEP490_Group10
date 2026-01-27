const express = require("express");
const PublicFruitBasketController = require("../controller/PublicFruitBasketController");

const PublicFruitBasketRouter = express.Router();

// Public routes - không cần authentication
PublicFruitBasketRouter.get("/", PublicFruitBasketController.getFruitBaskets);
PublicFruitBasketRouter.get("/:id", PublicFruitBasketController.getFruitBasketById);

module.exports = PublicFruitBasketRouter;
