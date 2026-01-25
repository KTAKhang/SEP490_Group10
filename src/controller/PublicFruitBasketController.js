const PublicFruitBasketService = require("../services/PublicFruitBasketService");

const getFruitBaskets = async (req, res) => {
  try {
    const response = await PublicFruitBasketService.getFruitBaskets(req.query);
    if (response.status === "ERR") return res.status(400).json(response);
    return res.status(200).json(response);
  } catch (error) {
    return res.status(500).json({ status: "ERR", message: error.message });
  }
};

const getFruitBasketById = async (req, res) => {
  try {
    const response = await PublicFruitBasketService.getFruitBasketById(req.params.id);
    if (response.status === "ERR") return res.status(404).json(response);
    return res.status(200).json(response);
  } catch (error) {
    return res.status(500).json({ status: "ERR", message: error.message });
  }
};

module.exports = {
  getFruitBaskets,
  getFruitBasketById,
};
