const cloudinary = require("cloudinary").v2;
require("dotenv").config(); // Đọc biến môi trường từ .env

// Cấu hình Cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUD_NAME,
    api_key: process.env.API_KEY,
    api_secret: process.env.API_SECRET,
});

module.exports = cloudinary;
