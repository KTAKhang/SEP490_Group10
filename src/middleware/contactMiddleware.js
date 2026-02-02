/**
 * =============================================================================
 * CONTACT MIDDLEWARE - Xác thực & phân quyền cho module Contact
 * =============================================================================
 *
 * Luồng chung của cả 3 middleware:
 *   [Request] → Lấy token từ header → Verify JWT → Tìm user trong DB (populate role)
 *            → Kiểm tra user tồn tại → Kiểm tra tài khoản không bị khóa (status)
 *            → (Tuỳ middleware) Kiểm tra role Admin/User
 *            → Gán req.user → next()
 *
 * Khác biệt:
 *   - contactAuthMiddleware:  Chấp nhận cả User và Admin (chỉ cần đăng nhập hợp lệ).
 *   - contactAdminMiddleware: Chỉ cho phép role === "admin".
 *   - contactUserMiddleware:  Chỉ cho phép user thường (role !== "admin").
 *
 * Mã lỗi HTTP:
 *   401: Thiếu token / token hết hạn / token không hợp lệ
 *   403: Tài khoản bị khóa / không đủ quyền (sai role)
 *   404: User không tồn tại trong DB
 *   500: Lỗi server khác (vd: DB lỗi)
 */
const jwt = require("jsonwebtoken");
const UserModel = require("../models/UserModel");
require("dotenv").config();

/**
 * =============================================================================
 * contactAuthMiddleware - Xác thực người dùng (User hoặc Admin)
 * =============================================================================
 * GIẢI THUẬT:
 * 1. Trích xuất JWT từ header (hỗ trợ cả "Bearer <token>" và token thuần).
 * 2. Nếu không có token → trả 401 Unauthorized.
 * 3. Giải mã và xác thực token bằng ACCESS_TOKEN_SECRET.
 * 4. Tìm user trong DB theo _id trong payload; populate role_id để lấy tên role.
 * 5. Nếu user không tồn tại → trả 404.
 * 6. Nếu user.status === false (tài khoản bị khóa) → trả 403 Forbidden.
 * 7. Gán object user (id, user_name, email, role, isAdmin) vào req.user.
 * 8. Gọi next() để chuyển request sang route handler.
 * Xử lý lỗi: TokenExpiredError / JsonWebTokenError → 401; lỗi khác → 500.
 */
const contactAuthMiddleware = async (req, res, next) => {
    try {
        // Bước 1: Lấy token từ header (hỗ trợ "Authorization: Bearer <token>" hoặc "Authorization: <token>")
        const token = req.headers.authorization?.split(" ")[1] || req.headers.authorization;

        if (!token) {
            return res.status(401).json({
                status: "ERR",
                message: "Token không được cung cấp",
            });
        }

        // Bước 2: Giải mã JWT và kiểm tra chữ ký; decoded chứa payload (vd: _id, exp, iat)
        const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
        // Bước 3: Lấy user từ DB và populate role_id để có tên role (name)
        const user = await UserModel.findById(decoded._id).populate("role_id", "name");

        if (!user) {
            return res.status(404).json({
                status: "ERR",
                message: "Người dùng không tồn tại",
            });
        }

        // Bước 4: Kiểm tra tài khoản có bị khóa không (status = false)
        if (user.status === false) {
            return res.status(403).json({
                status: "ERR",
                message: "Tài khoản bị khóa",
            });
        }

        // Bước 5: Gán thông tin user đã chuẩn hóa vào req để route handler dùng
        req.user = {
            _id: user._id,
            user_name: user.user_name,
            email: user.email,
            role: user.role_id?.name || "customer",
            isAdmin: user.role_id?.name === "admin",
        };

        next();
    } catch (error) {
        // Phân loại lỗi JWT để trả mã HTTP và message phù hợp
        if (error.name === "TokenExpiredError") {
            return res.status(401).json({
                status: "ERR",
                message: "Token đã hết hạn",
            });
        }
        if (error.name === "JsonWebTokenError") {
            return res.status(401).json({
                status: "ERR",
                message: "Token không hợp lệ",
            });
        }
        return res.status(500).json({
            status: "ERR",
            message: error.message,
        });
    }
};

/**
 * =============================================================================
 * contactAdminMiddleware - Chỉ cho phép Admin truy cập
 * =============================================================================
 * GIẢI THUẬT:
 * Giống contactAuthMiddleware đến bước kiểm tra status, sau đó:
 * 6. Lấy roleName từ user.role_id?.name (mặc định "customer" nếu không có).
 * 7. Nếu roleName !== "admin" → trả 403 "Chỉ Admin mới có quyền truy cập".
 * 8. Chỉ khi là admin mới gán req.user với isAdmin: true và gọi next().
 * Dùng cho các route quản lý Contact chỉ dành cho Admin (vd: danh sách liên hệ, duyệt/xóa).
 */
const contactAdminMiddleware = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(" ")[1] || req.headers.authorization;

        if (!token) {
            return res.status(401).json({
                status: "ERR",
                message: "Token không được cung cấp",
            });
        }

        const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
        const user = await UserModel.findById(decoded._id).populate("role_id", "name");

        if (!user) {
            return res.status(404).json({
                status: "ERR",
                message: "Người dùng không tồn tại",
            });
        }

        if (user.status === false) {
            return res.status(403).json({
                status: "ERR",
                message: "Tài khoản bị khóa",
            });
        }

        // Kiểm tra quyền: chỉ role "admin" mới được đi tiếp
        const roleName = user.role_id?.name || "customer";
        if (roleName !== "admin") {
            return res.status(403).json({
                status: "ERR",
                message: "Chỉ Admin mới có quyền truy cập",
            });
        }

        req.user = {
            _id: user._id,
            user_name: user.user_name,
            email: user.email,
            role: roleName,
            isAdmin: true,
        };

        next();
    } catch (error) {
        if (error.name === "TokenExpiredError") {
            return res.status(401).json({
                status: "ERR",
                message: "Token đã hết hạn",
            });
        }
        if (error.name === "JsonWebTokenError") {
            return res.status(401).json({
                status: "ERR",
                message: "Token không hợp lệ",
            });
        }
        return res.status(500).json({
            status: "ERR",
            message: error.message,
        });
    }
};

/**
 * =============================================================================
 * contactUserMiddleware - Chỉ cho phép User thường (không phải Admin)
 * =============================================================================
 * GIẢI THUẬT:
 * Giống contactAuthMiddleware đến bước kiểm tra status, sau đó:
 * 6. Lấy roleName từ user.role_id?.name (mặc định "customer").
 * 7. Nếu roleName === "admin" → trả 403 "Admin không thể sử dụng endpoint này".
 * 8. Chỉ user không phải admin mới được gán req.user với isAdmin: false và next().
 * Dùng cho các route chỉ dành cho khách hàng (vd: gửi form liên hệ, xem liên hệ của mình).
 */
const contactUserMiddleware = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(" ")[1] || req.headers.authorization;

        if (!token) {
            return res.status(401).json({
                status: "ERR",
                message: "Token không được cung cấp",
            });
        }

        const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
        const user = await UserModel.findById(decoded._id).populate("role_id", "name");

        if (!user) {
            return res.status(404).json({
                status: "ERR",
                message: "Người dùng không tồn tại",
            });
        }

        if (user.status === false) {
            return res.status(403).json({
                status: "ERR",
                message: "Tài khoản bị khóa",
            });
        }

        // Chặn Admin: endpoint này chỉ dành cho user thường (customer)
        const roleName = user.role_id?.name || "customer";
        if (roleName === "admin") {
            return res.status(403).json({
                status: "ERR",
                message: "Admin không thể sử dụng endpoint này",
            });
        }

        req.user = {
            _id: user._id,
            user_name: user.user_name,
            email: user.email,
            role: roleName,
            isAdmin: false,
        };

        next();
    } catch (error) {
        if (error.name === "TokenExpiredError") {
            return res.status(401).json({
                status: "ERR",
                message: "Token đã hết hạn",
            });
        }
        if (error.name === "JsonWebTokenError") {
            return res.status(401).json({
                status: "ERR",
                message: "Token không hợp lệ",
            });
        }
        return res.status(500).json({
            status: "ERR",
            message: error.message,
        });
    }
};

module.exports = {
    contactAuthMiddleware,
    contactAdminMiddleware,
    contactUserMiddleware,
};
