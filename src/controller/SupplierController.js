const SupplierService = require("../services/SupplierService");
// Import các controller đã tách
const HarvestBatchController = require("./HarvestBatchController");

const createSupplier = async (req, res) => {
  try {
    const userId = req.user._id;
    const response = await SupplierService.createSupplier(userId, req.body);
    return res.status(response.status === "OK" ? 200 : 400).json(response);
  } catch (error) {
    return res.status(500).json({
      status: "ERR",
      message: error.message || "Internal Server Error",
    });
  }
};

const updateSupplier = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;
    const response = await SupplierService.updateSupplier(id, userId, req.body);
    return res.status(response.status === "OK" ? 200 : 400).json(response);
  } catch (error) {
    return res.status(500).json({
      status: "ERR",
      message: error.message || "Internal Server Error",
    });
  }
};

const getSuppliers = async (req, res) => {
  try {
    const response = await SupplierService.getSuppliers(req.query);
    return res.status(200).json(response);
  } catch (error) {
    return res.status(500).json({
      status: "ERR",
      message: error.message || "Internal Server Error",
    });
  }
};

const getSupplierById = async (req, res) => {
  try {
    const { id } = req.params;
    const response = await SupplierService.getSupplierById(id);
    return res.status(response.status === "OK" ? 200 : 400).json(response);
  } catch (error) {
    return res.status(500).json({
      status: "ERR",
      message: error.message || "Internal Server Error",
    });
  }
};

const deleteSupplier = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;
    const response = await SupplierService.deleteSupplier(id, userId);
    return res.status(response.status === "OK" ? 200 : 400).json(response);
  } catch (error) {
    return res.status(500).json({
      status: "ERR",
      message: error.message || "Internal Server Error",
    });
  }
};

const getSuppliersForBrand = async (req, res) => {
  try {
    const response = await SupplierService.getSuppliersForBrand();
    return res.status(200).json(response);
  } catch (error) {
    return res.status(500).json({
      status: "ERR",
      message: error.message || "Internal Server Error",
    });
  }
};

const updatePurchaseCost = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;
    const response = await SupplierService.updatePurchaseCost(id, userId, req.body);
    return res.status(response.status === "OK" ? 200 : 400).json(response);
  } catch (error) {
    return res.status(500).json({
      status: "ERR",
      message: error.message || "Internal Server Error",
    });
  }
};

const updateCooperationStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;
    const response = await SupplierService.updateCooperationStatus(id, userId, req.body);
    return res.status(response.status === "OK" ? 200 : 400).json(response);
  } catch (error) {
    return res.status(500).json({
      status: "ERR",
      message: error.message || "Internal Server Error",
    });
  }
};

// ✅ Re-export các controller đã tách để giữ backward compatibility
module.exports = {
  // Supplier Management
  createSupplier,
  updateSupplier,
  deleteSupplier,
  getSuppliers,
  getSupplierById,
  getSuppliersForBrand,
  updatePurchaseCost,
  updateCooperationStatus,
  
  // Harvest Batch Management (re-export từ HarvestBatchController)
  createHarvestBatch: HarvestBatchController.createHarvestBatch,
  updateHarvestBatch: HarvestBatchController.updateHarvestBatch,
  deleteHarvestBatch: HarvestBatchController.deleteHarvestBatch,
  getHarvestBatches: HarvestBatchController.getHarvestBatches,
  getHarvestBatchById: HarvestBatchController.getHarvestBatchById,
};
