const CartService = require("../services/CartService");

const isValidQuantity = (quantity) => {
    return Number.isInteger(quantity) && quantity > 0;
};

const addItemToCart = async (req, res) => {
    try {
        const user_id = req.user._id; 
        const { product_id, quantity } = req.body;

        // ✅ Validate
        if (!product_id) {
            return res.status(400).json({
                status: "ERR",
                message: "Product ID is required"
            });
        }

        if (!isValidQuantity(quantity)) {
            return res.status(400).json({
                status: "ERR",
                message: "Quantity must be a positive integer"
            });
        }

        const response = await CartService.addItemToCart(user_id, product_id, quantity);

        if (response.status === "ERR") {
            return res.status(400).json(response);
        }

        return res.status(200).json(response);
    } catch (error) {
        return res.status(500).json({ status: "ERR", message: error.message });
    }
};

const updateItemInCart = async (req, res) => {
    try {
        const user_id = req.user._id;
        const { product_id, quantity } = req.body;

        // ✅ Validate
        if (!product_id) {
            return res.status(400).json({
                status: "ERR",
                message: "Product ID is required"
            });
        }

        if (!isValidQuantity(quantity)) {
            return res.status(400).json({
                status: "ERR",
                message: "Quantity must be a positive integer"
            });
        }

        const response = await CartService.updateItemInCart(user_id, product_id, quantity);

        if (response.status === "ERR") {
            return res.status(400).json(response);
        }

        return res.status(200).json(response);
    } catch (error) {
        return res.status(500).json({ status: "ERR", message: error.message });
    }
};

const removeItemFromCart = async (req, res) => {
  try {
    const user_id = req.user._id;

    const product_ids =
      req.params.product_id || req.body.product_ids;

    if (!product_ids) {
      return res.status(400).json({
        status: "ERR",
        message: "Missing product_id",
      });
    }

    const response = await CartService.removeItemFromCart(
      user_id,
      product_ids
    );

    return res.status(200).json(response);
  } catch (error) {
    return res.status(500).json({
      status: "ERR",
      message: error.message,
    });
  }
};

const getCartItems = async (req, res) => {
    try {
        const user_id = req.user._id;
        const response = await CartService.getCartItems(user_id);

        return res.status(200).json({
            status: "OK",
            message: "Shopping cart successfully retrieved",
            data: response
        });
    } catch (error) {
        return res.status(400).json({ status: "ERR", message: error.message });
    }
};

module.exports = {
    addItemToCart,
    updateItemInCart,
    removeItemFromCart,
    getCartItems
};