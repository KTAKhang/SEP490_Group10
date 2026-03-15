const UserModel = require("../models/UserModel");
const TempOTPModel = require("../models/TempOTPModel");
const RoleModel = require("../models/RolesModel");
const nodemailer = require("nodemailer");
const { OAuth2Client } = require("google-auth-library");
const client = new OAuth2Client();
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const jwtService = require("./JwtService");
const dotenv = require("dotenv");
const EmailService = require("./CustomerEmailService");

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

// const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const loginWithGoogle = async (idToken) => {
  try {
    // Danh sách client ID hợp lệ
    const CLIENT_IDS = [
      process.env.GOOGLE_WEB_CLIENT_ID,
      process.env.GOOGLE_EXPO_CLIENT_ID,
      process.env.GOOGLE_ANDROID_CLIENT_ID,
      process.env.GOOGLE_WEB_CLIENT_ID_2,
    ];

    const ticket = await client.verifyIdToken({
      idToken,
      audience: CLIENT_IDS,
    });

    const payload = ticket.getPayload();
    console.log("TOKEN AUD:", payload.aud);
    console.log("EXPECTED:", CLIENT_IDS);
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
          "68c158d04aacbd32cdffce3b", // customer
        ),
      });
    }

    if (user.status === false) {
      const err = new Error(
        "Your account is locked, please contact us for support.",
      );
      err.status = "ERR";
      throw err;
    }

    await user.save();
    const populatedUser = await UserModel.findById(user._id).populate(
      "role_id",
      "name -_id",
    );

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
    user.currentAccessToken = accessToken;
    await user.save();
    return {
      status: "OK",
      message: "Login by Google Successfully",
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
    if (!user) throw { status: "ERR", message: "Incorrect email or password." };
    const MAX_LOGIN_ATTEMPTS = 5;
    const LOCK_TIME = 15 * 60 * 1000;
    if (user.status === false)
      throw {
        status: "ERR",
        message: "Your account is locked, please contact us for support.",
      };

    if (user.lockUntil && user.lockUntil > Date.now()) {
      throw {
        status: "ERR",
        message: "Your account has been locked for 15 minutes due to too many incorrect login attempts.",
      };
    }

    const passwordMatch = bcrypt.compareSync(password, user.password);

    if (!passwordMatch) {
      user.loginAttempts += 1;

      if (user.loginAttempts >= MAX_LOGIN_ATTEMPTS) {
        user.lockUntil = Date.now() + LOCK_TIME;
        user.loginAttempts = 0;
      }

      await user.save();

      throw { status: "ERR", message: "Incorrect email or password." };
    }

    const populatedUser = await UserModel.findById(user._id).populate(
      "role_id",
      "name -_id",
    );
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
    user.loginAttempts = 0;
    user.lockUntil = null;
    user.refreshToken = refreshToken;
    user.currentAccessToken = accessToken;
    await user.save();
    return {
      status: "OK",
      message: "Login Successfully",
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
        access_token: accessToken,
        refresh_token: refreshToken,
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
      throw { status: "ERR", message: "Invalid refresh token" };

    const newAccessToken = jwtService.generalAccessToken({
      _id: user._id,
      isAdmin: payload.isAdmin,
      role: payload.role,
    });
    // ❗ update accessToken mới
    user.currentAccessToken = newAccessToken;
    await user.save();

    return { access_token: newAccessToken };
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      throw { status: "ERR", message: "The refresh token has expired." };
    }
    throw { status: "ERR", message: "Invalid refresh token" };
  }
};

const logoutUser = async (userId) => {
  await UserModel.findByIdAndUpdate(userId, {
    refreshToken: null,
    currentAccessToken: null,
  });
  return { status: "OK", message: "Đăng xuất thành công", userId };
};

const sendRegisterOTP = async (
  user_name,
  email,
  password,
  fullName,
  phone,
  address,
  birthday,
  gender,
) => {

  const existingUser = await UserModel.findOne({
    $or: [
      { email: email },
      { user_name: user_name }
    ]
  });

  if (existingUser) {
    if (existingUser.email === email) {
      return { status: "ERR", message: "Email address has been registered!" };
    }

    if (existingUser.user_name === user_name) {
      return { status: "ERR", message: "The username is already in use!" };
    }
  }

  const otp = Math.floor(100000 + Math.random() * 900000).toString();

  await TempOTPModel.findOneAndUpdate(
    { email },
    {
      otp,
      expiresAt: Date.now() + 10 * 60 * 1000,
      user_name,
      password,
      fullName,
      phone,
      address,
      birthday,
      gender,
    },
    { upsert: true, new: true },
  );

  // call EmailService
  const emailResult = await EmailService.sendRegisterOTPEmail(
    email,
    fullName,
    otp
  );

  if (emailResult.status === "ERR") {
    return emailResult;
  }

  return {
    status: "OK",
    message: "The OTP has been sent to your email.",
  };
};

const confirmRegisterOTP = async (email, otp) => {
  // Tìm OTP theo email + otp
  const tempRecord = await TempOTPModel.findOne({ email, otp });

  if (!tempRecord) {
    return { status: "ERR", message: "Incorrect email or OTP" };
  }

  if (tempRecord.expiresAt < Date.now()) {
    return { status: "ERR", message: "The OTP has expired." };
  }

  // Check email đã tồn tại trong bảng User chưa
  const existingUser = await UserModel.findOne({ email });
  if (existingUser) {
    return { status: "ERR", message: "Email has been registered" };
  }

  // Hash password
  const hashedPassword = await bcrypt.hash(tempRecord.password, 10);
  const customerRole = await RoleModel.findOne({ name: "customer" });

  // Kiểm tra role "customer" có tồn tại không
  if (!customerRole) {
    return {
      status: "ERR",
      message: "The 'customer' role does not exist in the system",
    };
  }

  const newUser = new UserModel({
    user_name: tempRecord.user_name,
    email,
    password: hashedPassword,
    role_id: customerRole._id,
    fullName: tempRecord.fullName,
    phone: tempRecord.phone,
    address: tempRecord.address,
    birthday: tempRecord.birthday,
    gender: tempRecord.gender,
    avatar:
      "https://res.cloudinary.com/dkbsae4kc/image/upload/v1768096992/avatars/h1nqjlbxgemeymkobhr3.jpg",
  });

  await newUser.save();
  await TempOTPModel.deleteOne({ email });

  return { status: "OK", message: "Registration successful" };
};

const sendResetPasswordOTP = async (email) => {
  const user = await UserModel.findOne({ email });

  if (!user) {
    return {
      status: "ERR",
      message: "The email address doesn't exist",
    };
  }

  // Không cho reset với tài khoản Google
  if (user.isGoogleAccount) {
    return {
      status: "ERR",
      message:
        "This account uses Google login information and the password cannot be reset.",
    };
  }

  const otp = Math.floor(100000 + Math.random() * 900000).toString();

  user.resetPasswordOTP = otp;
  user.resetPasswordExpires = Date.now() + 10 * 60 * 1000;

  await user.save();

  const emailResult = await EmailService.sendResetPasswordOTPEmail(
    email,
    user.fullName,
    otp
  );

  if (emailResult.status === "ERR") {
    return emailResult;
  }

  return {
    status: "OK",
    message: "The OTP has been successfully sent to your email",
  };
};

const resetPassword = async (email, otp, newPassword) => {
  const user = await UserModel.findOne({ email });
  if (!user) throw new Error("The account does not exist");

  if (user.resetPasswordOTP !== otp) {
    throw new Error("Invalid OTP");
  }

  if (user.resetPasswordExpires < Date.now()) {
    throw new Error("OTP has expired.");
  }

  const hashedPassword = await bcrypt.hash(newPassword, 10);

  user.password = hashedPassword;
  user.resetPasswordOTP = undefined;
  user.resetPasswordExpires = undefined;
  await user.save();

  return { status: "OK", message: "Password reset successful" };
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
};
