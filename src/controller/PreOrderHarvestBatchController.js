const PreOrderHarvestBatchService = require("../services/PreOrderHarvestBatchService");

const createBatch = async (req, res) => {
  try {
    const { harvestBatchId, fruitTypeId, supplierId, quantityKg, harvestDate, batchNumber, notes } = req.body;
    const response = await PreOrderHarvestBatchService.createBatch({
      harvestBatchId,
      fruitTypeId,
      supplierId,
      quantityKg,
      harvestDate,
      batchNumber,
      notes,
    });
    return res.status(response.status === "OK" ? 200 : 400).json(response);
  } catch (err) {
    return res.status(400).json({ status: "ERR", message: err.message });
  }
};

const listBatches = async (req, res) => {
  try {
    const { fruitTypeId, supplierId, status } = req.query;
    const response = await PreOrderHarvestBatchService.listBatches({
      fruitTypeId,
      supplierId,
      status,
    });
    return res.status(200).json(response);
  } catch (err) {
    return res.status(500).json({ status: "ERR", message: err.message });
  }
};

const getBatchById = async (req, res) => {
  try {
    const { id } = req.params;
    const response = await PreOrderHarvestBatchService.getBatchById(id);
    return res.status(response.status === "OK" ? 200 : 404).json(response);
  } catch (err) {
    return res.status(500).json({ status: "ERR", message: err.message });
  }
};

module.exports = {
  createBatch,
  listBatches,
  getBatchById,
};
