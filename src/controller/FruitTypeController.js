/**
 * Fruit Type Controller
 *
 * HTTP layer for fruit types. Used by customer pre-order (list available, get by ID) and admin pre-order (list, get, create, update, delete).
 *
 * Handles:
 * - listAvailable, getAvailableById: public/customer pre-order listing (only visible fruit types)
 * - listAdmin, getById, create, update, remove: admin/sales-staff fruit type CRUD (demand and campaign-closed rules enforced in service)
 *
 * @module controller/FruitTypeController
 */
const FruitTypeService = require("../services/FruitTypeService");

/** List fruit types available for pre-order (customer). */
const listAvailable = async (req, res) => {
  try {
    const response = await FruitTypeService.listAvailableForPreOrder(req.query);
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
    const code = err.message && err.message.includes("not found") ? 404 : 500;
    return res.status(code).json({ status: "ERR", message: err.message });
  }
};

/** Admin: list fruit types with demand and pagination. */
const listAdmin = async (req, res) => {
  try {
    const response = await FruitTypeService.listAdmin(req.query);
    return res.status(200).json(response);
  } catch (err) {
    return res.status(500).json({ status: "ERR", message: err.message });
  }
};

/** Admin: get fruit type by ID. */
const getById = async (req, res) => {
  try {
    const response = await FruitTypeService.getById(req.params.id);
    return res.status(200).json(response);
  } catch (err) {
    const code = err.message && err.message.includes("not found") ? 404 : 500;
    return res.status(code).json({ status: "ERR", message: err.message });
  }
};

/** Admin: create fruit type. */
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
    const code = err.message && err.message.includes("not found") ? 404 : 400;
    return res.status(code).json({ status: "ERR", message: err.message });
  }
};

const remove = async (req, res) => {
  try {
    const response = await FruitTypeService.remove(req.params.id);
    return res.status(200).json(response);
  } catch (err) {
    const code = err.message && err.message.includes("not found") ? 404 : 400;
    return res.status(code).json({ status: "ERR", message: err.message });
  }
};

module.exports = { listAvailable, getAvailableById, listAdmin, getById, create, update, remove };
