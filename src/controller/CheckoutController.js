const CheckoutService = require("../services/CheckoutService");

const checkoutHold = async (req, res) => {
    try {
        const user_id = req.user._id;
         const { selected_product_ids,checkout_session_id} = req.body;

        if (!selected_product_ids || !Array.isArray(selected_product_ids) || selected_product_ids.length === 0) {
            return res.status(400).json({
                success: false,
                message: "Please select at least one product to place an order"
            });
        }

         if (!checkout_session_id || selected_product_ids.length === 0) {
            return res.status(400).json({
                success: false,
                message: "Checkout session not found"
            });
        }
        const response = await CheckoutService.checkoutHold(user_id,selected_product_ids,checkout_session_id);

        if (response.status === "ERR") {
            return res.status(400).json(response);
        }

        return res.status(200).json(response);
    } catch (error) {
        return res.status(500).json({
            status: "ERR",
            message: error.message
        });
    }
};

const cancelCheckout = async (req, res) => {
    try {
        const user_id = req.user._id;
         const { checkout_session_id} = req.body;

         if (!checkout_session_id || checkout_session_id.length === 0) {
            return res.status(400).json({
                success: false,
                message: "Checkout session not found"
            });
        }
        const response = await CheckoutService.cancelCheckout(user_id,checkout_session_id);

        if (response.status === "ERR") {
            return res.status(400).json(response);
        }

        return res.status(200).json(response);
    } catch (error) {
        return res.status(500).json({
            status: "ERR",
            message: error.message
        });
    }
};


module.exports = {
    checkoutHold,
    cancelCheckout,
};
