const express = require("express");
const multer = require("multer");
const FruitAssistantController = require("../controller/FruitAssistantController");
const { FRUIT_IMAGE_MAX_BYTES } = require("../constants/fruitAssistantUpload");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: FRUIT_IMAGE_MAX_BYTES },
});

const FruitAssistantRouter = express.Router();

function fruitImageUploadMiddleware(req, res, next) {
  upload.single("image")(req, res, (err) => {
    if (!err) return next();
    if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
      const mb = FRUIT_IMAGE_MAX_BYTES / (1024 * 1024);
      return res.status(400).json({
        status: "ERR",
        phase: "error",
        message: `Image size exceeds limit. The maximum allowed size is ${mb} MB (the current server limit is ${mb} MB).`,
      });
    }
    return res.status(400).json({
      status: "ERR",
      phase: "error",
      message: err.message || "Upload failed",
    });
  });
}

FruitAssistantRouter.post(
  "/analyze",
  fruitImageUploadMiddleware,
  FruitAssistantController.analyze
);

FruitAssistantRouter.post("/topic", FruitAssistantController.topic);

module.exports = FruitAssistantRouter;
