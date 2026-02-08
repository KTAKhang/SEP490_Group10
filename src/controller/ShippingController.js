const ShippingService = require("../services/ShippingService");

const checkShippingFee = async (req, res) => {
  try {
    const user_id = req.user._id;
    const { selected_product_ids, city } = req.body;

    if (!city) {
      return res.status(400).json({
        status: "ERR",
        message: "Please select a province/city",
      });
    }

    if (
      !Array.isArray(selected_product_ids) ||
      selected_product_ids.length === 0
    ) {
      return res.status(400).json({
        status: "ERR",
        message: "Please select at least one product.",
      });
    }

    const result = await ShippingService.calculateShippingFee({
      user_id,
      selected_product_ids,
      city,
    });

    return res.status(200).json({
      status: "OK",
      message: "Shipping fee calculated successfully",
      data: result,
    });
  } catch (error) {
    return res.status(400).json({
      status: "ERR",
      message: error.message,
    });
  }
};

module.exports = { checkShippingFee };
