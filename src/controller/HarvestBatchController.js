const HarvestBatchService = require("../services/HarvestBatchService");

const createHarvestBatch = async (req, res) => {
  try {
    const response = await HarvestBatchService.createHarvestBatch(req.body);
    return res.status(response.status === "OK" ? 200 : 400).json(response);
  } catch (error) {
    return res.status(500).json({
      status: "ERR",
      message: error.message || "Internal Server Error",
    });
  }
};

const updateHarvestBatch = async (req, res) => {
  try {
    const { id } = req.params;
    const response = await HarvestBatchService.updateHarvestBatch(id, req.body);
    return res.status(response.status === "OK" ? 200 : 400).json(response);
  } catch (error) {
    return res.status(500).json({
      status: "ERR",
      message: error.message || "Internal Server Error",
    });
  }
};

const deleteHarvestBatch = async (req, res) => {
  try {
    const { id } = req.params;
    const response = await HarvestBatchService.deleteHarvestBatch(id);
    return res.status(response.status === "OK" ? 200 : 400).json(response);
  } catch (error) {
    return res.status(500).json({
      status: "ERR",
      message: error.message || "Internal Server Error",
    });
  }
};

const getHarvestBatches = async (req, res) => {
  try {
    const response = await HarvestBatchService.getHarvestBatches(req.query);
    return res.status(200).json(response);
  } catch (error) {
    return res.status(500).json({
      status: "ERR",
      message: error.message || "Internal Server Error",
    });
  }
};

const getHarvestBatchById = async (req, res) => {
  try {
    const { id } = req.params;
    const response = await HarvestBatchService.getHarvestBatchById(id);
    return res.status(response.status === "OK" ? 200 : 400).json(response);
  } catch (error) {
    return res.status(500).json({
      status: "ERR",
      message: error.message || "Internal Server Error",
    });
  }
};

module.exports = {
  createHarvestBatch,
  updateHarvestBatch,
  deleteHarvestBatch,
  getHarvestBatches,
  getHarvestBatchById,
};
