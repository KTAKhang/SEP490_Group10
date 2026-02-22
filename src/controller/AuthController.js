const UserModel = require("../models/UserModel");
const AuthService = require("../services/AuthService");

const loginWithGoogle = async (req, res) => {
  try {
    const { idToken } = req.body;
    if (!idToken) {
      return res.status(400).json({
        status: "ERR",
        message: "A Google ID token is required.",
      });
    }
    const response = await AuthService.loginWithGoogle(idToken);
    const cookieValue = response.token.refresh_token;
    res.cookie("refreshToken", cookieValue, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    if (response.status === "ERR") {
      return res.status(400).json(response);
    }

    return res.status(200).json({
      status: "OK",
      message: "Successfully logged into Google.",
      data: response.data,
      token: {
        access_token: response.token.access_token, // chỉ trả access_token
        refresh_token: response.token.refresh_token,
      },
    });
  } catch (error) {
    return res.status(500).json({
      status: "ERR",
      message: error.message,
    });
  }
};

const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res
        .status(400)
        .json({ status: "ERR", message: "All fields are required" });
    }
    const isStrictEmail = (email) => {
      const strictRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
      return strictRegex.test(email);
    };
    if (!isStrictEmail(email)) {
      return res.status(400).json({ status: "ERR", message: "Email invalid" });
    }
    const response = await AuthService.loginUser(req.body);
    const cookieValue = response.token.refresh_token;

    res.cookie("refreshToken", cookieValue, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: "/",
    });
    return res.status(200).json({
      status: "OK",
      message: "Login successful",
      data: response.data,
      token: {
        access_token: response.token.access_token,
        refresh_token: response.token.refresh_token,
      },
    });
  } catch (error) {
    return res.status(401).json({ status: "ERR", message: error.message });
  }
};

const refreshTokenController = async (req, res) => {
  try {
    const refreshToken = req.cookies.refreshToken;
    if (!refreshToken) {
      return res
        .status(401)
        .json({ status: "ERR", message: "No refresh token" });
    }

    const newToken = await AuthService.refreshAccessToken(refreshToken);

    return res.status(200).json({ status: "OK", token: newToken });
  } catch (error) {
    // Nếu refresh token hết hạn hoặc không hợp lệ => xoá cookie
    res.clearCookie("refreshToken", {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
    });

    return res.status(401).json({ status: "ERR", message: error.message });
  }
};

const logoutController = async (req, res) => {
  try {
    // 1️⃣ Lấy refreshToken từ nhiều nguồn
    const refreshToken =
      req.cookies?.refreshToken ||        // Web cookie
      req.body?.refreshToken ||           // Mobile body
      req.headers["x-refresh-token"];     // Mobile header

    if (!refreshToken) {
      return res.status(400).json({
        status: "ERR",
        message: "Refresh token missing",
      });
    }

    // 2️⃣ Tìm user theo refreshToken
    const user = await UserModel.findOne({ refreshToken });

    if (user) {
      // Xoá refreshToken trong DB
      await AuthService.logoutUser(user._id);
    }

    // 3️⃣ Clear cookie (web)
    res.clearCookie("refreshToken", {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
    });

    return res.status(200).json({
      status: "OK",
      message: "Logout Successful",
    });

  } catch (error) {
    return res.status(500).json({
      status: "ERR",
      message: error.message,
    });
  }
};


const sendRegisterOTP = async (req, res) => {
  try {
    const { user_name, email, password, phone, address, birthday, gender } =
      req.body;

    if (
      !user_name ||
      !email ||
      !password ||
      !phone ||
      !address ||
      !birthday ||
      !gender
    ) {
      return res.status(400).json({
        status: "ERR",
        message: "Missing required fields",
      });
    }

    const isStrictUserName = (name) => {
      const regex = /^[\p{L}\p{N}_ ]{3,30}$/u;
      return regex.test(name);
    };
    if (!isStrictUserName(user_name)) {
      return res.status(400).json({
        status: "ERR",
        message:
          "Usernames must be between 3 and 30 characters long and can only include letters, numbers, spaces, or underscores.",
      });
    }

    // Validate email
    const isStrictEmail = (email) => {
      const strictRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
      return strictRegex.test(email);
    };
    if (!isStrictEmail(email)) {
      return res.status(400).json({ status: "ERR", message: "Email Invalid" });
    }

    const isStrictPassword = (password) => {
      const regex = /^(?=.*[A-Z])(?=.*\d).{8,8}$/;
      return regex.test(password);
    };
    if (!isStrictPassword(password)) {
      return res.status(400).json({
        status: "ERR",
        message:
          "The password must contain 8 characters, including uppercase letters and numbers.",
      });
    }

    const isStrictPhone = (phone) => {
      const phoneRegex = /^0\d{8,10}$/;
      return phoneRegex.test(phone);
    };
    if (!isStrictPhone(phone)) {
      return res.status(400).json({
        status: "ERR",
        message:
          "Invalid phone number (must start with 0 and contain 9–11 digits)",
      });
    }

    // Validate address (5–100 ký tự, cho phép chữ, số, dấu , . - và khoảng trắng)
    const isStrictAddress = (addr) => {
      const regex = /^[\p{L}\p{N}\s,.\-\/]{5,100}$/u;
      return regex.test(addr);
    };
    if (!isStrictAddress(address)) {
      return res.status(400).json({
        status: "ERR",
        message:
          "Addresses must be between 5 and 100 characters long and contain only letters, numbers, spaces, and commas ,.-",
      });
    }

    const isValidBirthday = (date) => {
      const birth = new Date(date);
      if (isNaN(birth)) return false;

      const age = new Date().getFullYear() - birth.getFullYear();
      return age >= 13;
    };

    if (!isValidBirthday(birthday)) {
      return res.status(400).json({
        status: "ERR",
        message: "Invalid date of birth (must be 13 years old or older)",
      });
    }

    const validGenders = ["male", "female", "other"];
    if (!validGenders.includes(gender)) {
      return res.status(400).json({
        status: "ERR",
        message: "Gender invalid",
      });
    }

    const response = await AuthService.sendRegisterOTP(
      user_name,
      email,
      password,
      phone,
      address,
      birthday,
      gender,
    );

    if (response.status === "ERR") {
      return res.status(400).json(response);
    }

    return res.status(200).json(response);
  } catch (error) {
    return res.status(500).json({
      status: "ERR",
      message: error.message,
    });
  }
};

const confirmRegisterOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({
        status: "ERR",
        message: "Email and OTP are required.",
      });
    }

    const response = await AuthService.confirmRegisterOTP(email, otp);

    if (response.status === "ERR") {
      return res.status(400).json(response);
    }

    return res.status(200).json(response);
  } catch (error) {
    return res.status(500).json({
      status: "ERR",
      message: error.message,
    });
  }
};

const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        status: "ERR",
        message: "Email is required",
      });
    }

    const response = await AuthService.sendResetPasswordOTP(email);

    if (!response || response.status === "ERR") {
      return res.status(400).json(
        response || {
          status: "ERR",
          message: "Unable to send OTP",
        },
      );
    }

    return res.status(200).json(response);
  } catch (error) {
    return res.status(500).json({
      status: "ERR",
      message: error.message,
    });
  }
};

const resetPassword = async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;

    if (!email || !otp || !newPassword) {
      return res.status(400).json({
        status: "ERR",
        message: "Email, OTP, and new password are required",
      });
    }

    const isStrictPassword = (password) => {
      const regex = /^(?=.*[A-Z])(?=.*\d).{8,8}$/;
      return regex.test(password);
    };

    if (!isStrictPassword(newPassword)) {
      return res.status(400).json({
        status: "ERR",
        message:
          "The password must contain 8 characters, including uppercase letters and numbers.",
      });
    }

    const response = await AuthService.resetPassword(email, otp, newPassword);

    if (response.status === "ERR") {
      return res.status(400).json(response);
    }

    return res.status(200).json(response);
  } catch (error) {
    return res.status(500).json({
      status: "ERR",
      message: error.message,
    });
  }
};

module.exports = {
  forgotPassword,
  resetPassword,
  sendRegisterOTP,
  confirmRegisterOTP,
  loginWithGoogle,
  loginUser,
  refreshTokenController,
  logoutController,
};
