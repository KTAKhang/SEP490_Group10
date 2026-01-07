const UserModel = require("../models/UserModel");
const AuthService = require("../services/AuthService");

const loginWithGoogle = async (req, res) => {
    try {
        const { idToken } = req.body;
        if (!idToken) {
            return res.status(400).json({
                status: "ERR",
                message: "Mã thông báo ID Google là bắt buộc",
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
            message: "Đăng nhập Google thành công",
            data: response.data,
            token: {
                access_token: response.token.access_token, // chỉ trả access_token
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
                .json({ status: "ERR", message: "Tất cả các trường đều bắt buộc" });
        }
        const isStrictEmail = (email) => {
            const strictRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
            return strictRegex.test(email);
        };
        if (!isStrictEmail(email)) {
            return res.status(400).json({ status: "ERR", message: "Email không hợp lệ" });
        }
        const response = await AuthService.loginUser(req.body);
        const cookieValue = response.token.refresh_token;

        res.cookie("refreshToken", cookieValue, {
            httpOnly: true,
            secure: true,
            sameSite: "lax",
            maxAge: 7 * 24 * 60 * 60 * 1000,
            path: "/"
        });
        return res.status(200).json({
            status: "OK",
            message: "Đăng nhập thành công",
            data: response.data,
            token: {
                access_token: response.token.access_token,
            },
        });
    } catch (error) {
        return res.status(404).json({ message: error.message });
    }
};

const refreshTokenController = async (req, res) => {
    try {
        const refreshToken = req.cookies.refreshToken;
        if (!refreshToken) {
            return res.status(401).json({ status: "ERR", message: "Không có refresh token" });
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
        const refreshToken = req.cookies?.refreshToken;
        res.clearCookie("refreshToken", {
            httpOnly: true,
            secure: true,
            sameSite: "lax",
            path: "/"
        });

        if (!refreshToken) {
            return res.status(400).json({ status: "OK", message: "Không có người dùng nào đăng nhập" });
        }

        // Tìm user theo refresh token
        const user = await UserModel.findOne({ refreshToken });
        if (user) {
            // Xoá refresh token trong DB
            await AuthService.logoutUser(user._id);
        }

        return res.status(200).json({ status: "OK", message: "Đăng xuất thành công" });
    } catch (error) {
        return res.status(500).json({ status: "ERR", message: error.message });
    }
};

const sendRegisterOTP = async (req, res) => {
    try {
        const { user_name, email, password, phone, address } = req.body;

        if (!user_name || !email || !password || !phone || !address) {
            return res.status(400).json({
                status: "ERR",
                message: "Thiếu các trường bắt buộc",
            });
        }

        const isStrictUserName = (name) => {
            const regex = /^[\p{L}\p{N}_ ]{3,30}$/u;
            return regex.test(name);
        };
        if (!isStrictUserName(user_name)) {
            return res.status(400).json({
                status: "ERR",
                message: "Tên người dùng phải từ 3–30 ký tự, chỉ gồm chữ cái, số, khoảng trắng hoặc dấu gạch dưới",
            });
        }

        // Validate email
        const isStrictEmail = (email) => {
            const strictRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
            return strictRegex.test(email);
        };
        if (!isStrictEmail(email)) {
            return res.status(400).json({ status: "ERR", message: "Email không hợp lệ" });
        }


        const isStrictPassword = (password) => {
            const regex = /^(?=.*[A-Z])(?=.*\d).{8,8}$/;
            return regex.test(password);
        };
        if (!isStrictPassword(password)) {
            return res.status(400).json({
                status: "ERR",
                message: "Mật khẩu phải chứa 8 ký tự, bao gồm chữ hoa và số",
            });
        }


        const isStrictPhone = (phone) => {
            const phoneRegex = /^0\d{8,10}$/;
            return phoneRegex.test(phone);
        };
        if (!isStrictPhone(phone)) {
            return res.status(400).json({
                status: "ERR",
                message: "Số điện thoại không hợp lệ (phải bắt đầu bằng số 0 và chứa 9–11 chữ số)",
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
                message: "Địa chỉ phải từ 5–100 ký tự, chỉ chứa chữ, số, khoảng trắng và các ký tự , . -",
            });
        }

        const response = await AuthService.sendRegisterOTP(user_name, email, password, phone, address);

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
                message: "Email và OTP là bắt buộc",
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
                message: "Email bắt buộc",
            });
        }

        const response = await AuthService.sendResetPasswordOTP(email);

        if (!response || response.status === "ERR") {
            return res.status(400).json(response || {
                status: "ERR",
                message: "Không thể gửi OTP",
            });
        }

        res.status(200).json(response);
    } catch (error) {
        res.status(500).json({
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
                message: "Email, OTP, and new password là bắt buộc",
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
                    "Mật khẩu phải chứa 8 ký tự, bao gồm chữ hoa và số",
            });
        }

        const response = await AuthService.resetPassword(email, otp, newPassword);

        if (response.status === "ERR") {
            return res.status(400).json(response);
        }

        res.status(200).json(response);
    } catch (error) {
        res.status(500).json({
            status: "ERR",
            message: error.message,
        });
    }
};

const verifyTokenController = async (req, res) => {
    try {
        const { access_token } = req.body;
        const result = await AuthService.verifyAccessToken(access_token);

        return res.status(result.code).json({
            status: result.status,
            message: result.message,
            data: result.data || null,
        });
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
    verifyTokenController
};
