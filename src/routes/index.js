const AuthRouter = require("./AuthRouter");
const ProfileRouter = require("./ProfileRouter");
const ContactRouter = require("./ContactRouter");

  
const CategoryRouter = require("./CategoryRouter");
const ProductRouter = require("./ProductRouter");
const InventoryRouter = require("./InventoryRouter");
const FruitBasketRouter = require("./FruitBasketRouter");

const SupplierRouter = require("./SupplierRouter");
const HarvestBatchRouter = require("./HarvestBatchRouter");

const NewsRouter = require("./NewsRouter");
const ShopRouter = require("./ShopRouter");
const ShopPublicRouter = require("./ShopPublicRouter");
const UploadRouter = require("./UploadRouter");


const PublicProductRouter = require("./PublicProductRouter");
const PublicCategoryRouter = require("./PublicCategoryRouter");
const PublicFruitBasketRouter = require("./PublicFruitBasketRouter");
const ReviewRouter = require("./ReviewRouter");
const FavoriteRouter = require("./FavoriteRouter");


const CartRouter = require("./CartRouter");
const CheckoutRouter = require("./CheckoutRouter");
const OrderStatusRouter = require("./OrderStatusRouter");
const OrderRouter = require("./OrderRouter");
const PaymentRouter = require("./PaymentRouter");

const AdminReviewRouter = require("./AdminReviewRouter");
  

const ChatRouter = require("./ChatRouter");

const StaffRouter = require("./StaffRouter");
const CustomerRouter = require("./CustomerRouter");
const DiscountRouter = require("./DiscountRouter");
const NotificationRouter = require("./NotificationRouter");

const routes = (app) => {
    // Authentication & Profile
    app.use("/auth", AuthRouter);
    app.use("/profile", ProfileRouter);
    app.use("/chat", ChatRouter);

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
    app.use("/reviews", ReviewRouter);
    app.use("/admin/reviews", AdminReviewRouter);
    
    // Admin routes
    app.use("/admin/categories", CategoryRouter);
    app.use("/admin/products", ProductRouter);
    app.use("/admin/fruit-baskets", FruitBasketRouter);
    app.use("/admin/harvest-batch", HarvestBatchRouter);

    // Admin routes - Supplier Management
    app.use("/admin/suppliers", SupplierRouter); // ✅ Includes: /harvest-batch
    // Note: /for-brand trong SupplierRouter dùng authAdminMiddleware (Admin only)
    

    app.use("/admin/shop", ShopRouter);
    // Warehouse staff
    app.use("/inventory", InventoryRouter);
    // News
    app.use("/news", NewsRouter);

    // Public routes (không cần authentication)
    app.use("/products", PublicProductRouter);
    app.use("/categories", PublicCategoryRouter);
    app.use("/fruit-baskets", PublicFruitBasketRouter);
    
    // Customer routes (chỉ Customer)
    app.use("/favorites", FavoriteRouter);
    // Staff management routes
    app.use("/staff", StaffRouter);
    //Customer management routes
    app.use("/customers", CustomerRouter);
    // Discount management routes
    app.use("/discounts", DiscountRouter);
    // Notification routes
    app.use("/notifications", NotificationRouter);
};

module.exports = routes;