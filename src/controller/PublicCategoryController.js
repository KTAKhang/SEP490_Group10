const PublicCategoryService = require("../services/PublicCategoryService");

const getCategories = async (req, res) => {
  try {
    const response = await PublicCategoryService.getCategories(req.query);
    if (response.status === "ERR") return res.status(400).json(response);
    return res.status(200).json(response);
  } catch (error) {
    return res.status(500).json({ status: "ERR", message: error.message });
  }
};

module.exports = {
  getCategories,
};
