const AuthRouter = require("./AuthRouter");
const ProfileRouter = require("./ProfileRouter");
const ContactRouter = require("./ContactRouter");
const CategoryRouter = require("./CategoryRouter");
const ProductRouter = require("./ProductRouter");
const InventoryRouter = require("./InventoryRouter");

const PublicProductRouter = require("./PublicProductRouter");
const PublicCategoryRouter = require("./PublicCategoryRouter");
const FavoriteRouter = require("./FavoriteRouter");


const CartRouter = require("./CartRouter");
const CheckoutRouter = require("./CheckoutRouter");
const OrderStatusRouter = require("./OrderStatusRouter");
const OrderRouter = require("./OrderRouter");
const PaymentRouter = require("./PaymentRouter");

const routes = (app) => {
    app.use("/auth", AuthRouter);
    app.use("/profile", ProfileRouter);
   app.use("/contacts", ContactRouter);
    app.use("/cart", CartRouter);
    app.use("/checkout", CheckoutRouter);
    app.use("/orderstatus", OrderStatusRouter);
    app.use("/order", OrderRouter);
    app.use("/payment", PaymentRouter);
    // Admin
    app.use("/admin/categories", CategoryRouter);
    app.use("/admin/products", ProductRouter);
    // Warehouse staff
    app.use("/inventory", InventoryRouter);
    // Public routes (không cần authentication)
    app.use("/products", PublicProductRouter);
    app.use("/categories", PublicCategoryRouter);
    // Customer routes (chỉ Customer)
    app.use("/favorites", FavoriteRouter);
};

module.exports = routes;