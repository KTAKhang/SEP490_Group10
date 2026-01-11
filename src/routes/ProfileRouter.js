const express = require("express");
const routerProfile = express.Router();
const profileController = require("../controller/ProfileController");
const multer = require("multer");
const upload = multer({ storage: multer.memoryStorage() });
const {
    authUserMiddleware
} = require("../middleware/authMiddleware");



routerProfile.put(
    "/update-user",
    upload.single("avatar"),
    authUserMiddleware,
    profileController.updateProfile
);

routerProfile.put(
    "/change-password",
    authUserMiddleware,
    profileController.changePassword
);

routerProfile.get("/user-info",
    authUserMiddleware,
     profileController.getUserById);

module.exports = routerProfile;