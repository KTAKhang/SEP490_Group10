const CategoryService = require("../services/CategoryService");

const createCategory = async (req, res) => {
  try {
    const response = await CategoryService.createCategory(req.body);
    if (response.status === "ERR") return res.status(400).json(response);
    return res.status(201).json(response);
  } catch (error) {
    return res.status(500).json({ status: "ERR", message: error.message });
  }
};

const getCategories = async (req, res) => {
  try {
    const response = await CategoryService.getCategories(req.query);
    if (response.status === "ERR") return res.status(400).json(response);
    return res.status(200).json(response);
  } catch (error) {
    return res.status(500).json({ status: "ERR", message: error.message });
  }
};

const getCategoryById = async (req, res) => {
  try {
    const response = await CategoryService.getCategoryById(req.params.id);
    if (response.status === "ERR") return res.status(404).json(response);
    return res.status(200).json(response);
  } catch (error) {
    return res.status(500).json({ status: "ERR", message: error.message });
  }
};

const updateCategory = async (req, res) => {
  try {
    const response = await CategoryService.updateCategory(req.params.id, req.body);
    if (response.status === "ERR") return res.status(400).json(response);
    return res.status(200).json(response);
  } catch (error) {
    return res.status(500).json({ status: "ERR", message: error.message });
  }
};

const deleteCategory = async (req, res) => {
  try {
    const response = await CategoryService.deleteCategory(req.params.id);
    if (response.status === "ERR") return res.status(404).json(response);
    return res.status(200).json(response);
  } catch (error) {
    return res.status(500).json({ status: "ERR", message: error.message });
  }
};

const getCategoryStats = async (req, res) => {
  try {
    const response = await CategoryService.getCategoryStats();
    if (response.status === "ERR") return res.status(400).json(response);
    return res.status(200).json(response);
  } catch (error) {
    return res.status(500).json({ status: "ERR", message: error.message });
  }
};

module.exports = {
  createCategory,
  getCategories,
  getCategoryById,
  updateCategory,
  deleteCategory,
  getCategoryStats,
};

