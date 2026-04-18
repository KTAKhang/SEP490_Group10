const AuthRouter = require("./AuthRouter");
const ProfileRouter = require("./ProfileRouter");
const ContactRouter = require("./ContactRouter");

  
const CategoryRouter = require("./CategoryRouter");
const ProductRouter = require("./ProductRouter");
const InventoryRouter = require("./InventoryRouter");
const SupplierRouter = require("./SupplierRouter");
const HarvestBatchRouter = require("./HarvestBatchRouter");

const NewsRouter = require("./NewsRouter");
const NewsCommentRouter = require("./NewsCommentRouter");
const HomepageAssetRouter = require("./HomepageAssetRouter");
const ShopRouter = require("./ShopRouter");
const ShopPublicRouter = require("./ShopPublicRouter");
const UploadRouter = require("./UploadRouter");


const PublicProductRouter = require("./PublicProductRouter");
const PublicCategoryRouter = require("./PublicCategoryRouter");
const ReviewRouter = require("./ReviewRouter");
const FavoriteRouter = require("./FavoriteRouter");


const CartRouter = require("./CartRouter");
const CheckoutRouter = require("./CheckoutRouter");
const OrderStatusRouter = require("./OrderStatusRouter");
const OrderRouter = require("./OrderRouter");
const PaymentRouter = require("./PaymentRouter");
const PreOrderRouter = require("./PreOrderRouter");
const AdminPreOrderRouter = require("./AdminPreOrderRouter");
const AdminReviewRouter = require("./AdminReviewRouter");
const ExportRouter = require("./ExportRouter");
const FeedbackedStaffDashboardRouter = require("./FeedbackedStaffDashboardRouter");
const ChatRouter = require("./ChatRouter");
const ShippingRouter = require("./ShippingRouter");
const StaffRouter = require("./StaffRouter");
const CustomerRouter = require("./CustomerRouter");
const DiscountRouter = require("./DiscountRouter");
const NotificationRouter = require("./NotificationRouter");
const FruitAssistantRouter = require("./FruitAssistantRouter");

const routes = (app) => {
    // Authentication & Profile
    app.use("/auth", AuthRouter);
    app.use("/profile", ProfileRouter);
    app.use("/chat", ChatRouter);
    app.use("/shipping", ShippingRouter);

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
    app.use("/preorder", PreOrderRouter);
    app.use("/reviews", ReviewRouter);
    app.use("/admin/reviews", AdminReviewRouter);
    // Feedbacked-staff dashboard (admin + feedbacked-staff)
    app.use("/api/feedbacked-staff", FeedbackedStaffDashboardRouter);
    // Admin routes
    app.use("/admin/categories", CategoryRouter);
    app.use("/admin/products", ProductRouter);
    app.use("/admin/harvest-batch", HarvestBatchRouter);
    // Admin routes - Supplier Management
    app.use("/admin/suppliers", SupplierRouter); // ✅ Includes: /harvest-batch
    // Note: /for-brand trong SupplierRouter dùng authAdminMiddleware (Admin only)    
    app.use("/admin/shop", ShopRouter);
    app.use("/admin/preorder", AdminPreOrderRouter);
    app.use("/admin/export", ExportRouter);
    // Homepage Assets - Admin routes
    app.use("/api/admin/homepage-assets", (req, res, next) => {
      console.log(`🔗 HomepageAssetRouter matched: ${req.method} ${req.path}`);
      next();
    }, HomepageAssetRouter);
    // Warehouse staff
    app.use("/inventory", InventoryRouter);
    // News
    app.use("/news", NewsRouter);
    // News Comments (FE primary path uses /api/news-comments)
    app.use("/news-comments", NewsCommentRouter);
    app.use("/api/news-comments", NewsCommentRouter);
    app.use("/api/homepage-assets", HomepageAssetRouter);
    // Public routes (không cần authentication)
    app.use("/products", PublicProductRouter);
    app.use("/fruit-assistant", FruitAssistantRouter);
    app.use("/categories", PublicCategoryRouter);
    // Customer routes (chỉ Customer)
    app.use("/favorites", FavoriteRouter);
    // Staff management routes
    app.use("/staff", StaffRouter);
    //Customer management routes
    app.use("/customers", CustomerRouter);
    // Discount management routes (includes admin birthday report at GET /discounts/birthday/report)
    app.use("/discounts", DiscountRouter);
    // Notification routes
    app.use("/notifications", NotificationRouter);
};

module.exports = routes;