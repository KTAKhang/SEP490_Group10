const PreOrderStockService = require("../services/PreOrderStockService");

const listStock = async (req, res) => {
  try {
    const response = await PreOrderStockService.listStock();
    return res.status(200).json(response);
  } catch (err) {
    return res.status(500).json({ status: "ERR", message: err.message });
  }
};

const createReceive = async (req, res) => {
  try {
    const { fruitTypeId, quantityKg, note } = req.body;
    const receivedBy = req.user._id;
    if (!fruitTypeId || quantityKg == null) {
      return res.status(400).json({ status: "ERR", message: "Missing fruitTypeId or quantityKg" });
    }
    const response = await PreOrderStockService.createReceive({
      fruitTypeId,
      quantityKg: Number(quantityKg),
      receivedBy,
      note: note || "",
    });
    return res.status(200).json(response);
  } catch (err) {
    return res.status(400).json({ status: "ERR", message: err.message });
  }
};

const createReceiveByBatch = async (req, res) => {
  try {
    const { preOrderHarvestBatchId, quantityKg, note } = req.body;
    const receivedBy = req.user._id;
    if (!preOrderHarvestBatchId || quantityKg == null) {
      return res.status(400).json({ status: "ERR", message: "Missing preOrderHarvestBatchId or quantityKg" });
    }
    const response = await PreOrderStockService.createReceiveByBatch({
      preOrderHarvestBatchId,
      quantityKg: Number(quantityKg),
      receivedBy,
      note: note || "",
    });
    return res.status(200).json(response);
  } catch (err) {
    return res.status(400).json({ status: "ERR", message: err.message });
  }
};

const listReceives = async (req, res) => {
  try {
    const { fruitTypeId, preOrderHarvestBatchId, page, limit } = req.query;
    const response = await PreOrderStockService.listReceives(
      fruitTypeId,
      page,
      limit,
      preOrderHarvestBatchId
    );
    return res.status(200).json(response);
  } catch (err) {
    return res.status(500).json({ status: "ERR", message: err.message });
  }
};

module.exports = { listStock, createReceive, createReceiveByBatch, listReceives };
