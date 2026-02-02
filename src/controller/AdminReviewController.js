const ReviewService = require("../services/ReviewService");

const getReviewsAdmin = async (req, res) => {
  try {
    const response = await ReviewService.getReviewsForAdmin(req.query);
    if (response.status === "ERR") return res.status(400).json(response);
    return res.status(200).json(response);
  } catch (error) {
    return res.status(500).json({ status: "ERR", message: error.message });
  }
};

const updateReviewVisibility = async (req, res) => {
  try {
    const response = await ReviewService.updateReviewVisibility(req.params.id, req.body.status);
    if (response.status === "ERR") return res.status(400).json(response);
    return res.status(200).json(response);
  } catch (error) {
    return res.status(500).json({ status: "ERR", message: error.message });
  }
};

module.exports = {
  getReviewsAdmin,
  updateReviewVisibility,
};
