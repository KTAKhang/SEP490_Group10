const PreOrderAllocationService = require("../services/PreOrderAllocationService");

const getDemand = async (req, res) => {
  try {
    const { page, limit, keyword } = req.query;
    const response = await PreOrderAllocationService.getDemandByFruitType({ page, limit, keyword });
    return res.status(200).json(response);
  } catch (err) {
    return res.status(500).json({ status: "ERR", message: err.message });
  }
};

const listAllocations = async (req, res) => {
  try {
    const fruitTypeId = req.query.fruitTypeId;
    const response = await PreOrderAllocationService.listAllocations(fruitTypeId);
    return res.status(200).json(response);
  } catch (err) {
    return res.status(500).json({ status: "ERR", message: err.message });
  }
};

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
