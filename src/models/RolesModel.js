const mongoose = require("mongoose");

const roleSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, "Tên vai trò là bắt buộc"],
        trim: true,
        minlength: [3, "Tên vai trò phải có ít nhất 3 ký tự"],
        maxlength: [50, "Tên vai trò không được vượt quá 50 ký tự"],
        unique: true,
    },
    description: {
        type: String,
        trim: true,
        maxlength: [200, "Mô tả không được vượt quá 200 ký tự"],
        default: "",
    },
});

const RoleModel = mongoose.model("roles", roleSchema);
module.exports = RoleModel;
