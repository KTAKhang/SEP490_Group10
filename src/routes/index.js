
const AuthRouter = require("./AuthRouter");
const ProfileRouter = require("./ProfileRouter");
const routes = (app) => {
    app.use("/auth", AuthRouter);
    app.use("/profile", ProfileRouter);
};

module.exports = routes;