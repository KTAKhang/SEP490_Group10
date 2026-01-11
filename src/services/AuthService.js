const UserModel = require("../models/UserModel");
const TempOTPModel = require("../models/TempOTPModel");
const RoleModel = require("../models/RolesModel");
const nodemailer = require("nodemailer");
const { OAuth2Client } = require("google-auth-library");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const jwtService = require("./JwtService");
const dotenv = require("dotenv");

dotenv.config();

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    secure: true,
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
});



const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const loginWithGoogle = async (idToken) => {
    try {
        const ticket = await client.verifyIdToken({
            idToken,
            audience: process.env.GOOGLE_CLIENT_ID,
        });

        const payload = ticket.getPayload();
        const { sub: googleId, email, name, picture } = payload;

        let user = await UserModel.findOne({
            $or: [{ googleId }, { email }],
        });

        if (user) {
            if (!user.googleId) user.googleId = googleId;
            if (!user.isGoogleAccount) user.isGoogleAccount = true;
            if (picture && !user.avatar) user.avatar = picture;
        } else {
            user = new UserModel({
                user_name: name,
                email,
                googleId,
                isGoogleAccount: true,
                avatar: picture,
                role_id: new mongoose.Types.ObjectId(
                    "68c158d04aacbd32cdffce3b" // customer
                ),
            });
        }

        if (user.status === false) {
            const err = new Error("Tài khoản bị chặn");
            err.status = "ERR";
            throw err;
        }

        await user.save();

        const populatedUser = await UserModel
            .findById(user._id)
            .populate("role_id", "name -_id");

        const roleName = populatedUser?.role_id?.name || "customer";

        const accessToken = jwtService.generalAccessToken({
            _id: user._id,
            role: roleName,
            isAdmin: roleName === "admin",
        });

        const refreshToken = jwtService.generalRefreshToken({
            _id: user._id,
            role: roleName,
            isAdmin: roleName === "admin",
        });

        user.refreshToken = refreshToken;
        await user.save();

        return {
            status: "OK",
            message: "Đăng nhập Google thành công",
            data: {
                _id: populatedUser._id,
                user_name: populatedUser.user_name,
                email: populatedUser.email,
                avatar: populatedUser.avatar,
                role_name: roleName,
                status: populatedUser.status,
                isGoogleAccount: populatedUser.isGoogleAccount,
                createdAt: populatedUser.createdAt,
                updatedAt: populatedUser.updatedAt,
            },
            token: {
                access_token: accessToken,
                refresh_token: refreshToken,
            },
        };
    } catch (error) {
        throw error;
    }
};

const loginUser = async ({ email, password }) => {
    try {
        const user = await UserModel.findOne({
            email: { $regex: new RegExp(`^${email}$`, "i") },
        });
        if (!user) throw { status: "ERR", message: "Tài khoản không tồn tại" };

        if (user.status === false) throw { status: "ERR", message: "Tài khoản bị chặn" };

        const passwordMatch = bcrypt.compareSync(password, user.password);

        if (!passwordMatch) throw { status: "ERR", message: "Mật khẩu không đúng" };

        const populatedUser = await UserModel.findById(user._id).populate("role_id", "name -_id");
        const roleName = populatedUser?.role_id?.name || "customer";
        const accessToken = jwtService.generalAccessToken({
            _id: user._id,
            isAdmin: roleName === "admin",
            role: roleName,
        });
        const refreshToken = jwtService.generalRefreshToken({
            _id: user._id,
            isAdmin: roleName === "admin",
            role: roleName,
        });
        user.refreshToken = refreshToken;
        await user.save();
        return {
            status: "OK",
            message: "Đăng nhập thành công",
            data: {
                _id: populatedUser._id,
                user_name: populatedUser.user_name,
                email: populatedUser.email,
                avatar: populatedUser.avatar,
                role_name: populatedUser.role_id.name,
                phone: populatedUser.phone,
                address: populatedUser.address,
                status: populatedUser.status,
                isGoogleAccount: populatedUser.isGoogleAccount ?? false, // ✅ fallback về false nếu undefined/null
                createdAt: populatedUser.createdAt,
                updatedAt: populatedUser.updatedAt,
            },
            token: {
                access_token: accessToken, refresh_token: refreshToken
            },
        };
    } catch (error) {
        throw error;
    }
};

// Refresh token
const refreshAccessToken = async (refreshToken) => {
    try {
        const payload = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);
        const user = await UserModel.findById(payload._id);

        if (!user || user.refreshToken !== refreshToken)
            throw { status: "ERR", message: "refresh token không hợp lệ" };

        const newAccessToken = jwtService.generalAccessToken({
            _id: user._id,
            isAdmin: payload.isAdmin,
            role: payload.role,
        });

        return { access_token: newAccessToken };
    } catch (err) {
        if (err.name === "TokenExpiredError") {
            throw { status: "ERR", message: "Refresh token đã hết hạn" };
        }
        throw { status: "ERR", message: "Refresh token không hợp lệ" };
    }
};

const logoutUser = async (userId) => {
    // Xoá refresh token trong DB
    await UserModel.findByIdAndUpdate(userId, { $unset: { refreshToken: 1 } });
    return { status: "OK", message: "Đăng xuất thành công", userId };
};

const sendRegisterOTP = async (user_name, email, password, phone, address) => {
    const existingUser = await UserModel.findOne({ email });
    const existingUserName = await UserModel.findOne({ user_name });
    if (existingUser) {
        return { status: "ERR", message: "Email đã được đăng ký!" };
    }

    if (existingUserName) {
        return { status: "ERR", message: "Tên người dùng đã được sử dụng!" };
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    await TempOTPModel.findOneAndUpdate(
        { email },
        {
            otp,
            expiresAt: Date.now() + 10 * 60 * 1000,
            user_name,
            password,
            phone,
            address,
        },
        { upsert: true, new: true }
    );

    await transporter.sendMail({
        from: process.env.SMTP_USER,
        to: email,
        subject: "🔐 OTP for Registration",
        html: `
        <div style="max-width: 400px; margin: 20px auto; padding: 20px; border: 2px solid #4CAF50; border-radius: 10px; background-color: #f9fff9; font-family: Arial, sans-serif; text-align: center;">
  <h2 style="color: #4CAF50; margin-bottom: 10px;">Your OTP Code</h2>
  <p style="font-size: 16px; color: #333;">
    Please use the following OTP to verify your account:
  </p>
  <div style="font-size: 24px; font-weight: bold; color: #ffffff; background-color: #4CAF50; padding: 10px 20px; border-radius: 8px; display: inline-block; letter-spacing: 2px;">
    ${otp}
  </div>
  <p style="margin-top: 15px; color: #666;">This code will expire in <strong>10 minutes</strong>.</p>
</div>
`,
    });

    return { status: "OK", message: "OTP đã được gửi đến email" };
};


const confirmRegisterOTP = async (email, otp) => {
    // Tìm OTP theo email + otp
    const tempRecord = await TempOTPModel.findOne({ email, otp });

    if (!tempRecord) {
        return { status: "ERR", message: "Email hoặc OTP không đúng" };
    }

    if (tempRecord.expiresAt < Date.now()) {
        return { status: "ERR", message: "OTP đã hết hạn" };
    }

    // Check email đã tồn tại trong bảng User chưa
    const existingUser = await UserModel.findOne({ email });
    if (existingUser) {
        return { status: "ERR", message: "Email đã được đăng ký" };
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(tempRecord.password, 10);
    const customerRole = await RoleModel.findOne({ name: "customer" });

    // Kiểm tra role "customer" có tồn tại không
    if (!customerRole) {
        return {
            status: "ERR",
            message: "Role 'customer' không tồn tại trong hệ thống. Vui lòng liên hệ quản trị viên.",
        };
    }

    const newUser = new UserModel({
        user_name: tempRecord.user_name,
        email,
        password: hashedPassword,
        role_id: customerRole._id,
        phone: tempRecord.phone,
        address: tempRecord.address,
        avatar: "https://res.cloudinary.com/dkbsae4kc/image/upload/v1763021650/avatars/qpajnru8n9zc1unkx9so.png",
    });

    await newUser.save();
    await TempOTPModel.deleteOne({ email });

    return { status: "OK", message: "Đăng ký thành công" };
};



const sendResetPasswordOTP = async (email) => {
    const user = await UserModel.findOne({ email });
    if (!user) throw new Error("Email không tồn tại!");

    // ✅ Không cho reset password với tài khoản Google
    if (user.isGoogleAccount) {
        throw new Error("Tài khoản này sử dụng thông tin đăng nhập Google và không thể đặt lại mật khẩu.");
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    user.resetPasswordOTP = otp;
    user.resetPasswordExpires = Date.now() + 10 * 60 * 1000;
    await user.save();

    try {
        await transporter.sendMail({
            from: process.env.SMTP_USER,
            to: email,
            subject: "🔒 Reset Password OTP",
            html: `
      <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 500px; margin: auto; border: 1px solid #ddd; border-radius: 10px;background-color:rgb(174, 216, 48);">
        <h2 style="color: #007bff; text-align: center;">🔐 Reset Your Password</h2>
        <p style="font-size: 16px;">Hello,</p>
        <p style="font-size: 16px;">We received a request to reset your password. Use the OTP below to proceed:</p>
        <div style="text-align: center; padding: 10px 20px; background-color: #f3f3f3; border-radius: 5px; font-size: 20px; font-weight: bold;">
          ${otp}
        </div>
        <p style="font-size: 14px; color: red;">⚠️ This OTP is valid for <strong>10 minutes</strong>. Do not share it with anyone.</p>
        <p style="font-size: 16px;">If you did not request this, please ignore this email.</p>
        <hr style="border: 0.5px solid #ddd;">
        <p style="text-align: center; font-size: 12px; color: #666;">&copy; 2024 Your Company. All rights reserved.</p>
      </div>
    `,
        });
    } catch (err) {
        return {
            status: "ERR",
            message: "Không gửi được email. Vui lòng thử lại sau.",
        };
    }

    return { status: "OK", message: "Đã gửi OTP tới email thành công." };
};


const resetPassword = async (email, otp, newPassword) => {
    const user = await UserModel.findOne({ email });
    if (!user) throw new Error("Tài khoản không tồn tại!");

    if (user.resetPasswordOTP !== otp) {
        throw new Error("OTP không hợp lệ");
    }

    if (user.resetPasswordExpires < Date.now()) {
        throw new Error("OTP hết hạn");
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    user.password = hashedPassword;
    user.resetPasswordOTP = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    return { status: "OK", message: "Đặt lại mật khẩu thành công!" };
};

const verifyAccessToken = async (access_token) => {
    if (!access_token) {
        return {
            status: "ERR",
            code: 400,
            message: "Access token là bắt buộc",
        };
    }
    let decoded;
    try {
        decoded = jwt.verify(access_token, process.env.ACCESS_TOKEN_SECRET);
    } catch (err) {
        return {
            status: "ERR",
            code: 401,
            message: "Token không hợp lệ hoặc đã hết hạn",
        };
    }
    const user = await UserModel.findById(decoded._id).populate("role_id", "name");
    if (!user) {
        return {
            status: "ERR",
            code: 404,
            message: "Người dùng không tồn tại",
        };
    }
    if (user.status === false) {
        return {
            status: "ERR",
            code: 403,
            message: "Tài khoản bị khóa",
        };
    }
    return {
        status: "OK",
        code: 200,
        message: "Token hợp lệ",
        data: {
            _id: user._id,
            user_name: user.user_name,
            email: user.email,
            role: user.role_id?.name || "customer",
            status: user.status,
        },
    };
};

module.exports = {
    sendResetPasswordOTP,
    resetPassword,
    sendRegisterOTP,
    confirmRegisterOTP,
    loginWithGoogle,
    loginUser,
    refreshAccessToken,
    logoutUser,
    verifyAccessToken
};
