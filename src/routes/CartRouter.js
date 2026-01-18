const express = require("express");
const routerCart = express.Router();
const cartController = require("../controller/CartController");
const { authUserMiddleware } = require("../middleware/authMiddleware");

routerCart.post("/add", authUserMiddleware, cartController.addItemToCart);


routerCart.put("/update", authUserMiddleware, cartController.updateItemInCart);


routerCart.delete("/remove/:product_id", authUserMiddleware, cartController.removeItemFromCart);


routerCart.get("/", authUserMiddleware, cartController.getCartItems);

module.exports = routerCart;