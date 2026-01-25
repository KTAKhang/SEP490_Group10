const OrderModel = require("../models/OrderModel");
const OrderDetailModel = require("../models/OrderDetailModel");
const OrderStatusModel = require("../models/OrderStatusModel");
const CartModel = require("../models/CartsModel");
const CartDetailModel = require("../models/CartDetailsModel");
const PaymentModel = require("../models/PaymentModel");
const { createVnpayPaymentUrl } = require("../controller/PaymentController");
const ProductModel = require("../models/ProductModel");
const StockLockModel = require("../models/StockLockModel");
const PaymentService = require("../services/PaymentService");

const { default: mongoose } = require("mongoose");

const normalizeStatusName = (value) => {
  if (!value) return "";
  return value
    .toString()
    .trim()
    .toUpperCase()
    .replace(/[_\s]+/g, "-");
};

const normalizeToken = (value) => (value ? value.toString().trim().toUpperCase() : "");

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
  return OrderStatusModel.findOne({ name: { $regex: regex } }).session(session || null);
};

const getOrderStatusName = async (statusId, session) => {
  if (!statusId) return "";
  const statusDoc = await OrderStatusModel.findById(statusId).session(session || null);
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
  order.status_history.push({
    from_status: fromStatus,
    to_status: toStatus,
    changed_by: userId,
    changed_by_role: role,
    note,
  });

  await order.save({ session });
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
}) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    /* =======================
       1️⃣ LOAD CART
    ======================= */
    const cart = await CartModel.findOne({ user_id }).session(session);
    if (!cart) throw new Error("Không tìm thấy giỏ hàng");

    const cartItems = await CartDetailModel.find({
      cart_id: cart._id,
      product_id: { $in: selected_product_ids },
    }).session(session);

    if (!cartItems.length) throw new Error("Không có sản phẩm được chọn");

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
        throw new Error("Hết thời gian giữ hàng");

      const product = await ProductModel.findById(item.product_id)
        .populate("category", "name")
        .session(session);

      if (!product || !product.status)
        throw new Error("Sản phẩm không khả dụng");

      totalPrice += item.quantity * item.price;

      orderDetails.push({
        product_id: product._id,
        quantity: item.quantity,
        price: item.price,

        // snapshot
        product_name: product.name,
        product_image: product.images?.[0],
        product_category_name: product.category?.name,
        product_brand: product.brand,
        expiry_date: product.expiryDate,
      });
    }

    /* =======================
       4️⃣ CREATE ORDER
    ======================= */
    const pendingStatus = await OrderStatusModel.findOne({
      name: "PENDING",
    }).session(session);

    if (!pendingStatus) throw new Error("Thiếu trạng thái đơn hàng");

    const [order] = await OrderModel.create(
      [
        {
          user_id,
          total_price: totalPrice,
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
        throw new Error("Không đủ tồn kho để hoàn tất đơn hàng");
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
        amount: totalPrice,
        session,
      });

      await session.commitTransaction();
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
        amount: totalPrice,
        session,
      });

      const paymentUrl = await PaymentService.createVnpayPaymentUrl({
        order_id: order._id,
        user_id,
        ip,
        session,
      });

      await session.commitTransaction();
      return {
        success: true,
        payment_url: paymentUrl,
      };
    }

    throw new Error("Phương thức thanh toán không hợp lệ");
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
    if (!order) throw new Error("Không tìm thấy đơn hàng");

    const newStatus = await findStatusByName(new_status_name, session);

    if (!newStatus) throw new Error("Trạng thái không hợp lệ");

    const currentStatusName = await getOrderStatusName(order.order_status_id, session);
    const nextStatusName = normalizeStatusName(newStatus.name);
    const paymentMethod = normalizeToken(order.payment_method);

    if (!isValidStatusTransition(paymentMethod, currentStatusName, nextStatusName)) {
      throw new Error("Không hợp lệ theo luồng trạng thái đơn hàng");
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
      throw new Error("Không tìm thấy payment của đơn hàng");
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
            note: "Admin huỷ đơn – chờ hoàn tiền VNPay",
          },
        ],
        { session },
      );
    }

    // Online: chỉ cho chuyển PENDING -> PAID khi payment đã SUCCESS
    if (payment.method === "VNPAY" && nextStatusName === "PAID") {
      if (payment.status !== "SUCCESS") {
        throw new Error("Chưa ghi nhận thanh toán thành công");
      }
    }

    await session.commitTransaction();
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
    if (!order) throw new Error("Không tìm thấy đơn");

    if (order.user_id.toString() !== user_id.toString())
      throw new Error("Không có quyền huỷ");

    const status = await OrderStatusModel.findById(
      order.order_status_id,
    ).session(session);

    if (!["PENDING", "PAID"].includes(status.name))
      throw new Error("Chỉ được huỷ khi PENDING hoặc PAID");

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

    if (!payment) throw new Error("Không tìm thấy payment của đơn hàng");

    /* ===== COD ===== */
    if (payment.method === "COD") {
      payment.status = "FAILED";
      payment.note = "Đơn bị huỷ";
      await payment.save({ session });
    }

    /* ===== VNPAY ===== */

    // 🔹 VNPAY chưa thanh toán
    if (payment.method === "VNPAY" && payment.status === "PENDING") {
      payment.status = "CANCELLED";
      payment.note = "Khách huỷ trước khi thanh toán";
      await payment.save({ session });
    }

    // 🔹 VNPAY đã thanh toán → tạo REFUND
    if (payment.method === "VNPAY" && payment.status === "SUCCESS") {
      // ✅ CHỐNG TẠO REFUND TRÙNG
      const existedRefund = await PaymentModel.findOne({
        order_id,
        type: "REFUND",
      }).session(session);

      if (!existedRefund) {
        await PaymentModel.create(
          [
            {
              order_id,
              type: "REFUND",
              method: "VNPAY",
              amount: payment.amount,
              status: "PENDING",
              note: "Khách huỷ đơn – chờ hoàn tiền VNPay",

              // ✅ COPY ĐẦY ĐỦ TỪ PAYMENT
              provider_txn_id: payment.provider_response.vnp_TransactionNo,

              provider_response: {
                vnp_TxnRef: payment.provider_response.vnp_TxnRef, // 🔥 BẮT BUỘC
                vnp_TransactionNo: payment.provider_response.vnp_TransactionNo,
                vnp_PayDate: payment.provider_response.vnp_PayDate,
              },
            },
          ],
          { session },
        );
      }
    }

    /* =======================
       4️⃣ UPDATE ORDER STATUS
    ======================= */
    const cancelled = await OrderStatusModel.findOne({
      name: "CANCELLED",
    }).session(session);

    order.order_status_id = cancelled._id;
    await order.save({ session });

    await pushStatusHistory({
      order,
      fromStatus: status._id,
      toStatus: cancelled._id,
      userId: user_id,
      role: "customer",
      note: "Khách huỷ đơn",
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

/* =====================================================
   CUSTOMER ORDER HISTORY
===================================================== */
const parseStatusNames = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map((item) => item.toString().trim().toUpperCase()).filter(Boolean);
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
      return { status: "ERR", message: "user_id không hợp lệ" };
    }

    const {
      page = 1,
      limit = 10,
      status_name,
      status_names,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = filters;

    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit) || 10));
    const skip = (pageNum - 1) * limitNum;

    const query = { user_id: new mongoose.Types.ObjectId(user_id) };

    const normalizedStatusNames = parseStatusNames(status_names || status_name);
    if (normalizedStatusNames.length > 0) {
      const statusDocs = await OrderStatusModel.find({
        name: { $in: normalizedStatusNames },
      });
      if (statusDocs.length !== normalizedStatusNames.length) {
        return { status: "ERR", message: "Một hoặc nhiều trạng thái đơn hàng không hợp lệ" };
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
      message: "Lấy lịch sử mua hàng thành công",
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
      return { status: "ERR", message: "order_id không hợp lệ" };
    }
    if (!mongoose.Types.ObjectId.isValid(user_id)) {
      return { status: "ERR", message: "user_id không hợp lệ" };
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
      return { status: "ERR", message: "Đơn hàng không tồn tại" };
    }

    const details = await OrderDetailModel.find({ order_id: order._id }).lean();

    return {
      status: "OK",
      message: "Lấy chi tiết đơn hàng thành công",
      data: {
        order,
        details,
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
      const escaped = search.toString().trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(escaped, "i");
      query.$or = [
        { receiver_name: regex },
        { receiver_phone: regex },
      ];
    }

    const normalizedStatusNames = parseStatusNames(status_names);
    if (normalizedStatusNames.length > 0) {
      const statusDocs = await OrderStatusModel.find({
        name: { $in: normalizedStatusNames.map((name) => buildStatusRegex(name)).filter(Boolean) },
      });
      if (statusDocs.length !== normalizedStatusNames.length) {
        return { status: "ERR", message: "Một hoặc nhiều trạng thái đơn hàng không hợp lệ" };
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
    const paymentMap = new Map(payments.map((payment) => [payment.order_id.toString(), payment]));

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
      message: "Lấy danh sách đơn hàng thành công",
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
      return { status: "ERR", message: "order_id không hợp lệ" };
    }

    const order = await OrderModel.findById(order_id)
      .populate("order_status_id", "name description")
      .populate("status_history.from_status", "name")
      .populate("status_history.to_status", "name")
      .populate("status_history.changed_by", "user_name email")
      .lean();

    if (!order) {
      return { status: "ERR", message: "Đơn hàng không tồn tại" };
    }

    const [details, payment] = await Promise.all([
      OrderDetailModel.find({ order_id: order._id }).lean(),
      PaymentModel.findOne({ order_id: order._id, type: "PAYMENT" }).lean(),
    ]);

    return {
      status: "OK",
      message: "Lấy chi tiết đơn hàng thành công",
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

    const countMap = new Map(counts.map((item) => [item._id?.toString(), item.total]));
    const data = statuses.map((status) => ({
      status_id: status._id,
      status_name: status.name,
      total: countMap.get(status._id.toString()) || 0,
    }));

    const totalOrders = data.reduce((sum, item) => sum + item.total, 0);

    return {
      status: "OK",
      message: "Lấy thống kê trạng thái đơn hàng thành công",
      data: {
        totalOrders,
        statusCounts: data,
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
  getOrdersByUser,
  getOrderByUser,
  getOrdersForAdmin,
  getOrderDetailForAdmin,
  getOrderStatusCounts,
};
