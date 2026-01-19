const express = require("express");
const FavoriteRouter = express.Router();
const FavoriteController = require("../controller/FavoriteController");
const { customerMiddleware } = require("../middleware/authMiddleware");

// Tất cả routes yêu thích chỉ dành cho Customer
FavoriteRouter.post("/", customerMiddleware, FavoriteController.addFavorite);
FavoriteRouter.delete("/:productId", customerMiddleware, FavoriteController.removeFavorite);
FavoriteRouter.get("/check/:productId", customerMiddleware, FavoriteController.checkFavorite);
FavoriteRouter.get("/", customerMiddleware, FavoriteController.getFavorites);

module.exports = FavoriteRouter;
