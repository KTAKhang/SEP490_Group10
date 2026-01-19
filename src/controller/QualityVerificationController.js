const QualityVerificationService = require("../services/QualityVerificationService");

const verifyQuality = async (req, res) => {
  try {
    const userId = req.user._id;
    const response = await QualityVerificationService.verifyQuality(userId, req.body);
    return res.status(response.status === "OK" ? 200 : 400).json(response);
  } catch (error) {
    return res.status(500).json({
      status: "ERR",
      message: error.message || "Internal Server Error",
    });
  }
};

const getQualityVerifications = async (req, res) => {
  try {
    const response = await QualityVerificationService.getQualityVerifications(req.query);
    return res.status(200).json(response);
  } catch (error) {
    return res.status(500).json({
      status: "ERR",
      message: error.message || "Internal Server Error",
    });
  }
};

const getQualityVerificationById = async (req, res) => {
  try {
    const { id } = req.params;
    const response = await QualityVerificationService.getQualityVerificationById(id);
    return res.status(response.status === "OK" ? 200 : 400).json(response);
  } catch (error) {
    return res.status(500).json({
      status: "ERR",
      message: error.message || "Internal Server Error",
    });
  }
};

const updateQualityVerification = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;
    const response = await QualityVerificationService.updateQualityVerification(id, userId, req.body);
    return res.status(response.status === "OK" ? 200 : 400).json(response);
  } catch (error) {
    return res.status(500).json({
      status: "ERR",
      message: error.message || "Internal Server Error",
    });
  }
};

const deleteQualityVerification = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;
    const response = await QualityVerificationService.deleteQualityVerification(id, userId);
    return res.status(response.status === "OK" ? 200 : 400).json(response);
  } catch (error) {
    return res.status(500).json({
      status: "ERR",
      message: error.message || "Internal Server Error",
    });
  }
};

module.exports = {
  verifyQuality,
  getQualityVerifications,
  getQualityVerificationById,
  updateQualityVerification,
  deleteQualityVerification,
};
