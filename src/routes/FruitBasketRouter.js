const express = require("express");
const FruitBasketController = require("../controller/FruitBasketController");
const { inventoryAdminMiddleware } = require("../middleware/inventoryMiddleware");

const FruitBasketRouter = express.Router();

// Admin: CRUD Fruit Basket
FruitBasketRouter.post("/", inventoryAdminMiddleware, FruitBasketController.createFruitBasket);
FruitBasketRouter.get("/", inventoryAdminMiddleware, FruitBasketController.getFruitBaskets);
FruitBasketRouter.get("/:id", inventoryAdminMiddleware, FruitBasketController.getFruitBasketById);
FruitBasketRouter.put("/:id", inventoryAdminMiddleware, FruitBasketController.updateFruitBasket);
FruitBasketRouter.delete("/:id", inventoryAdminMiddleware, FruitBasketController.deleteFruitBasket);

module.exports = FruitBasketRouter;
