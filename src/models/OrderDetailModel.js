const mongoose = require('mongoose');
const orderDetailSchema = new mongoose.Schema({
  order_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "orders",
    required: true,
  },


  product_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "products",
    required: true,
  },


  product_name: {
    type: String,
    required: true,
  },


  product_image: {
    type: String,
  },


  product_category_name: {
    type: String,
  },


  product_brand: {
    type: String,
  },


  expiry_date: {
    type: Date,
  },


  quantity: {
    type: Number,
    required: true,
    min: 1,
  },


  price: {
    type: Number,
    required: true,
    min: 0,
  },
  // Giá gốc tại thời điểm đặt (để phân biệt bán đúng giá vs bán xả kho / giảm giá)
  original_price: {
    type: Number,
    default: null,
    min: 0,
  },
});
const OrderDetailModel = mongoose.model('order_details', orderDetailSchema);
module.exports = OrderDetailModel;
