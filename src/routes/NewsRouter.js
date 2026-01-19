const express = require("express");
const NewsController = require("../controller/NewsController");
const { newsAuthMiddleware, newsOptionalAuthMiddleware } = require("../middleware/newsMiddleware");
const { uploadNewsThumbnail, uploadNewsContentImage } = require("../middleware/uploadMiddleware");

const NewsRouter = express.Router();

// Public endpoints (no auth required, but optional auth for view tracking)
NewsRouter.get("/public", NewsController.getNews); // ?public=true
NewsRouter.get("/public/featured", NewsController.getFeaturedNews);
NewsRouter.get("/public/:id", newsOptionalAuthMiddleware, NewsController.getNewsById);

// Author endpoints (require auth)
NewsRouter.post("/", newsAuthMiddleware, uploadNewsThumbnail, NewsController.createNews);
NewsRouter.post("/upload-content-image", newsAuthMiddleware, uploadNewsContentImage, NewsController.uploadContentImage);
NewsRouter.get("/", newsAuthMiddleware, NewsController.getNews); // Get own news or all if admin
NewsRouter.get("/:id", newsAuthMiddleware, NewsController.getNewsById);
NewsRouter.put("/:id", newsAuthMiddleware, uploadNewsThumbnail, NewsController.updateNews);
NewsRouter.delete("/:id", newsAuthMiddleware, NewsController.deleteNews);

module.exports = NewsRouter;
