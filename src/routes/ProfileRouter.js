const express = require("express");
const routerProfile = express.Router();
const profileController = require("../controller/ProfileController");
const multer = require("multer");
const upload = multer({ storage: multer.memoryStorage() });
const {
    authUserMiddleware,
    customerMiddleware
} = require("../middleware/authMiddleware");



routerProfile.put(
    "/update-user",
    customerMiddleware,
    upload.single("avatar"),
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