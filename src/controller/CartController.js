const CartService = require("../services/CartService");

const addItemToCart = async (req, res) => {
    try {
        const user_id = req.user._id; 
        const { product_id, quantity } = req.body;

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
        message: "Thiếu product_id",
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
            message: "Lấy giỏ hàng thành công",
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