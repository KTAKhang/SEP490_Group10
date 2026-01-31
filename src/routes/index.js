const AuthRouter = require("./AuthRouter");
const ProfileRouter = require("./ProfileRouter");
const ContactRouter = require("./ContactRouter");

  
const CategoryRouter = require("./CategoryRouter");
const ProductRouter = require("./ProductRouter");
const InventoryRouter = require("./InventoryRouter");
const NewsRouter = require("./NewsRouter");
const NewsCommentRouter = require("./NewsCommentRouter");
const HomepageAssetRouter = require("./HomepageAssetRouter");
const ShopRouter = require("./ShopRouter");
const ShopPublicRouter = require("./ShopPublicRouter");
const UploadRouter = require("./UploadRouter");

const PublicProductRouter = require("./PublicProductRouter");
const PublicCategoryRouter = require("./PublicCategoryRouter");
const FavoriteRouter = require("./FavoriteRouter");


const CartRouter = require("./CartRouter");
const CheckoutRouter = require("./CheckoutRouter");
const OrderStatusRouter = require("./OrderStatusRouter");
const OrderRouter = require("./OrderRouter");
const PaymentRouter = require("./PaymentRouter");
  
const StaffRouter = require("./StaffRouter");
const CustomerRouter = require("./CustomerRouter");
const DiscountRouter = require("./DiscountRouter");

const routes = (app) => {
    app.use("/auth", AuthRouter);
    app.use("/profile", ProfileRouter);
   app.use("/contacts", ContactRouter);
    // Public shop info (for customer - no auth required)
    app.use("/shop", ShopPublicRouter);
    // Upload endpoints
    app.use("/upload", UploadRouter);
    app.use("/cart", CartRouter);
    app.use("/checkout", CheckoutRouter);
    app.use("/orderstatus", OrderStatusRouter);
    app.use("/order", OrderRouter);
    app.use("/payment", PaymentRouter);
    // Admin
    app.use("/admin/categories", CategoryRouter);
    app.use("/admin/products", ProductRouter);
    app.use("/admin/shop", ShopRouter);
    // Homepage Assets - Admin routes
    app.use("/api/admin/homepage-assets", (req, res, next) => {
      console.log(`🔗 HomepageAssetRouter matched: ${req.method} ${req.path}`);
      next();
    }, HomepageAssetRouter);
    // Warehouse staff
    app.use("/inventory", InventoryRouter);
    // News
    app.use("/news", NewsRouter);
    // News Comments
    app.use("/news-comments", NewsCommentRouter);
    // Public routes (không cần authentication)
    app.use("/products", PublicProductRouter);
    app.use("/categories", PublicCategoryRouter);
    app.use("/api/homepage-assets", HomepageAssetRouter);
    // Customer routes (chỉ Customer)
    app.use("/favorites", FavoriteRouter);
    // Staff management routes
    app.use("/staff", StaffRouter);
    //Customer management routes
    app.use("/customers", CustomerRouter);
    // Discount management routes
    app.use("/discounts", DiscountRouter);
};

module.exports = routes;