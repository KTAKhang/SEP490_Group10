const ProductService = require("../services/ProductService");

const createProduct = async (req, res) => {
  try {
    const response = await ProductService.createProduct(req.body);
    if (response.status === "ERR") return res.status(400).json(response);
    return res.status(201).json(response);
  } catch (error) {
    return res.status(500).json({ status: "ERR", message: error.message });
  }
};

const getProducts = async (req, res) => {
  try {
    const response = await ProductService.getProducts(req.query);
    if (response.status === "ERR") return res.status(400).json(response);
    return res.status(200).json(response);
  } catch (error) {
    return res.status(500).json({ status: "ERR", message: error.message });
  }
};

const getProductById = async (req, res) => {
  try {
    const response = await ProductService.getProductById(req.params.id);
    if (response.status === "ERR") return res.status(404).json(response);
    return res.status(200).json(response);
  } catch (error) {
    return res.status(500).json({ status: "ERR", message: error.message });
  }
};

const updateProductAdmin = async (req, res) => {
  try {
    const response = await ProductService.updateProductAdmin(req.params.id, req.body);
    if (response.status === "ERR") return res.status(400).json(response);
    return res.status(200).json(response);
  } catch (error) {
    return res.status(500).json({ status: "ERR", message: error.message });
  }
};

const updateProductExpiryDate = async (req, res) => {
  try {
    const response = await ProductService.updateProductExpiryDate(req.params.id, req.body);
    if (response.status === "ERR") return res.status(400).json(response);
    return res.status(200).json(response);
  } catch (error) {
    return res.status(500).json({ status: "ERR", message: error.message });
  }
};

const deleteProduct = async (req, res) => {
  try {
    const response = await ProductService.deleteProduct(req.params.id);
    if (response.status === "ERR") return res.status(404).json(response);
    return res.status(200).json(response);
  } catch (error) {
    return res.status(500).json({ status: "ERR", message: error.message });
  }
};

module.exports = {
  createProduct,
  getProducts,
  getProductById,
  updateProductAdmin,
  updateProductExpiryDate,
  deleteProduct,
};

