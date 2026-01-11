const AuthRouter = require("./AuthRouter");
const ContactRouter = require("./ContactRouter");

const routes = (app) => {
    app.use("/auth", AuthRouter);
    app.use("/contacts", ContactRouter);
};

module.exports = routes;