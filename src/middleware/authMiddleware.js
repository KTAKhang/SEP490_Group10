const jwt = require("jsonwebtoken");
require("dotenv").config();

/**
 * Tạo Access Token (Token truy cập)
 * 
 * Tác dụng: Tạo JWT token dùng để xác thực người dùng khi truy cập các API
 * - Thời gian sống: 1 ngày (1d)
 * - Dùng thuật toán HS256 để mã hóa
 * - Token này được gửi kèm trong header của mỗi request để xác thực
 * 
 * @param {Object} payload - Thông tin người dùng cần mã hóa vào token (ví dụ: _id, isAdmin, role)
 * @returns {String} Access token đã được mã hóa
 */
const generalAccessToken = (payload) => {
    return jwt.sign(payload, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "1d",
        algorithm: "HS256",
    });
};

/**
 * Tạo Refresh Token (Token làm mới)
 * 
 * Tác dụng: Tạo JWT token dùng để làm mới Access Token khi Access Token hết hạn
 * - Thời gian sống: 7 ngày (7d) - dài hơn Access Token
 * - Dùng thuật toán HS256 để mã hóa
 * - Token này được lưu trữ an toàn (thường lưu trong database hoặc cookie httpOnly)
 * - Khi Access Token hết hạn, dùng Refresh Token để tạo Access Token mới mà không cần đăng nhập lại
 * 
 * @param {Object} payload - Thông tin người dùng cần mã hóa vào token (ví dụ: _id, isAdmin, role)
 * @returns {String} Refresh token đã được mã hóa
 */
const generalRefreshToken = (payload) => {
    return jwt.sign(payload, process.env.REFRESH_TOKEN_SECRET, {
        expiresIn: "7d",
        algorithm: "HS256",
    });
};

/**
 * Xác thực và làm mới Access Token từ Refresh Token
 * 
 * Tác dụng: 
 * - Xác thực Refresh Token có hợp lệ hay không
 * - Nếu hợp lệ, tạo Access Token mới từ thông tin trong Refresh Token
 * - Cho phép người dùng tiếp tục sử dụng hệ thống mà không cần đăng nhập lại
 * 
 * Quy trình:
 * 1. Verify Refresh Token với REFRESH_TOKEN_SECRET
 * 2. Nếu token hợp lệ, lấy thông tin user (_id, isAdmin, role) từ token
 * 3. Tạo Access Token mới từ thông tin user đó
 * 4. Trả về Access Token mới để client sử dụng
 * 
 * @param {String} refreshToken - Refresh token cần xác thực và làm mới
 * @returns {Promise<Object>} Promise trả về object chứa:
 *   - status: "OK" nếu thành công, "ERR" nếu thất bại
 *   - message: Thông báo kết quả
 *   - access_token: Access token mới (nếu thành công)
 */
const refreshTokenJWT = (refreshToken) => {
    return new Promise((resolve, reject) => {
        jwt.verify(
            refreshToken,
            process.env.REFRESH_TOKEN_SECRET,
            { algorithms: ["HS256"] },
            async (err, user) => {
                if (err) {
                    return resolve({
                        status: "ERR",
                        message: "Refresh token không hợp lệ",
                    });
                }

                const newAccessToken = generalAccessToken({
                    _id: user._id,
                    isAdmin: user.isAdmin,
                    role: user.role,
                });

                resolve({
                    status: "OK",
                    message: "SUCCESS",
                    access_token: newAccessToken,
                });
            }
        );
    });
};

module.exports = {
    generalAccessToken,
    generalRefreshToken,
    refreshTokenJWT,
};
