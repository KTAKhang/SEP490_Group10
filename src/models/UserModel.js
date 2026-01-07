const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
    {
        user_name: {
            type: String,
            required: [true, "Tên người dùng là bắt buộc"],
            trim: true,
            minlength: [3, "Tên người dùng phải có ít nhất 3 ký tự"],
            maxlength: [50, "Tên người dùng không được vượt quá 50 ký tự"],
        },
        email: {
            type: String,
            required: [true, "Email là bắt buộc"],
            trim: true,
            lowercase: true,
            unique: true,
            match: [/\S+@\S+\.\S+/, "Định dạng email không hợp lệ"],
        },
        password: {
            type: String,
            required: function () {
                return !this.isGoogleAccount; // Nếu không phải Google thì bắt buộc
            },
        },
        avatar: {
            type: String,
            trim: true,
        },
        role_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "roles",
            required: [true, "Vai trò là bắt buộc"],
        },
        resetPasswordOTP: {
            type: String,
            default: null,
        },
        resetPasswordExpires: {
            type: Date,
            default: null,
        },
        status: {
            type: Boolean,
            default: true,
        },
        refreshToken: {
            type: String,
            default: null,
        },


        googleId: {
            type: String,
            default: undefined,
            unique: true, // mỗi Google ID là duy nhất
            sparse: true, // cho phép null nhưng vẫn unique
        },
        isGoogleAccount: {
            type: Boolean,
            default: false,
        },


        phone: {
            type: String,
            default: null,
            required: function () {
                return !this.isGoogleAccount;
            },
            trim: true,
        },
        address: {
            type: String,
            default: null,
            required: function () {
                return !this.isGoogleAccount;
            },
            trim: true,
        },
    },
    {
        timestamps: true,
    }
);

const UserModel = mongoose.model("users", userSchema);
module.exports = UserModel;
