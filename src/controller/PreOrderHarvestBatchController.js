/**
 * Pre-order Harvest Batch Controller
 *
 * HTTP layer for pre-order receive batches. Delegates to PreOrderHarvestBatchService.
 *
 * Handles:
 * - POST: create pre-order receive batch (body: harvestBatchId or supplierId+harvestDate+batchNumber, fruitTypeId, supplierAvailableQuantity, notes); simulation runs here, batch quantity = recommended
 * - GET: list batches with filters (fruitTypeId, supplierId, status, page, limit, keyword, sortBy, sortOrder)
 * - GET /:id: get batch by ID
 *
 * @module controller/PreOrderHarvestBatchController
 */
const PreOrderHarvestBatchService = require("../services/PreOrderHarvestBatchService");

/** Create a pre-order receive batch. Simulation runs here; batch quantity = recommended import quantity. */
const createBatch = async (req, res) => {
  try {
    const { harvestBatchId, fruitTypeId, supplierId, supplierAvailableQuantity, harvestDate, batchNumber, notes } = req.body;
    const response = await PreOrderHarvestBatchService.createBatch({
      harvestBatchId,
      fruitTypeId,
      supplierId,
      supplierAvailableQuantity,
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
    const { fruitTypeId, supplierId, status, page, limit, keyword, sortBy, sortOrder } = req.query;
    const response = await PreOrderHarvestBatchService.listBatches({
      fruitTypeId,
      supplierId,
      status,
      page,
      limit,
      keyword,
      sortBy,
      sortOrder,
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
