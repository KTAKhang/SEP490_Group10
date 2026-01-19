const mongoose = require('mongoose');

const orderStatusSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, "Tên trạng thái đơn hàng là bắt buộc"],
        trim: true,
        minlength: [2, "Tên trạng thái phải có ít nhất 2 ký tự"],
        maxlength: [50, "Tên trạng thái không được vượt quá 50 ký tự"],
    },
    description: {
        type: String,
        required: [true, "Mô tả là bắt buộc"],
        trim: true,
        maxlength: [200, "Mô tả không được vượt quá 200 ký tự"],
    },
});

const OrderStatusModel = mongoose.model('order_statuses', orderStatusSchema);
module.exports = OrderStatusModel;