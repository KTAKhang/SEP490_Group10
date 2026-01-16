const PublicProductService = require("../services/PublicProductService");

const getFeaturedProducts = async (req, res) => {
  try {
    const response = await PublicProductService.getFeaturedProducts();
    if (response.status === "ERR") return res.status(400).json(response);
    return res.status(200).json(response);
  } catch (error) {
    return res.status(500).json({ status: "ERR", message: error.message });
  }
};

const getProducts = async (req, res) => {
  try {
    const response = await PublicProductService.getProducts(req.query);
    if (response.status === "ERR") return res.status(400).json(response);
    return res.status(200).json(response);
  } catch (error) {
    return res.status(500).json({ status: "ERR", message: error.message });
  }
};

const getProductById = async (req, res) => {
  try {
    const response = await PublicProductService.getProductById(req.params.id);
    if (response.status === "ERR") return res.status(404).json(response);
    return res.status(200).json(response);
  } catch (error) {
    return res.status(500).json({ status: "ERR", message: error.message });
  }
};

module.exports = {
  getFeaturedProducts,
  getProducts,
  getProductById,
};
