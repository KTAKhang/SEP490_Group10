const FruitTypeService = require("../services/FruitTypeService");

const listAvailable = async (req, res) => {
  try {
    const response = await FruitTypeService.listAvailableForPreOrder();
    return res.status(200).json(response);
  } catch (err) {
    return res.status(500).json({ status: "ERR", message: err.message });
  }
};

const getAvailableById = async (req, res) => {
  try {
    const response = await FruitTypeService.getAvailableById(req.params.id);
    return res.status(200).json(response);
  } catch (err) {
    const code = err.message && err.message.includes("Không tìm thấy") ? 404 : 500;
    return res.status(code).json({ status: "ERR", message: err.message });
  }
};

const listAdmin = async (req, res) => {
  try {
    const response = await FruitTypeService.listAdmin(req.query);
    return res.status(200).json(response);
  } catch (err) {
    return res.status(500).json({ status: "ERR", message: err.message });
  }
};

const getById = async (req, res) => {
  try {
    const response = await FruitTypeService.getById(req.params.id);
    return res.status(200).json(response);
  } catch (err) {
    const code = err.message && err.message.includes("Không tìm thấy") ? 404 : 500;
    return res.status(code).json({ status: "ERR", message: err.message });
  }
};

const create = async (req, res) => {
  try {
    const response = await FruitTypeService.create(req.body);
    return res.status(201).json(response);
  } catch (err) {
    return res.status(400).json({ status: "ERR", message: err.message });
  }
};

const update = async (req, res) => {
  try {
    const response = await FruitTypeService.update(req.params.id, req.body);
    return res.status(200).json(response);
  } catch (err) {
    const code = err.message && err.message.includes("Không tìm thấy") ? 404 : 400;
    return res.status(code).json({ status: "ERR", message: err.message });
  }
};

module.exports = { listAvailable, getAvailableById, listAdmin, getById, create, update };
