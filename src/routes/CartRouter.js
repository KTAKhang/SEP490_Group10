const express = require("express");
const routerCart = express.Router();
const cartController = require("../controller/CartController");
const { authUserMiddleware,customerMiddleware } = require("../middleware/authMiddleware");

routerCart.post("/add", customerMiddleware, cartController.addItemToCart);


routerCart.put("/update", customerMiddleware, cartController.updateItemInCart);


routerCart.delete("/remove", customerMiddleware, cartController.removeItemFromCart);


routerCart.get("/", customerMiddleware, cartController.getCartItems);

module.exports = routerCart;