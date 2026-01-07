
const AuthRouter = require("./AuthRouter");

const routes = (app) => {

    app.use("", AuthRouter);
};

module.exports = routes;