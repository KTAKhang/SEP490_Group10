const jwt = require("jsonwebtoken");
require("dotenv").config();

const generalAccessToken = (payload) => {
    return jwt.sign(payload, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "1d",
        algorithm: "HS256",
    });
};

const generalRefreshToken = (payload) => {
    return jwt.sign(payload, process.env.REFRESH_TOKEN_SECRET, {
        expiresIn: "7d",
        algorithm: "HS256",
    });
};

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
