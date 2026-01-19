const OrderStatusModel = require("../models/OrderStatusModel");

const getAllOrderStatuses = async () => {
    try {
        const orderStatuses = await OrderStatusModel.find();
        return { status: "OK", data: orderStatuses };
    } catch (error) {
        console.error("Error fetching order statuses:", error);
        throw { status: "ERR", message: "Failed to fetch order statuses" };
    }
}

module.exports = {
    getAllOrderStatuses,
};