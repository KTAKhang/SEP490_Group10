const OrderStatusService = require('../services/OrderStatusService');


const getAllOrderStatus = async (req, res) => {
    try {
        const orderStatuses = await OrderStatusService.getAllOrderStatuses();
        return res.status(200).json(orderStatuses);
    } catch (error) {
        return res.status(500).json({
            status: "ERR",
            message: error.message || "Internal server error",
        });
    }
}

module.exports = {
    getAllOrderStatus,
};