/**
 * Pre-order Stock Controller
 *
 * HTTP layer for pre-order stock and warehouse receive. Delegates to PreOrderStockService.
 *
 * Handles:
 * - GET /preorder-stock: list stock by fruit type (receivedKg, allocatedKg, availableKg)
 * - POST /preorder-stock/receive: record receive by fruit type (body: fruitTypeId, quantityKg, note)
 * - POST /preorder-stock/receive-by-batch: record receive by PreOrderHarvestBatch (body: preOrderHarvestBatchId, quantityKg, note)
 * - GET /preorder-stock/receives: list receive history (query: fruitTypeId, preOrderHarvestBatchId, page, limit)
 *
 * @module controller/PreOrderStockController
 */
const PreOrderStockService = require("../services/PreOrderStockService");

/** List pre-order stock by fruit type. */
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
      confirmed: true,
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
      confirmed: true,
      note: note || "",
    });
    return res.status(200).json(response);
  } catch (err) {
    return res.status(400).json({ status: "ERR", message: err.message });
  }
};

const listReceives = async (req, res) => {
  try {
    const { fruitTypeId, preOrderHarvestBatchId, page, limit, receivedBy } = req.query;
    const receivedByFilter = receivedBy === "me" ? req.user._id?.toString() : receivedBy || null;
    const response = await PreOrderStockService.listReceives(
      fruitTypeId,
      page,
      limit,
      preOrderHarvestBatchId,
      receivedByFilter
    );
    return res.status(200).json(response);
  } catch (err) {
    return res.status(500).json({ status: "ERR", message: err.message });
  }
};

module.exports = { listStock, createReceive, createReceiveByBatch, listReceives };
