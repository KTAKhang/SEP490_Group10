const ReviewService = require("../services/ReviewService");

const createReview = async (req, res) => {
  try {
    const response = await ReviewService.createReview(req.user._id, req.body);
    if (response.status === "ERR") return res.status(400).json(response);
    return res.status(201).json(response);
  } catch (error) {
    return res.status(500).json({ status: "ERR", message: error.message });
  }
};

const updateReview = async (req, res) => {
  try {
    const response = await ReviewService.updateReview(req.params.id, req.user._id, req.body);
    if (response.status === "ERR") return res.status(400).json(response);
    return res.status(200).json(response);
  } catch (error) {
    return res.status(500).json({ status: "ERR", message: error.message });
  }
};

const deleteReview = async (req, res) => {
  try {
    const response = await ReviewService.deleteReview(req.params.id, req.user._id);
    if (response.status === "ERR") return res.status(404).json(response);
    return res.status(200).json(response);
  } catch (error) {
    return res.status(500).json({ status: "ERR", message: error.message });
  }
};

const getProductReviews = async (req, res) => {
  try {
    const response = await ReviewService.getProductReviews(req.params.productId, req.query);
    if (response.status === "ERR") return res.status(400).json(response);
    return res.status(200).json(response);
  } catch (error) {
    return res.status(500).json({ status: "ERR", message: error.message });
  }
};

const getProductReviewStats = async (req, res) => {
  try {
    const response = await ReviewService.getProductReviewStats(req.params.productId);
    if (response.status === "ERR") return res.status(400).json(response);
    return res.status(200).json(response);
  } catch (error) {
    return res.status(500).json({ status: "ERR", message: error.message });
  }
};

module.exports = {
  createReview,
  updateReview,
  deleteReview,
  getProductReviews,
  getProductReviewStats,
};
