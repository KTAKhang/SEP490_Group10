const AuthRouter = require("./AuthRouter");
const ProfileRouter = require("./ProfileRouter");
const ContactRouter = require("./ContactRouter");
const CategoryRouter = require("./CategoryRouter");
const ProductRouter = require("./ProductRouter");
const InventoryRouter = require("./InventoryRouter");
const PublicProductRouter = require("./PublicProductRouter");
const PublicCategoryRouter = require("./PublicCategoryRouter");

const routes = (app) => {
    app.use("/auth", AuthRouter);
    app.use("/profile", ProfileRouter);
   app.use("/contacts", ContactRouter);
    // Admin
    app.use("/admin/categories", CategoryRouter);
    app.use("/admin/products", ProductRouter);
    // Warehouse staff
    app.use("/inventory", InventoryRouter);
    // Public routes (không cần authentication)
    app.use("/products", PublicProductRouter);
    app.use("/categories", PublicCategoryRouter);
};

module.exports = routes;