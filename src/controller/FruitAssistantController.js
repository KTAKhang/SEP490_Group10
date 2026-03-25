const FruitAssistantService = require("../services/fruitAssistantService");

const analyze = async (req, res) => {
  try {
    const file = req.file;
    if (!file || !file.buffer) {
      return res.status(400).json({
        status: "ERR",
        phase: "error",
        message: "Image file is required (field name: image)",
      });
    }

    const allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"];
    if (file.mimetype && !allowed.includes(file.mimetype)) {
      return res.status(400).json({
        status: "ERR",
        phase: "error",
        message: "Only image files are allowed (jpg, png, webp, gif).",
      });
    }

    const result = await FruitAssistantService.analyzeFruitImage(file.buffer, file.mimetype);
    if (result.status === "ERR") {
      return res.status(400).json(result);
    }
    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json({
      status: "ERR",
      phase: "error",
      message: error.message || "Internal error",
    });
  }
};

const topic = async (req, res) => {
  try {
    const result = await FruitAssistantService.generateGeminiTopicPayload(req.body || {});
    if (result.status === "ERR") {
      return res.status(400).json(result);
    }
    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json({
      status: "ERR",
      message: error.message || "Internal error",
    });
  }
};

module.exports = {
  analyze,
  topic,
};
