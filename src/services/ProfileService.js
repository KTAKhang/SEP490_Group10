const UserModel = require("../models/UserModel");
const RoleModel = require("../models/RolesModel");
const cloudinary = require("../config/cloudinaryConfig");
const bcrypt = require("bcrypt");

const updateProfile = async (id, { user_name, phone, address }, file) => {
    try {
        const user = await UserModel.findById(id);
        if (!user) {
            return { status: "ERR", message: "Người dùng không tồn tại" };
        }

        // Kiểm tra trùng tên người dùng
        const existingUserName = await UserModel.findOne({
            user_name,
            _id: { $ne: id },
        });
        if (existingUserName) {
            return { status: "ERR", message: "Tên người dùng đã được sử dụng!" };
        }

        const updateFields = {
            user_name: user_name || user.user_name,
            phone: phone || user.phone,
            address: address || user.address,
            avatar: user.avatar,
        };

        // Upload avatar nếu có
        if (file) {
            if (user.avatar) {
                try {
                    const oldImageId = user.avatar.split("/").pop().split(".")[0];
                    await cloudinary.uploader.destroy(`avatars/${oldImageId}`);
                } catch (err) {
                    console.warn("Không thể xóa ảnh cũ:", err.message);
                }
            }

            const uploadResult = await new Promise((resolve, reject) => {
                const uploadStream = cloudinary.uploader.upload_stream(
                    { folder: "avatars" },
                    (error, result) => (error ? reject(error) : resolve(result))
                );
                uploadStream.end(file.buffer);
            });

            updateFields.avatar = uploadResult.secure_url;
        }

        // Cập nhật user
        const updatedUser = await UserModel.findByIdAndUpdate(id, updateFields, {
            new: true,
        }).populate("role_id", "name -_id");

        if (!updatedUser) {
            return { status: "ERR", message: "Cập nhật thất bại" };
        }

        const dataOutput = {
            _id: updatedUser._id,
            user_name: updatedUser.user_name,
            email: updatedUser.email,
            phone: updatedUser.phone,
            address: updatedUser.address,
            role_name: updatedUser.role_id?.name || null,
            avatar: updatedUser.avatar,
            status: updatedUser.status,
            createdAt: updatedUser.createdAt,
            updatedAt: updatedUser.updatedAt,
        };

        return { status: "OK", message: "Cập nhật thông tin thành công!", data: dataOutput };
    } catch (error) {
        console.error("UpdateProfile Service Error:", error);
        return { status: "ERR", message: error.message };
    }
};
const getUserById = (id) => {
    return new Promise(async (resolve, reject) => {
        try {
            const userDetail = await UserModel.findById(id);
            if (!userDetail) {
                resolve({
                    status: "ERR",
                    message: "Người dùng không tồn tại",
                });
            }
            const dataUser = await UserModel.findById(userDetail._id).populate(
                "role_id",
                "name -_id"
            );

            const dataOutput = {
                _id: dataUser._id,
                user_name: dataUser.user_name,
                email: dataUser.email,
                role_name: dataUser.role_id.name,
                address: dataUser.address,
                phone: dataUser.phone,
                avatar: dataUser.avatar,
                status: dataUser.status,
                createdAt: dataUser.createdAt,
                updatedAt: dataUser.updatedAt,
            };
            if (!userDetail) {
                resolve({
                    status: "ERR",
                    message: "Người dùng không tồn tại",
                });
            }
            resolve({
                status: "OK",
                message: "Nhận thông tin người dùng thành công!",
                data: dataOutput,
            });
        } catch (error) {
            reject(error);
        }
    });
};
const changePassword = async (userID, old_password, new_password) => {
    try {
        const checkUser = await UserModel.findById(userID);
        if (!checkUser) {
            return { status: "ERR", message: "Người dùng không tồn tại!" };
        }
        if (checkUser.isGoogleAccount === true) {
            return { status: "ERR", message: "Không thể đổi mật khẩu cho tài khoản Google." };
        }
        const checkPassword = bcrypt.compareSync(old_password, checkUser.password);
        if (!checkPassword) {
            return { status: "ERR", message: "Mật khẩu cũ không đúng!" };
        }
        const hash = bcrypt.hashSync(new_password, 10);
        const updateData = await UserModel.findByIdAndUpdate(
            userID,
            {
                password: hash,
            },
            { new: true }
        );
        const dataUser = await UserModel.findById(updateData._id).populate(
            "role_id",
            "name -_id"
        );
        const dataOutput = {
            _id: dataUser._id,
            email: dataUser.email,
            user_name: dataUser.user_name,
            password: dataUser.password,
            role_name: dataUser.role_id.name,
            avatar: dataUser.avatar,
            status: dataUser.status,
            createdAt: dataUser.createdAt,
            updatedAt: dataUser.updatedAt,
        };
        return {
            status: "OK",
            message: "Thay đổi mật khẩu thành công!",
            data: dataOutput,
        };
    } catch (error) {
        return { status: "ERR", message: error.message };
    }
};

module.exports = {
    updateProfile,
    getUserById,
    changePassword,
};

