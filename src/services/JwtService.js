const jwt = require("jsonwebtoken");
const dotenv = require("dotenv");
dotenv.config();

const generalAccessToken = (payload) => {
  
  const accessToken = jwt.sign(payload, process.env.ACCESS_TOKEN_SECRET, {
    expiresIn: "1d",
  });
  return accessToken;
};

const generalRefreshToken = (payload) => {
  const refreshToken = jwt.sign(payload, process.env.REFRESH_TOKEN_SECRET, {
    expiresIn: "7d",
  });
  return refreshToken;
};

const RefreshTokenJWT = (token) => {
  return new Promise(async (resolve, reject) => {
    try {
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, async (err, user) => {
        if (err) {
          resolve({
            status: "ERR",
            message: "The authentication",
          });
        }

        const accessToken = await generalAccessToken({
          _id: user._id,
          isAdmin: user.isAdmin,
          role: user.role,
        });
        resolve({
          status: "OK",
          message: "SUCCESS",
          access_token: accessToken,
        });
      });
    } catch (error) {
      reject(error);
    }
  });
};

module.exports = { generalAccessToken, generalRefreshToken, RefreshTokenJWT };
