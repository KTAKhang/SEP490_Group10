const UserModel = require("../models/UserModel");
const RoleModel = require("../models/RolesModel");
const cloudinary = require("../config/cloudinaryConfig");
const bcrypt = require("bcrypt");


const updateProfile = async (id, { user_name, phone, address, birthday, gender }, file) => {
    try {
        const user = await UserModel.findById(id);
        if (!user) {
            return { status: "ERR", message: "The user does not exist." };
        }


        // Kiểm tra trùng tên người dùng
        const existingUserName = await UserModel.findOne({
            user_name,
            _id: { $ne: id },
        });
        if (existingUserName) {
            return { status: "ERR", message: "The username is already in use!" };
        }


        const updateFields = {
            user_name: user_name || user.user_name,
            phone: phone || user.phone,
            address: address || user.address,
            birthday: birthday || user.birthday,
            gender:  gender || user.gender,
            avatar: user.avatar,
        };


        // Upload avatar nếu có
        if (file) {
            if (user.avatar) {
                try {
                    const oldImageId = user.avatar.split("/").pop().split(".")[0];
                    await cloudinary.uploader.destroy(`avatars/${oldImageId}`);
                } catch (err) {
                    console.warn("Unable to delete old photos:", err.message);
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
            return { status: "ERR", message: "Update failed" };
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
            birthday: updatedUser.birthday,
            gender: updatedUser.gender,
            createdAt: updatedUser.createdAt,
            updatedAt: updatedUser.updatedAt,
        };


        return { status: "OK", message: "Information updated successfully!", data: dataOutput };
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
                    message: "User does not exist",
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
                birthday: dataUser.birthday,
                gender: dataUser.gender,
                createdAt: dataUser.createdAt,
                updatedAt: dataUser.updatedAt,
            };
            if (!userDetail) {
                resolve({
                    status: "ERR",
                    message: "User does not exist",
                });
            }
            resolve({
                status: "OK",
                message: "Fetched user information successfully!",
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
            return { status: "ERR", message: "User does not exist!" };
        }
        if (checkUser.isGoogleAccount === true) {
            return { status: "ERR", message: "Cannot change the password for a Google account." };
        }
        const checkPassword = bcrypt.compareSync(old_password, checkUser.password);
        if (!checkPassword) {
            return { status: "ERR", message: "Incorrect current password!" };
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
            message: "Password changed successfully!",
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
