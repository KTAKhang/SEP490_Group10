const AuthRouter = require("./AuthRouter");
const ProfileRouter = require("./ProfileRouter");
const ContactRouter = require("./ContactRouter");
const StaffRouter = require("./StaffRouter");
const CustomerRouter = require("./CustomerRouter");
const DiscountRouter = require("./DiscountRouter");
const routes = (app) => {
    app.use("/auth", AuthRouter);
    app.use("/profile", ProfileRouter);
    app.use("/contacts", ContactRouter);
    // Staff management routes
    app.use("/staff", StaffRouter);
    //Customer management routes
    app.use("/customers", CustomerRouter);
    // Discount management routes
    app.use("/discounts", DiscountRouter);
};

module.exports = routes;