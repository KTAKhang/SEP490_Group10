const SupplierPerformanceService = require("../services/SupplierPerformanceService");

const evaluatePerformance = async (req, res) => {
  try {
    const userId = req.user._id;
    const response = await SupplierPerformanceService.evaluatePerformance(userId, req.body);
    return res.status(response.status === "OK" ? 200 : 400).json(response);
  } catch (error) {
    return res.status(500).json({
      status: "ERR",
      message: error.message || "Internal Server Error",
    });
  }
};

const getPerformances = async (req, res) => {
  try {
    const response = await SupplierPerformanceService.getPerformances(req.query);
    return res.status(200).json(response);
  } catch (error) {
    return res.status(500).json({
      status: "ERR",
      message: error.message || "Internal Server Error",
    });
  }
};

const getPerformanceById = async (req, res) => {
  try {
    const { id } = req.params;
    const response = await SupplierPerformanceService.getPerformanceById(id);
    return res.status(response.status === "OK" ? 200 : 400).json(response);
  } catch (error) {
    return res.status(500).json({
      status: "ERR",
      message: error.message || "Internal Server Error",
    });
  }
};

const deletePerformance = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;
    const response = await SupplierPerformanceService.deletePerformance(id, userId);
    return res.status(response.status === "OK" ? 200 : 400).json(response);
  } catch (error) {
    return res.status(500).json({
      status: "ERR",
      message: error.message || "Internal Server Error",
    });
  }
};

module.exports = {
  evaluatePerformance,
  getPerformances,
  getPerformanceById,
  deletePerformance,
};
