/**
 * Pre-order Stock Controller
 *
 * HTTP layer for pre-order stock and warehouse receive. Delegates to PreOrderStockService.
 * Full-order fulfillment only: import requires supplierAvailableQuantity and simulation validation.
 *
 * Handles:
 * - GET /preorder-stock: list stock by fruit type (receivedKg, allocatedKg, availableKg)
 * - POST /preorder-stock/simulate-import: simulate FIFO full-order fulfillment (body: fruitTypeId or preOrderHarvestBatchId, supplierAvailableQuantity)
 * - POST /preorder-stock/receive: record receive by fruit type (body: fruitTypeId, supplierAvailableQuantity, note)
 * - POST /preorder-stock/receive-by-batch: record receive by PreOrderHarvestBatch (body: preOrderHarvestBatchId, quantityKg, note); no simulation, warehouse receives planned quantity
 * - GET /preorder-stock/receives: list receive history (query: fruitTypeId, preOrderHarvestBatchId, page, limit)
 *
 * @module controller/PreOrderStockController
 */
const mongoose = require("mongoose");
const PreOrderStockService = require("../services/PreOrderStockService");
const PreOrderService = require("../services/PreOrderService");
const PreOrderHarvestBatchModel = require("../models/PreOrderHarvestBatchModel");

/** List pre-order stock by fruit type. */
const listStock = async (req, res) => {
  try {
    const response = await PreOrderStockService.listStock();
    return res.status(200).json(response);
  } catch (err) {
    return res.status(500).json({ status: "ERR", message: err.message });
  }
};

/**
 * Simulate pre-order import: FIFO full-order fulfillment.
 * Body: { supplierAvailableQuantity, fruitTypeId? } or { supplierAvailableQuantity, preOrderHarvestBatchId? }
 * Returns: { supplierAvailableQuantity, numberOfOrdersCanBeFulfilled, recommendedImportQuantity, excessQuantity }
 */
const simulateImport = async (req, res) => {
  try {
    const { supplierAvailableQuantity, fruitTypeId, preOrderHarvestBatchId } = req.body;
    if (supplierAvailableQuantity == null) {
      return res.status(400).json({ status: "ERR", message: "Missing supplierAvailableQuantity" });
    }
    let resolvedFruitTypeId = fruitTypeId;
    if (preOrderHarvestBatchId && mongoose.isValidObjectId(preOrderHarvestBatchId)) {
      const batch = await PreOrderHarvestBatchModel.findById(preOrderHarvestBatchId).select("fruitTypeId").lean();
      if (!batch) return res.status(400).json({ status: "ERR", message: "Pre-order batch not found" });
      resolvedFruitTypeId = batch.fruitTypeId?._id || batch.fruitTypeId;
    }
    if (!resolvedFruitTypeId) {
      return res.status(400).json({ status: "ERR", message: "Provide fruitTypeId or preOrderHarvestBatchId" });
    }
    const simulation = await PreOrderService.simulatePreOrderImport(
      resolvedFruitTypeId.toString(),
      Number(supplierAvailableQuantity)
    );
    return res.status(200).json({ status: "OK", data: simulation });
  } catch (err) {
    return res.status(400).json({ status: "ERR", message: err.message });
  }
};

const createReceive = async (req, res) => {
  try {
    const { fruitTypeId, supplierAvailableQuantity, note } = req.body;
    const receivedBy = req.user._id;
    if (!fruitTypeId || supplierAvailableQuantity == null) {
      return res.status(400).json({ status: "ERR", message: "Missing fruitTypeId or supplierAvailableQuantity" });
    }
    const response = await PreOrderStockService.createReceive({
      fruitTypeId,
      supplierAvailableQuantity: Number(supplierAvailableQuantity),
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

module.exports = { listStock, simulateImport, createReceive, createReceiveByBatch, listReceives };
