const AuthRouter = require("./AuthRouter");
const ProfileRouter = require("./ProfileRouter");
const ContactRouter = require("./ContactRouter");
const CategoryRouter = require("./CategoryRouter");
const ProductRouter = require("./ProductRouter");
const InventoryRouter = require("./InventoryRouter");
const NewsRouter = require("./NewsRouter");
const ShopRouter = require("./ShopRouter");
const ShopPublicRouter = require("./ShopPublicRouter");
const UploadRouter = require("./UploadRouter");

const routes = (app) => {
    app.use("/auth", AuthRouter);
    app.use("/profile", ProfileRouter);
   app.use("/contacts", ContactRouter);
    // Public shop info (for customer - no auth required)
    app.use("/shop", ShopPublicRouter);
    // Upload endpoints
    app.use("/upload", UploadRouter);
    // Admin
    app.use("/admin/categories", CategoryRouter);
    app.use("/admin/products", ProductRouter);
    app.use("/admin/shop", ShopRouter);
    // Warehouse staff
    app.use("/inventory", InventoryRouter);
    // News
    app.use("/news", NewsRouter);
};

module.exports = routes;