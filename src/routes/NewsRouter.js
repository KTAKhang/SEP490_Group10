const express = require("express");
const NewsController = require("../controller/NewsController");
const { newsAuthMiddleware, newsOptionalAuthMiddleware, newsAdminOrSalesStaffMiddleware } = require("../middleware/newsMiddleware");
const { uploadNewsThumbnail, uploadNewsContentImage } = require("../middleware/uploadMiddleware");

const NewsRouter = express.Router();

// Public endpoints (no auth required, but optional auth for view tracking)
NewsRouter.get("/public", NewsController.getNews); // ?public=true
NewsRouter.get("/public/featured", NewsController.getFeaturedNews);
NewsRouter.get("/public/:id", newsOptionalAuthMiddleware, NewsController.getNewsById);

// Author endpoints (require auth)
NewsRouter.post("/", newsAdminOrSalesStaffMiddleware, uploadNewsThumbnail, NewsController.createNews);
NewsRouter.post("/upload-content-image", newsAdminOrSalesStaffMiddleware, uploadNewsContentImage, NewsController.uploadContentImage);
NewsRouter.get("/", newsAuthMiddleware, NewsController.getNews); // Get own news or all if admin/sales-staff
NewsRouter.get("/:id", newsAuthMiddleware, NewsController.getNewsById);
NewsRouter.put("/:id", newsAdminOrSalesStaffMiddleware, uploadNewsThumbnail, NewsController.updateNews);
NewsRouter.delete("/:id", newsAdminOrSalesStaffMiddleware, NewsController.deleteNews);

module.exports = NewsRouter;
