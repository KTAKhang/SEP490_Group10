const OrderModel = require("../models/OrderModel");
const OrderDetailModel = require("../models/OrderDetailModel");
const OrderStatusModel = require("../models/OrderStatusModel");
const OrderStatusChangeLogModel = require("../models/OrderStatusChangeLogModel");
const CartModel = require("../models/CartsModel");
const CartDetailModel = require("../models/CartDetailsModel");
const PaymentModel = require("../models/PaymentModel");
const { createVnpayPaymentUrl } = require("../controller/PaymentController");
const ProductModel = require("../models/ProductModel");
const StockLockModel = require("../models/StockLockModel");
const PaymentService = require("../services/PaymentService");
const ShippingService = require("../services/ShippingService");
const NotificationService = require("../services/NotificationService");
const CustomerEmailService = require("./CustomerEmailService");
const UserModel = require("../models/UserModel");
const ReviewModel = require("../models/ReviewModel");

const { default: mongoose } = require("mongoose");
const { createVnpayUrl } = require("../utils/createVnpayUrl");
const { getEffectivePrice } = require("../utils/productPrice");

const normalizeStatusName = (value) => {
  if (!value) return "";
  return value
    .toString()
    .trim()
    .toUpperCase()
    .replace(/[_\s]+/g, "-");
};

const normalizeToken = (value) =>
  value ? value.toString().trim().toUpperCase() : "";

const isReturnedStatus = (value) => {
  const normalized = normalizeStatusName(value);
  return normalized === "RETURNED";
};

const buildStatusRegex = (value) => {
  const normalized = normalizeStatusName(value);
  if (!normalized) return null;
  const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const flexible = escaped.replace(/-/g, "[-_\\s]+");
  return new RegExp(`^${flexible}$`, "i");
};

const findStatusByName = async (name, session) => {
  const regex = buildStatusRegex(name);
  if (!regex) return null;
  return OrderStatusModel.findOne({ name: { $regex: regex } }).session(
    session || null,
  );
};

const getOrderStatusName = async (statusId, session) => {
  if (!statusId) return "";
  const statusDoc = await OrderStatusModel.findById(statusId).session(
    session || null,
  );
  return normalizeStatusName(statusDoc?.name || "");
};

const isValidStatusTransition = (paymentMethod, currentStatus, nextStatus) => {
  const method = normalizeToken(paymentMethod);
  const current = normalizeStatusName(currentStatus);
  const next = normalizeStatusName(nextStatus);

  const transitions = {
    COD: {
      PENDING: ["READY-TO-SHIP", "CANCELLED"],
      "READY-TO-SHIP": ["SHIPPING"],
      SHIPPING: ["COMPLETED"],
    },
    VNPAY: {
      PENDING: ["PAID", "CANCELLED"],
      PAID: ["READY-TO-SHIP"],
      "READY-TO-SHIP": ["SHIPPING"],
      SHIPPING: ["COMPLETED"],
    },
  };

  const allowed = transitions[method] || {};
  return (allowed[current] || []).includes(next);
};

/* =====================================================
   HELPER: PUSH STATUS HISTORY
===================================================== */
async function pushStatusHistory({
  order,
  fromStatus,
  toStatus,
  userId,
  role,
  note,
  session,
}) {
  const roleValue = ["admin", "sales-staff", "customer"].includes(role) ? role : "admin";
  const changedAt = new Date();
  order.status_history.push({
    from_status: fromStatus,
    to_status: toStatus,
    changed_by: userId,
    changed_by_role: roleValue,
    note: note || "",
    changed_at: changedAt,
  });

  await order.save({ session });

  // Ghi log chi tiết (giống InventoryTransaction có createdBy) để truy vấn nhân viên nào đã cập nhật đơn
  await OrderStatusChangeLogModel.create(
    [
      {
        order_id: order._id,
        from_status: fromStatus,
        to_status: toStatus,
        changed_by: userId,
        changed_by_role: roleValue,
        note: note || "",
        changed_at: changedAt,
      },
    ],
    session ? { session } : {}
  );
}

/* =====================================================
   CREATE ORDER (PENDING)
===================================================== */
const confirmCheckoutAndCreateOrder = async ({
  user_id,
  selected_product_ids,
  receiverInfo,
  payment_method,
  ip,
  city,
}) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  // 🚫 CHECK USER SPAM TIMEOUT ORDER (24H)
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const timeoutOrdersCount = await PaymentModel.countDocuments({
    user_id,
    method: "VNPAY",
    status: "TIMEOUT",
    createdAt: { $gte: since },
  });

  if (timeoutOrdersCount >= 5) {
    throw new Error(
      "You have created too many failed payment orders. Please try again in 24 hours.",
    );
  }

  try {
    /* =======================
       1️⃣ LOAD CART
    ======================= */
    const cart = await CartModel.findOne({ user_id }).session(session);
    if (!cart) throw new Error("Shopping cart not found");

    const cartItems = await CartDetailModel.find({
      cart_id: cart._id,
      product_id: { $in: selected_product_ids },
    }).session(session);

    if (!cartItems.length) throw new Error("No products were selected");

    /* =======================
       2️⃣ LOAD & VALIDATE STOCK LOCK
    ======================= */
    const locks = await StockLockModel.find({
      user_id,
      product_id: { $in: selected_product_ids },
    }).session(session);

    const lockMap = new Map(locks.map((l) => [l.product_id.toString(), l]));

    /* =======================
       3️⃣ SNAPSHOT + CALC PRICE
    ======================= */
    let totalPrice = 0;
    const orderDetails = [];

    for (const item of cartItems) {
      const lock = lockMap.get(item.product_id.toString());
      if (!lock || lock.quantity < item.quantity)
        throw new Error("The holding period has expired");

      const product = await ProductModel.findById(item.product_id)
        .populate("category", "name")
        .session(session);

      if (!product || !product.status)
        throw new Error("The product is unavailable");

      const { effectivePrice, originalPrice } = getEffectivePrice(product);
      totalPrice += item.quantity * effectivePrice;
      orderDetails.push({
        product_id: product._id,
        quantity: item.quantity,
        price: effectivePrice,
        original_price: originalPrice ?? null,

        // snapshot
        product_name: product.name,
        product_image: product.images?.[0],
        product_category_name: product.category?.name,
        product_brand: product.brand,
        expiry_date: product.expiryDate,
      });
    }

    /* =======================
   3️⃣.5 CALCULATE SHIPPING
======================= */
    const { shippingFee, shippingType, shippingWeight } =
      await ShippingService.calculateShippingForCheckout({
        user_id,
        selected_product_ids,
        city,
        session,
      });

    const finalTotalPrice = totalPrice + shippingFee;

    /* =======================
       4️⃣ CREATE ORDER
    ======================= */
    const pendingStatus = await OrderStatusModel.findOne({
      name: "PENDING",
    }).session(session);

    if (!pendingStatus) throw new Error("Missing order status");

    const [order] = await OrderModel.create(
      [
        {
          user_id,
          total_price: finalTotalPrice,
          shipping_fee: shippingFee,
          shipping_type: shippingType,
          shipping_weight: shippingWeight,
          receiver_name: receiverInfo.receiver_name,
          receiver_phone: receiverInfo.receiver_phone,
          receiver_address: receiverInfo.receiver_address,
          note: receiverInfo.note,
          order_status_id: pendingStatus._id,
          payment_method,
          status: true,
        },
      ],
      { session },
    );

    /* =======================
       5️⃣ CREATE ORDER DETAILS
    ======================= */
    for (const detail of orderDetails) {
      await OrderDetailModel.create(
        [
          {
            ...detail,
            order_id: order._id,
          },
        ],
        { session },
      );
    }

    /* =======================
       6️⃣ TRỪ KHO THẬT
    ======================= */
    for (const item of cartItems) {
      const result = await ProductModel.updateOne(
        {
          _id: item.product_id,
          onHandQuantity: { $gte: item.quantity },
        },
        {
          $inc: { onHandQuantity: -item.quantity },
        },
        { session },
      );

      if (result.modifiedCount === 0) {
        throw new Error("Insufficient inventory to fulfill the order.");
      }
    }

    /* =======================
       7️⃣ XÓA CART ITEMS
    ======================= */
    await CartDetailModel.deleteMany(
      {
        cart_id: cart._id,
        product_id: { $in: selected_product_ids },
      },
      { session },
    );

    const remainingItemCount = await CartDetailModel.countDocuments(
      { cart_id: cart._id },
      { session },
    );

    cart.sum = remainingItemCount;
    await cart.save({ session });

    /* =======================
       8️⃣ XÓA STOCK LOCK
    ======================= */
    await StockLockModel.deleteMany(
      {
        user_id,
        product_id: { $in: selected_product_ids },
      },
      { session },
    );

    /* =======================
       9️⃣ PAYMENT
    ======================= */

    // COD → tạo payment unpaid
    if (payment_method === "COD") {
      await PaymentService.createCODPayment({
        order_id: order._id,
        amount: finalTotalPrice,
        session,
      });

      try {
        const user = await UserModel.findById(user_id)
          .select("email user_name")
          .lean();
        if (user && user.email) {
          await CustomerEmailService.sendOrderConfirmationEmail(
            user.email,
            user.user_name || "Client",
            order._id.toString(),
            finalTotalPrice,
            "COD",
          );
        }
      } catch (emailErr) {
        console.error("Failed to send COD order email:", emailErr);
      }

      // ✅ Khi tạo đơn không gửi notification (chỉ thông báo khi admin cập nhật trạng thái)

      await session.commitTransaction();

      // ✅ Tự động chốt lô (reset) sản phẩm bán hết sau khi trừ kho (COD)
      const ProductBatchService = require("./ProductBatchService");
      for (const item of cartItems) {
        try {
          const product = await ProductModel.findById(item.product_id)
            .select("onHandQuantity warehouseEntryDate warehouseEntryDateStr")
            .lean();
          if (product && product.onHandQuantity === 0 && (product.warehouseEntryDate || product.warehouseEntryDateStr)) {
            await ProductBatchService.autoResetSoldOutProduct(item.product_id.toString());
          }
        } catch (e) {
          console.error("Auto-reset sold out product failed:", item.product_id, e);
        }
      }

      return {
        success: true,
        type: "COD",
        redirect_url: "http://localhost:5173/customer/order-success",
        order_id: order._id,
      };
    }

    // VNPAY → tạo payment pending + url
    if (payment_method === "VNPAY") {
      await PaymentService.createOnlinePendingPayment({
        order_id: order._id,
        amount: finalTotalPrice,
        session,
      });

      const paymentUrl = await PaymentService.createVnpayPaymentUrl({
        order_id: order._id,
        user_id,
        ip,
        session,
      });

      // ✅ Khi tạo đơn không gửi notification (chỉ thông báo khi admin cập nhật trạng thái)

      await session.commitTransaction();
      return {
        success: true,
        payment_url: paymentUrl,
        order_id: order._id,
      };
    }

    throw new Error("Invalid payment method");
  } catch (err) {
    return { success: false, message: err.message };
  } finally {
    session.endSession();
  }
};

/* =====================================================
   UPDATE ORDER STATUS (ADMIN / SYSTEM)
===================================================== */
const updateOrder = async (order_id, new_status_name, userId, role, note) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const order = await OrderModel.findById(order_id).session(session);
    if (!order) throw new Error("Order not found");

    const newStatus = await findStatusByName(new_status_name, session);

    if (!newStatus) throw new Error("Invalid order status");

    const currentStatusName = await getOrderStatusName(
      order.order_status_id,
      session,
    );
    const nextStatusName = normalizeStatusName(newStatus.name);
    const paymentMethod = normalizeToken(order.payment_method);

    if (isReturnedStatus(nextStatusName)) {
      if (role !== "admin") {
        throw new Error(
          "Only admins can move an order to the return status",
        );
      }
      if (currentStatusName !== "COMPLETED") {
        throw new Error("Only COMPLETED orders can be moved to the return workflow");
      }
    } else if (
      !isValidStatusTransition(paymentMethod, currentStatusName, nextStatusName)
    ) {
      throw new Error("Invalid status transition for this order");
    }

    const fromStatus = order.order_status_id;

    /* =======================
       UPDATE ORDER STATUS
    ======================= */
    order.order_status_id = newStatus._id;
    await order.save({ session });

    await pushStatusHistory({
      order,
      fromStatus,
      toStatus: newStatus._id,
      userId,
      role,
      note,
      session,
    });

    /* =======================
       PAYMENT LOGIC
    ======================= */
    const payment = await PaymentModel.findOne({
      order_id: order._id,
      type: "PAYMENT",
    }).session(session);

    if (!payment) {
      throw new Error("Order payment not found");
    }

    /* ========= COD ========= */

    // COD giao thành công → thu tiền
    if (nextStatusName === "COMPLETED" && payment.method === "COD") {
      payment.status = "SUCCESS";
      await payment.save({ session });
    }

    // Admin huỷ COD
    if (nextStatusName === "CANCELLED" && payment.method === "COD") {
      payment.status = "FAILED";
      await payment.save({ session });
    }

    /* ========= VNPAY ========= */

    // Admin huỷ khi VNPAY CHƯA thanh toán
    if (
      nextStatusName === "CANCELLED" &&
      payment.method === "VNPAY" &&
      payment.status === "PENDING"
    ) {
      payment.status = "CANCELLED";
      await payment.save({ session });
    }

    // ✅ Admin huỷ khi VNPAY ĐÃ THANH TOÁN
    if (
      nextStatusName === "CANCELLED" &&
      payment.method === "VNPAY" &&
      payment.status === "SUCCESS"
    ) {
      // ❗ KHÔNG đổi payment PAYMENT
      // ❗ KHÔNG gọi VNPay ở đây

      // Tạo refund record
      await PaymentModel.create(
        [
          {
            order_id: order._id,
            type: "REFUND",
            method: "VNPAY",
            amount: payment.amount,
            status: "PENDING",
            note: "Admin cancelled the order – pending VNPay refund",
          },
        ],
        { session },
      );
    }

    // Online: chỉ cho chuyển PENDING -> PAID khi payment đã SUCCESS
    if (payment.method === "VNPAY" && nextStatusName === "PAID") {
      if (payment.status !== "SUCCESS") {
        throw new Error("Payment has not been recorded as successful");
      }
    }

    await session.commitTransaction();

    // ✅ Thông báo cho khách hàng khi admin cập nhật trạng thái đơn
    const customerId = order.user_id?.toString?.() || order.user_id;
    if (customerId) {
      try {
        const statusLabel = newStatus?.name || new_status_name || "cập nhật";
        await NotificationService.sendToUser(customerId, {
          title: "Cập nhật đơn hàng",
          body: `Đơn hàng của bạn đã được cập nhật trạng thái: ${statusLabel}`,
          data: {
            type: "order",
            orderId: order._id.toString(),
            action: "view_order",
            status: statusLabel,
          },
        });
      } catch (notifErr) {
        console.error("Failed to send order status notification to customer:", notifErr);
        // Không throw – trạng thái đơn đã cập nhật thành công
      }
    }

    return { success: true };
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
};

/* =====================================================
   CANCEL ORDER (CUSTOMER – PENDING ONLY)
===================================================== */
const cancelOrderByCustomer = async (order_id, user_id) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    /* =======================
       1️⃣ LOAD ORDER
    ======================= */
    const order = await OrderModel.findById(order_id).session(session);
    if (!order) throw new Error("Order not found");

    if (order.user_id.toString() !== user_id.toString())
      throw new Error("You do not have permission to cancel this order");

    const status = await OrderStatusModel.findById(
      order.order_status_id,
    ).session(session);

    if (status.name !== "PENDING")
      throw new Error("You can only cancel when the order is in PENDING status");

    /* =======================
       2️⃣ HOÀN KHO
    ======================= */
    const details = await OrderDetailModel.find({ order_id }).session(session);

    for (const item of details) {
      await ProductModel.updateOne(
        { _id: item.product_id },
        { $inc: { onHandQuantity: item.quantity } },
        { session },
      );
    }

    /* =======================
       3️⃣ PAYMENT LOGIC
    ======================= */
    const payment = await PaymentModel.findOne({
      order_id,
      type: "PAYMENT",
    }).session(session);

    if (!payment) throw new Error("Order payment not found");

    if (payment.method !== "COD") {
      throw new Error("Only COD orders can be cancelled");
    }

    payment.status = "FAILED";
    payment.note = "Order cancelled";
    await payment.save({ session });

    /* =======================
       4️⃣ UPDATE ORDER STATUS
    ======================= */
    const cancelled = await OrderStatusModel.findOne({
      name: "CANCELLED",
    }).session(session);

    try {
      await NotificationService.sendToUser(user_id, {
        title: "Order placed successfully - awaiting payment",
        body: `Order ${order._id.toString()} has been created. Please complete the payment.`,
        data: {
          type: "order",
          orderId: order._id.toString(),
          action: "pay_order",
          payment_url: paymentUrl,
        },
      });
    } catch (notifErr) {
      console.error("Failed to send order notification:", notifErr);
    }
    order.order_status_id = cancelled._id;
    await order.save({ session });

    await pushStatusHistory({
      order,
      fromStatus: status._id,
      toStatus: cancelled._id,
      userId: user_id,
      role: "customer",
      note: "Customer cancelled the order",
      session,
    });

    await session.commitTransaction();
    return { success: true };
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
};

const retryVnpayPayment = async ({ order_id, user_id, ip }) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    /* =======================
       1️⃣ LOAD ORDER
    ======================= */
    const order = await OrderModel.findById(order_id).session(session);
    if (!order) throw new Error("Order not found");

    if (order.user_id.toString() !== user_id.toString()) {
      throw new Error("You do not have permission to pay for this order");
    }

    /* =======================
       2️⃣ CHECK ORDER STATUS
    ======================= */
    const paidStatus = await OrderStatusModel.findOne({ name: "PAID" });
    if (order.order_status_id.equals(paidStatus._id)) {
      throw new Error("This order has already been paid");
    }

    const failedStatus = await OrderStatusModel.findOne({ name: "PENDING" });
    if (!order.order_status_id.equals(failedStatus._id)) {
      throw new Error("The order status is not eligible for payment retry");
    }
    const payment = await PaymentModel.findOne({
      order_id,
      method: "VNPAY",
      type: "PAYMENT",
    }).session(session);

    if (!payment) {
      throw new Error("Payment information not found");
    }

    // TIMEOUT → KHÔNG check retry_expired_at
    if (!["FAILED", "TIMEOUT"].includes(payment.status)) {
      throw new Error("The payment status is not eligible for retry");
    }

    if (payment.status === "TIMEOUT") {
      // ❌ BLOCK RETRY NẾU QUÁ SỐ LẦN
      if (order.retry_count >= 3) {
        throw new Error("The order has exceeded the allowed payment attempts");
      }
      order.retry_count += 1;
    }

    // FAILED → có retry window
    if (payment.status === "FAILED") {
      /* ===== CHECK RETRY PER PAYMENT STATUS ===== */
      if (!order.allow_retry) {
        throw new Error("This order does not allow payment retries");
      }
      if (!order.retry_expired_at || order.retry_expired_at < new Date()) {
        throw new Error("The payment retry window has expired");
      }
      order.allow_retry = false;
      order.auto_delete = false;
    }

    await order.save({ session });

    /* =======================
       4️⃣ RESET PAYMENT
    ======================= */
    payment.status = "PENDING";
    payment.provider_txn_id = null;
    payment.provider_response = null;
    await payment.save({ session });

    /* =======================
       5️⃣ CREATE NEW VNPAY URL
    ======================= */
    const paymentUrl = createVnpayUrl(order._id, payment.amount, ip);

    await session.commitTransaction();

    return {
      success: true,
      payment_url: paymentUrl,
    };
  } catch (err) {
    await session.abortTransaction();
    return {
      success: false,
      message: err.message,
    };
  } finally {
    session.endSession();
  }
};
/* =====================================================
   CUSTOMER ORDER HISTORY
===================================================== */
const parseStatusNames = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .map((item) => item.toString().trim().toUpperCase())
      .filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim().toUpperCase())
      .filter(Boolean);
  }
  return [];
};

const getOrdersByUser = async (user_id, filters = {}) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(user_id)) {
      return { status: "ERR", message: "Invalid user_id" };
    }

    const {
      page = 1,
      limit = 10,
      search = "",
      status_name,
      status_names,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = filters;

    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit) || 10));
    const skip = (pageNum - 1) * limitNum;

    const query = { user_id: new mongoose.Types.ObjectId(user_id) };

    // ✅ Search: khách hàng tìm theo ID đơn hàng — chấp nhận đủ 24 ký tự hex (khớp chính xác) hoặc một phần (ID kết thúc bằng chuỗi nhập)
    const searchValue = search?.toString().trim();
    if (searchValue && /^[a-fA-F0-9]+$/.test(searchValue)) {
      if (searchValue.length === 24 && mongoose.Types.ObjectId.isValid(searchValue)) {
        query._id = new mongoose.Types.ObjectId(searchValue);
      } else {
        // Một phần ID: tìm đơn có _id kết thúc bằng chuỗi nhập (vd. 6–8 ký tự cuối)
        query.$expr = { $regexMatch: { input: { $toString: "$_id" }, regex: `${searchValue}$` } };
      }
    }

    const normalizedStatusNames = parseStatusNames(status_names || status_name);
    if (normalizedStatusNames.length > 0) {
      const statusDocs = await OrderStatusModel.find({
        name: { $in: normalizedStatusNames },
      });
      if (statusDocs.length !== normalizedStatusNames.length) {
        return {
          status: "ERR",
          message: "One or more order statuses are invalid",
        };
      }
      query.order_status_id = { $in: statusDocs.map((doc) => doc._id) };
    }

    const allowedSortFields = ["createdAt", "updatedAt", "total_price"];
    const sortField = allowedSortFields.includes(sortBy) ? sortBy : "createdAt";
    const sortDirection = sortOrder === "asc" ? 1 : -1;
    const sortObj = { [sortField]: sortDirection };

    const [data, total] = await Promise.all([
      OrderModel.find(query)
        .populate("order_status_id", "name description")
        .sort(sortObj)
        .skip(skip)
        .limit(limitNum)
        .lean(),
      OrderModel.countDocuments(query),
    ]);

    return {
      status: "OK",
      message: "Retrieved order history successfully",
      data,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    };
  } catch (error) {
    return { status: "ERR", message: error.message };
  }
};

const getOrderByUser = async (order_id, user_id) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(order_id)) {
      return { status: "ERR", message: "Invalid order_id" };
    }
    if (!mongoose.Types.ObjectId.isValid(user_id)) {
      return { status: "ERR", message: "Invalid user_id" };
    }

    const order = await OrderModel.findOne({
      _id: new mongoose.Types.ObjectId(order_id),
      user_id: new mongoose.Types.ObjectId(user_id),
    })
      .populate("order_status_id", "name description")
      .populate("status_history.from_status", "name")
      .populate("status_history.to_status", "name")
      .populate("status_history.changed_by", "user_name email")
      .lean();

    if (!order) {
      return { status: "ERR", message: "Order does not exist" };
    }

    const [details, reviews] = await Promise.all([
      OrderDetailModel.find({ order_id: order._id }).lean(),
      ReviewModel.find({
        order_id: order._id,
        user_id: new mongoose.Types.ObjectId(user_id),
      }).lean(),
    ]);

    const reviewMap = new Map(
      reviews.map((review) => [review.product_id?.toString(), review]),
    );

    const detailsWithReview = details.map((detail) => ({
      ...detail,
      review: reviewMap.get(detail.product_id?.toString()) || null,
    }));

    return {
      status: "OK",
      message: "Retrieved order details successfully",
      data: {
        order,
        details: detailsWithReview,
        reviews,
      },
    };
  } catch (error) {
    return { status: "ERR", message: error.message };
  }
};

/* =====================================================
   ADMIN ORDER MANAGEMENT
===================================================== */
const getOrdersForAdmin = async (filters = {}) => {
  try {
    const {
      page = 1,
      limit = 5,
      search = "",
      status_names,
      payment_method,
      payment_status,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = filters;

    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit) || 20));
    const skip = (pageNum - 1) * limitNum;

    const query = {};

    if (search) {
      const escaped = search
        .toString()
        .trim()
        .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(escaped, "i");
      query.$or = [{ receiver_name: regex }, { receiver_phone: regex }];
    }

    const normalizedStatusNames = parseStatusNames(status_names);
    if (normalizedStatusNames.length > 0) {
      const statusDocs = await OrderStatusModel.find({
        name: {
          $in: normalizedStatusNames
            .map((name) => buildStatusRegex(name))
            .filter(Boolean),
        },
      });
      if (statusDocs.length !== normalizedStatusNames.length) {
        return {
          status: "ERR",
          message: "One or more order statuses are invalid",
        };
      }
      query.order_status_id = { $in: statusDocs.map((doc) => doc._id) };
    }

    if (payment_method) {
      query.payment_method = normalizeToken(payment_method);
    }

    const allowedSortFields = ["createdAt", "updatedAt", "total_price"];
    const sortField = allowedSortFields.includes(sortBy) ? sortBy : "createdAt";
    const sortDirection = sortOrder === "asc" ? 1 : -1;
    const sortObj = { [sortField]: sortDirection };

    const [orders, total] = await Promise.all([
      OrderModel.find(query)
        .populate("order_status_id", "name description")
        .sort(sortObj)
        .skip(skip)
        .limit(limitNum)
        .lean(),
      OrderModel.countDocuments(query),
    ]);

    const orderIds = orders.map((order) => order._id);
    const paymentQuery = {
      order_id: { $in: orderIds },
      type: "PAYMENT",
    };
    if (payment_status) {
      paymentQuery.status = normalizeToken(payment_status);
    }

    const payments = await PaymentModel.find(paymentQuery).lean();
    const paymentMap = new Map(
      payments.map((payment) => [payment.order_id.toString(), payment]),
    );

    const data = orders
      .map((order) => ({
        ...order,
        payment: paymentMap.get(order._id.toString()) || null,
      }))
      .filter((order) => {
        if (!payment_status) return true;
        return order.payment !== null;
      });

    return {
      status: "OK",
      message: "Fetched order list successfully",
      data,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    };
  } catch (error) {
    return { status: "ERR", message: error.message };
  }
};

const getOrderDetailForAdmin = async (order_id) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(order_id)) {
      return { status: "ERR", message: "Invalid order_id" };
    }

    const order = await OrderModel.findById(order_id)
      .populate("order_status_id", "name description")
      .populate("status_history.from_status", "name")
      .populate("status_history.to_status", "name")
      .populate("status_history.changed_by", "user_name email")
      .lean();

    if (!order) {
      return { status: "ERR", message: "Order does not exist" };
    }

    const [details, payment] = await Promise.all([
      OrderDetailModel.find({ order_id: order._id }).lean(),
      PaymentModel.findOne({ order_id: order._id, type: "PAYMENT" }).lean(),
    ]);

    return {
      status: "OK",
      message: "Retrieved order details successfully",
      data: {
        order,
        details,
        payment,
      },
    };
  } catch (error) {
    return { status: "ERR", message: error.message };
  }
};

const getOrderStatusCounts = async () => {
  try {
    const statuses = await OrderStatusModel.find().lean();

    const counts = await OrderModel.aggregate([
      {
        $group: {
          _id: "$order_status_id",
          total: { $sum: 1 },
        },
      },
    ]);

    const countMap = new Map(
      counts.map((item) => [item._id?.toString(), item.total]),
    );
    const data = statuses.map((status) => ({
      status_id: status._id,
      status_name: status.name,
      total: countMap.get(status._id.toString()) || 0,
    }));

    const totalOrders = data.reduce((sum, item) => sum + item.total, 0);

    return {
      status: "OK",
      message: "Fetched order status statistics successfully",
      data: {
        totalOrders,
        statusCounts: data,
      },
    };
  } catch (error) {
    return { status: "ERR", message: error.message };
  }
};

/**
 * Lấy danh sách log thay đổi trạng thái đơn hàng với search, sort, filter, pagination.
 * Dùng cho admin/sales-staff xem "nhân viên nào đã cập nhật đơn".
 *
 * @param {Object} filters - { order_id, changed_by, changed_by_role, from_status, to_status, changedAtFrom, changedAtTo, search, sortBy, sortOrder, page, limit }
 */
const getOrderStatusLogs = async (filters = {}) => {
  try {
    const {
      order_id,
      changed_by,
      changed_by_role,
      from_status,
      to_status,
      changedAtFrom,
      changedAtTo,
      search = "",
      sortBy = "changed_at",
      sortOrder = "desc",
      page = 1,
      limit = 20,
    } = filters;

    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit) || 20));
    const skip = (pageNum - 1) * limitNum;

    const query = {};

    // Filter: order_id (bắt buộc nếu cần xem log của 1 đơn)
    if (order_id) {
      if (!mongoose.Types.ObjectId.isValid(order_id)) {
        return { status: "ERR", message: "Invalid order_id" };
      }
      query.order_id = new mongoose.Types.ObjectId(order_id);
    }

    // Filter: nhân viên đã thay đổi
    if (changed_by && mongoose.Types.ObjectId.isValid(changed_by)) {
      query.changed_by = new mongoose.Types.ObjectId(changed_by);
    }

    // Filter: role (admin, sales-staff, customer)
    if (changed_by_role) {
      const role = String(changed_by_role).trim().toLowerCase();
      if (["admin", "sales-staff", "customer"].includes(role)) {
        query.changed_by_role = role;
      }
    }

    // Filter: từ trạng thái
    if (from_status && mongoose.Types.ObjectId.isValid(from_status)) {
      query.from_status = new mongoose.Types.ObjectId(from_status);
    }

    // Filter: sang trạng thái
    if (to_status && mongoose.Types.ObjectId.isValid(to_status)) {
      query.to_status = new mongoose.Types.ObjectId(to_status);
    }

    // Filter: khoảng thời gian thay đổi
    if (changedAtFrom || changedAtTo) {
      query.changed_at = {};
      if (changedAtFrom) {
        const from = new Date(changedAtFrom);
        if (!Number.isNaN(from.getTime())) {
          from.setHours(0, 0, 0, 0);
          query.changed_at.$gte = from;
        }
      }
      if (changedAtTo) {
        const to = new Date(changedAtTo);
        if (!Number.isNaN(to.getTime())) {
          to.setHours(23, 59, 59, 999);
          query.changed_at.$lte = to;
        }
      }
      if (Object.keys(query.changed_at).length === 0) delete query.changed_at;
    }

    // Search: theo nội dung note
    if (search && String(search).trim()) {
      const escaped = String(search).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      query.note = { $regex: escaped, $options: "i" };
    }

    // Sort
    const allowedSortFields = ["changed_at", "changed_by_role", "order_id", "createdAt"];
    const sortField = allowedSortFields.includes(sortBy) ? sortBy : "changed_at";
    const sortDirection = sortOrder === "asc" ? 1 : -1;
    const sortObj = { [sortField]: sortDirection };

    const [data, total] = await Promise.all([
      OrderStatusChangeLogModel.find(query)
        .populate("from_status", "name")
        .populate("to_status", "name")
        .populate("changed_by", "user_name email")
        .populate("order_id", "receiver_name receiver_phone total_price")
        .sort(sortObj)
        .skip(skip)
        .limit(limitNum)
        .lean(),
      OrderStatusChangeLogModel.countDocuments(query),
    ]);

    return {
      status: "OK",
      message: "Fetched order status change logs successfully",
      data,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    };
  } catch (error) {
    return { status: "ERR", message: error.message };
  }
};

module.exports = {
  confirmCheckoutAndCreateOrder,
  updateOrder,
  cancelOrderByCustomer,
  retryVnpayPayment,
  getOrdersByUser,
  getOrderByUser,
  getOrdersForAdmin,
  getOrderDetailForAdmin,
  getOrderStatusCounts,
  getOrderStatusLogs,
};
