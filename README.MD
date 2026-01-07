<!-- const mongoose = require("mongoose");

const categorySchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
    },
    image: String,
    status: {
        type: Boolean,
        required: true,
    },
},
    {
        timestamps: true,
    });

const CategoriesModel = mongoose.model("categories", categorySchema);

const category = new CategoriesModel({
    name: "Mô Hình",
    image: null,
    status: true
});
category.save() -->


<!-- const mongoose = require("mongoose");

const productSchema = new mongoose.Schema({
    category_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "categories",
        required: true,
    },
    name: {
        type: String,
        required: true,
    },
    image: String,
    price: {
        type: Number,
        required: true,
    },
    detail_desc: {
        type: String,
        required: true,
    },
    short_desc: {
        type: String,
        required: true,
    },
    quantity: {
        type: Number,
        required: true,
    },
    sold: Number,
    factory: {
        type: String,
        required: true,
    },
    target: {
        type: String,
        required: true,
    },
    status: {
        type: Boolean,
        required: true,
    },
},
    {
        timestamps: true,
    });

const ProductModel = mongoose.model("products", productSchema);
const product = new ProductModel(
    {
        category_id: "6827dfb393a9f82cbdcdb97c",
        name: "Mô hình Lamborghini Aventador",
        image: null,
        price: 599000,
        detail_desc: "Mô hình xe Lamborghini Aventador tỉ lệ 1/18, cửa mở được, bánh xe xoay linh hoạt.",
        short_desc: "Xe mô hình tỉ lệ 1/18 chất lượng cao.",
        quantity: 80,
        sold: 0,
        factory: "Maisto",
        target: "Trưng bày, quà tặng",
        status: true,
    })
product.save() -->