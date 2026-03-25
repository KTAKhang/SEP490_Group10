const express = require("express");
const NewsController = require("../controller/NewsController");
const { newsOptionalAuthMiddleware } = require("../middleware/newsMiddleware");
const { authStaffOrAdminMiddleware } = require("../middleware/authMiddleware");
const { uploadNewsThumbnail, uploadNewsContentImage } = require("../middleware/uploadMiddleware");

const NewsRouter = express.Router();

// Public endpoints (no auth required, but optional auth for view tracking)
NewsRouter.get("/public", NewsController.getNews); // ?public=true
NewsRouter.get("/public/featured", NewsController.getFeaturedNews);
NewsRouter.get("/public/:id", newsOptionalAuthMiddleware, NewsController.getNewsById);

// Author endpoints (require auth: admin or sales-staff)
NewsRouter.post("/", authStaffOrAdminMiddleware, uploadNewsThumbnail, NewsController.createNews);
NewsRouter.post("/upload-content-image", authStaffOrAdminMiddleware, uploadNewsContentImage, NewsController.uploadContentImage);
NewsRouter.get("/", authStaffOrAdminMiddleware, NewsController.getNews); // Get own news or all if admin
NewsRouter.get("/:id", authStaffOrAdminMiddleware, NewsController.getNewsById);
NewsRouter.put("/:id", authStaffOrAdminMiddleware, uploadNewsThumbnail, NewsController.updateNews);
NewsRouter.delete("/:id", authStaffOrAdminMiddleware, NewsController.deleteNews);

module.exports = NewsRouter;
