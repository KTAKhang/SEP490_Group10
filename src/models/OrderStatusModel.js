const mongoose = require('mongoose');

const orderStatusSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, "Order status name is required"],
        trim: true,
        minlength: [2, "Order status name must be at least 2 characters"],
        maxlength: [50, "Order status name must be at most 50 characters"],
    },
    description: {
        type: String,
        required: [true, "Description is required"],
        trim: true,
        maxlength: [200, "Description must be at most 200 characters"],
    },
});

const OrderStatusModel = mongoose.model('order_statuses', orderStatusSchema);
module.exports = OrderStatusModel;