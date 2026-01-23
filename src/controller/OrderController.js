const OrderService = require("../services/OrderService");

/* =====================================================
   CREATE ORDER (PENDING)
===================================================== */
const createOrder = async (req, res) => {
  try {
    const user_id = req.user._id;
    const { selected_product_ids, receiverInfo, payment_method } = req.body;

    if (
      !Array.isArray(selected_product_ids) ||
      selected_product_ids.length === 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Vui lòng chọn ít nhất một sản phẩm",
      });
    }

    if (
      !receiverInfo ||
      !receiverInfo.receiver_name ||
      !receiverInfo.receiver_phone ||
      !receiverInfo.receiver_address
    ) {
      return res.status(400).json({
        success: false,
        message: "Thiếu thông tin người nhận",
      });
    }

    if (!/^0\d{9}$/.test(receiverInfo.receiver_phone)) {
      return res.status(400).json({
        success: false,
        message: "Số điện thoại không hợp lệ",
      });
    }

    if (!["COD", "VNPAY"].includes(payment_method)) {
      return res.status(400).json({
        success: false,
        message: "Phương thức thanh toán không hợp lệ",
      });
    }

    const normalizedReceiver = {
      receiver_name: receiverInfo.receiver_name.trim(),
      receiver_phone: receiverInfo.receiver_phone.trim(),
      receiver_address: receiverInfo.receiver_address.trim(),
      note: receiverInfo.note?.trim(),
    };

    const result = await OrderService.confirmCheckoutAndCreateOrder({
      user_id,
      selected_product_ids,
      receiverInfo: normalizedReceiver,
      payment_method,
      ip: req.ip,
    });

    if (!result.success) {
      return res.status(400).json(result);
    }

    return res.status(201).json(result);
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Tạo đơn hàng thất bại",
    });
  }
};

/* =====================================================
   UPDATE ORDER STATUS (ADMIN / STAFF)
===================================================== */
const updateOrder = async (req, res) => {
  try {
    const order_id = req.params.id;
    const { status_name, note } = req.body;

    if (!order_id || !status_name) {
      return res.status(400).json({
        success: false,
        message: "Thiếu order_id hoặc status_name",
      });
    }

    const result = await OrderService.updateOrder(
      order_id,
      status_name,
      req.user._id,
      req.user.role,
      note || "",
    );

    return res.status(200).json({
      success: true,
      message: "Cập nhật trạng thái đơn hàng thành công",
      ...result,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message || "Cập nhật đơn hàng thất bại",
    });
  }
};

/* =====================================================
   CANCEL ORDER (CUSTOMER – PENDING ONLY)
===================================================== */
const cancelOrder = async (req, res) => {
  try {
    const order_id = req.params.id;
    const user_id = req.user._id;

    if (req.user.role !== "customer") {
      return res.status(403).json({
        success: false,
        message: "Chỉ customer mới được hủy đơn",
      });
    }

    const result = await OrderService.cancelOrderByCustomer(order_id, user_id);

    return res.status(200).json({
      success: true,
      message: "Hủy đơn hàng thành công",
      ...result,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message || "Hủy đơn hàng thất bại",
    });
  }
};

const retryVnpayPayment = async (req, res) => {
  try {
    const user_id = req.user._id;
    const {order_id} = req.body;

    if (!order_id) {
      return res.status(400).json({
        success: false,
        message: "Thiếu order_id",
      });
    }
    const result = await OrderService.retryVnpayPayment({
      user_id,
      order_id,
      ip: req.ip,
    });

    if (!result.success) {
      return res.status(400).json(result);
    }

    return res.status(201).json(result);
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Retry Order Fail",
    });
  }
};

module.exports = {
  createOrder,
  updateOrder,
  cancelOrder,
  retryVnpayPayment,
};
