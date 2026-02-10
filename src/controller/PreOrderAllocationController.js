/**
 * Pre-order Allocation Controller
 *
 * HTTP layer for pre-order demand and allocation. Delegates to PreOrderAllocationService.
 *
 * Handles:
 * - GET /demand: demand dashboard by fruit type (page, limit, keyword)
 * - GET /allocations: list allocation records (optional fruitTypeId)
 * - POST /allocations: run FIFO allocation for a fruit type (body: fruitTypeId, allocatedKg)
 *
 * @module controller/PreOrderAllocationController
 */
const PreOrderAllocationService = require("../services/PreOrderAllocationService");

/**
 * Get demand by fruit type with pagination and keyword filter.
 * @param {Object} req - Express request (query: page, limit, keyword)
 * @param {Object} res - Express response
 */
const getDemand = async (req, res) => {
  try {
    const { page, limit, keyword } = req.query;
    const response = await PreOrderAllocationService.getDemandByFruitType({ page, limit, keyword });
    return res.status(200).json(response);
  } catch (err) {
    return res.status(500).json({ status: "ERR", message: err.message });
  }
};

/**
 * List allocation records, optionally filtered by fruit type.
 * @param {Object} req - Express request (query.fruitTypeId optional)
 * @param {Object} res - Express response
 */
const listAllocations = async (req, res) => {
  try {
    const fruitTypeId = req.query.fruitTypeId;
    const response = await PreOrderAllocationService.listAllocations(fruitTypeId);
    return res.status(200).json(response);
  } catch (err) {
    return res.status(500).json({ status: "ERR", message: err.message });
  }
};

/**
 * Run FIFO allocation for a fruit type. Body: fruitTypeId (required), allocatedKg (ignored).
 * @param {Object} req - Express request (body: fruitTypeId, allocatedKg)
 * @param {Object} res - Express response
 */
const upsertAllocation = async (req, res) => {
  try {
    const { fruitTypeId, allocatedKg } = req.body;
    if (!fruitTypeId) {
      return res.status(400).json({ status: "ERR", message: "Missing fruitTypeId" });
    }
    const response = await PreOrderAllocationService.upsertAllocation({
      fruitTypeId,
      allocatedKg: allocatedKg != null ? Number(allocatedKg) : undefined,
    });
    return res.status(200).json(response);
  } catch (err) {
    return res.status(400).json({ status: "ERR", message: err.message });
  }
};

module.exports = {
  getDemand,
  listAllocations,
  upsertAllocation,
};
