const AuthRouter = require("./AuthRouter");
const ProfileRouter = require("./ProfileRouter");
const ContactRouter = require("./ContactRouter");
const StaffRouter = require("./StaffRouter");
const routes = (app) => {
    app.use("/auth", AuthRouter);
    app.use("/profile", ProfileRouter);
    app.use("/contacts", ContactRouter);
    // Staff management routes
    app.use("/staff", StaffRouter);
};

module.exports = routes;