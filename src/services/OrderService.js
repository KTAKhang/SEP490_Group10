const OrderModel = require("../models/OrderModel");
const OrderDetailModel = require("../models/OrderDetailModel");
const OrderStatusModel = require("../models/OrderStatusModel");
const CartModel = require("../models/CartsModel");
const CartDetailModel = require("../models/CartDetailsModel");
const PaymentModel = require("../models/PaymentModel");
const ProductModel = require("../models/ProductModel");
const StockLockModel = require("../models/StockLockModel");
const PaymentService = require("../services/PaymentService");

const { default: mongoose } = require("mongoose");

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
const confirmCheckoutAndCreateOrder = async (
  user_id,
  selected_product_ids,
  receiverInfo,
  payment_method, // 👈 THÊM
) => {
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

    if (!cartItems.length) throw new Error("Giỏ hàng trống");

    /* =======================
       2️⃣ LOAD STOCK LOCK
    ======================= */
    const locks = await StockLockModel.find({
      user_id,
      product_id: { $in: selected_product_ids },
    }).session(session);

    const lockMap = new Map(locks.map((l) => [l.product_id.toString(), l]));

    /* =======================
       3️⃣ SNAPSHOT + TRỪ KHO
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

      const updated = await ProductModel.updateOne(
        {
          _id: product._id,
          onHandQuantity: { $gte: item.quantity },
        },
        { $inc: { onHandQuantity: -item.quantity } },
        { session },
      );

      if (!updated.modifiedCount)
        throw new Error(`Không đủ hàng cho ${product.name}`);

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
       4️⃣ CREATE ORDER (PENDING)
    ======================= */
    const pendingStatus = await OrderStatusModel.findOne({
      name: "PENDING",
    }).session(session);

    if (!pendingStatus) throw new Error("Thiếu status PENDING");

    const [order] = await OrderModel.create(
      [
        {
          user_id,
          total_price: totalPrice,
          receiver_name: receiverInfo.receiver_name,
          receiver_phone: receiverInfo.receiver_phone,
          receiver_address: receiverInfo.receiver_address,
          note: receiverInfo.note,
          payment_method, // 👈 LƯU
          order_status_id: pendingStatus._id,
        },
      ],
      { session },
    );

    await pushStatusHistory({
      order,
      fromStatus: null,
      toStatus: pendingStatus._id,
      userId: user_id,
      role: "customer",
      note: "Khách hàng tạo đơn (PENDING)",
      session,
    });

    /* =======================
       5️⃣ CREATE ORDER DETAILS
    ======================= */
    orderDetails.forEach((d) => (d.order_id = order._id));
    await OrderDetailModel.insertMany(orderDetails, { session });

    /* =======================
       6️⃣ CREATE PAYMENT
    ======================= */
    if (payment_method === "COD") {
      await PaymentService.createCODPayment({
        order_id: order._id,
        amount: totalPrice,
        session,
      });
    }

    if (payment_method === "VNPAY") {
      await PaymentService.createOnlinePendingPayment({
        order_id: order._id,
        amount: totalPrice,
        session,
      });
    }

    /* =======================
       7️⃣ CLEANUP
    ======================= */
    await CartDetailModel.deleteMany(
      { cart_id: cart._id, product_id: { $in: selected_product_ids } },
      { session },
    );

    await StockLockModel.deleteMany(
      { user_id, product_id: { $in: selected_product_ids } },
      { session },
    );

    await session.commitTransaction();

    return {
      success: true,
      order_id: order._id,
      payment_method,
    };
  } catch (err) {
    await session.abortTransaction();
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

    const newStatus = await OrderStatusModel.findOne({
      name: new_status_name,
    }).session(session);

    if (!newStatus) throw new Error("Trạng thái không hợp lệ");

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
    if (new_status_name === "COMPLETED" && payment.method === "COD") {
      payment.status = "SUCCESS";
      await payment.save({ session });
    }

    // Admin huỷ COD
    if (new_status_name === "CANCELLED" && payment.method === "COD") {
      payment.status = "FAILED";
      await payment.save({ session });
    }

    /* ========= VNPAY ========= */

    // Admin huỷ khi VNPAY CHƯA thanh toán
    if (
      new_status_name === "CANCELLED" &&
      payment.method === "VNPAY" &&
      payment.status === "PENDING"
    ) {
      payment.status = "CANCELLED";
      await payment.save({ session });
    }

    // ✅ Admin huỷ khi VNPAY ĐÃ THANH TOÁN
    if (
      new_status_name === "CANCELLED" &&
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

module.exports = {
  confirmCheckoutAndCreateOrder,
  updateOrder,
  cancelOrderByCustomer,
};
