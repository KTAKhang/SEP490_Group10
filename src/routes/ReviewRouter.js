const express = require("express");
const ReviewController = require("../controller/ReviewController");
const { customerMiddleware } = require("../middleware/authMiddleware");
const { uploadReviewImages } = require("../middleware/uploadMiddleware");

const ReviewRouter = express.Router();

// Customer: tạo/sửa/xóa review
ReviewRouter.post("/", customerMiddleware, uploadReviewImages, ReviewController.createReview);
ReviewRouter.put("/:id", customerMiddleware, uploadReviewImages, ReviewController.updateReview);
ReviewRouter.delete("/:id", customerMiddleware, ReviewController.deleteReview);

// Public: xem review theo sản phẩm
ReviewRouter.get("/product/:productId", ReviewController.getProductReviews);
ReviewRouter.get("/product/:productId/stats", ReviewController.getProductReviewStats);

module.exports = ReviewRouter;
