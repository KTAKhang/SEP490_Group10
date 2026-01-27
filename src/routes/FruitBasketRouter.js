const express = require("express");
const FruitBasketController = require("../controller/FruitBasketController");
const { inventoryAdminMiddleware } = require("../middleware/inventoryMiddleware");
const { uploadFruitBasketImages } = require("../middleware/uploadMiddleware");

const FruitBasketRouter = express.Router();

// Admin: CRUD Fruit Basket
FruitBasketRouter.post("/", inventoryAdminMiddleware, uploadFruitBasketImages, FruitBasketController.createFruitBasket);
FruitBasketRouter.get("/", inventoryAdminMiddleware, FruitBasketController.getFruitBaskets);
FruitBasketRouter.get("/:id", inventoryAdminMiddleware, FruitBasketController.getFruitBasketById);
FruitBasketRouter.put("/:id", inventoryAdminMiddleware, uploadFruitBasketImages, FruitBasketController.updateFruitBasket);
FruitBasketRouter.delete("/:id", inventoryAdminMiddleware, FruitBasketController.deleteFruitBasket);

module.exports = FruitBasketRouter;
