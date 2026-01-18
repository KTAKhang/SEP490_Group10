const FavoriteService = require("../services/FavoriteService");

/**
 * Thêm sản phẩm vào danh sách yêu thích
 * POST /favorites
 */
const addFavorite = async (req, res) => {
  try {
    const userId = req.user._id;
    const { productId } = req.body;

    if (!productId) {
      return res.status(400).json({ status: "ERR", message: "productId là bắt buộc" });
    }

    const response = await FavoriteService.addFavorite(userId, productId);
    if (response.status === "ERR") return res.status(400).json(response);
    return res.status(201).json(response);
  } catch (error) {
    return res.status(500).json({ status: "ERR", message: error.message });
  }
};

/**
 * Xóa sản phẩm khỏi danh sách yêu thích
 * DELETE /favorites/:productId
 */
const removeFavorite = async (req, res) => {
  try {
    const userId = req.user._id;
    const { productId } = req.params;

    const response = await FavoriteService.removeFavorite(userId, productId);
    if (response.status === "ERR") return res.status(400).json(response);
    return res.status(200).json(response);
  } catch (error) {
    return res.status(500).json({ status: "ERR", message: error.message });
  }
};

/**
 * Kiểm tra sản phẩm có trong danh sách yêu thích không
 * GET /favorites/check/:productId
 */
const checkFavorite = async (req, res) => {
  try {
    const userId = req.user._id;
    const { productId } = req.params;

    const response = await FavoriteService.checkFavorite(userId, productId);
    if (response.status === "ERR") return res.status(400).json(response);
    return res.status(200).json(response);
  } catch (error) {
    return res.status(500).json({ status: "ERR", message: error.message });
  }
};

/**
 * Lấy danh sách sản phẩm yêu thích (có search, sort, filter, pagination)
 * GET /favorites
 */
const getFavorites = async (req, res) => {
  try {
    const userId = req.user._id;
    const response = await FavoriteService.getFavorites(userId, req.query);
    if (response.status === "ERR") return res.status(400).json(response);
    return res.status(200).json(response);
  } catch (error) {
    return res.status(500).json({ status: "ERR", message: error.message });
  }
};

module.exports = {
  addFavorite,
  removeFavorite,
  checkFavorite,
  getFavorites,
};
