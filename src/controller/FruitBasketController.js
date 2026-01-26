const FruitBasketService = require("../services/FruitBasketService");

const createFruitBasket = async (req, res) => {
  try {
    const response = await FruitBasketService.createFruitBasket(req.body);
    if (response.status === "ERR") return res.status(400).json(response);
    return res.status(201).json(response);
  } catch (error) {
    return res.status(500).json({ status: "ERR", message: error.message });
  }
};

const getFruitBaskets = async (req, res) => {
  try {
    const response = await FruitBasketService.getFruitBaskets(req.query);
    if (response.status === "ERR") return res.status(400).json(response);
    return res.status(200).json(response);
  } catch (error) {
    return res.status(500).json({ status: "ERR", message: error.message });
  }
};

const getFruitBasketById = async (req, res) => { // Get basket ID from URL params
  try {
    const response = await FruitBasketService.getFruitBasketById(req.params.id);
    if (response.status === "ERR") return res.status(404).json(response);
    return res.status(200).json(response);
  } catch (error) {
    return res.status(500).json({ status: "ERR", message: error.message });
  }
};

const updateFruitBasket = async (req, res) => {
  try {
    const response = await FruitBasketService.updateFruitBasket(req.params.id, req.body);
    if (response.status === "ERR") return res.status(400).json(response);
    return res.status(200).json(response);
  } catch (error) {
    return res.status(500).json({ status: "ERR", message: error.message });
  }
};

const deleteFruitBasket = async (req, res) => {
  try {
    const response = await FruitBasketService.deleteFruitBasket(req.params.id);
    if (response.status === "ERR") return res.status(404).json(response);
    return res.status(200).json(response);
  } catch (error) {
    return res.status(500).json({ status: "ERR", message: error.message });
  }
};

module.exports = {
  createFruitBasket,
  getFruitBaskets,
  getFruitBasketById,
  updateFruitBasket,
  deleteFruitBasket,
};
