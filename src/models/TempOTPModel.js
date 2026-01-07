const mongoose = require("mongoose");

const tempOTPSchema = new mongoose.Schema({
    email: {
        type: String,
        required: [true, "Email là bắt buộc"],
        unique: true,
        trim: true,
        lowercase: true,
        match: [/\S+@\S+\.\S+/, "Định dạng email không hợp lệ"],
    },
    otp: {
        type: String,
        required: [true, "Mã OTP là bắt buộc"],
        match: [/^\d{6}$/, "Mã OTP phải gồm đúng 6 chữ số"],
    },
    expiresAt: {
        type: Date,
        required: [true, "Ngày hết hạn là bắt buộc"],
    },
    user_name: {
        type: String,
        required: [true, "Tên người dùng là bắt buộc"],
        trim: true,
        minlength: [3, "Tên người dùng phải có ít nhất 3 ký tự"],
        maxlength: [50, "Tên người dùng không được vượt quá 50 ký tự"],
    },
    password: {
        type: String,
        required: [true, "Mật khẩu là bắt buộc"],
    },
    phone: {
        type: String,
        required: [true, "Số điện thoại là bắt buộc"],
        trim: true,
        match: [/^\d{9,11}$/, "Số điện thoại phải có 9-11 chữ số"], // thêm regex
    },
    address: {
        type: String,
        required: [true, "Địa chỉ là bắt buộc"],
        trim: true,
        minlength: [5, "Địa chỉ phải có ít nhất 5 ký tự"],
    },
});

const TempOTPModel = mongoose.model("temp_otps", tempOTPSchema);
module.exports = TempOTPModel;
