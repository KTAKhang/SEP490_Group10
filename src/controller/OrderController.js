const OrderService = require("../services/OrderService");
const OrderModel = require("../models/OrderModel");

/* =====================================================
   CREATE ORDER (PENDING)
===================================================== */
const createOrder = async (req, res) => {
  try {
    const user_id = req.user._id;
    const { selected_product_ids, receiverInfo, payment_method, city, discount_id, isMobile } = req.body;


    if (
      !Array.isArray(selected_product_ids) ||
      selected_product_ids.length === 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Please select at least one product",
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
        message: "Recipient information is missing",
      });
    }
    if (
      !city
    ) {
      return res.status(400).json({
        success: false,
        message: "Missing provinces/cities",
      });
    }


    if (!/^0\d{9}$/.test(receiverInfo.receiver_phone)) {
      return res.status(400).json({
        success: false,
        message: "Invalid phone number",
      });
    }


    if (!["COD", "VNPAY"].includes(payment_method)) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment method",
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
      city,
      discount_id: discount_id || null,
      isMobile
    });


    if (!result.success) {
      return res.status(400).json(result);
    }


    return res.status(201).json(result);
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Order creation failed",
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
        message: "Missing order_id or status_name",
      });
    }
    // Order schema enum: "admin" | "sales-staff" | "customer". User có role_id (populate → name).
    const roleName = req.user.role_id?.name?.toLowerCase?.() || "admin";
    const roleForHistory = ["admin", "sales-staff", "customer"].includes(roleName) ? roleName : "admin";
    const result = await OrderService.updateOrder(
      order_id,
      status_name,
      req.user._id,
      roleForHistory,
      note || "",
    );


    return res.status(200).json({
      success: true,
      message: "Order status updated successfully",
      ...result,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message || "Failed to update order",
    });
  }
};


/* =====================================================
   CONFIRM REFUND PAYMENT (ADMIN / WAREHOUSE STAFF)
   Cập nhật payment từ PENDING → SUCCESS khi đã hoàn tiền thủ công.
===================================================== */
const confirmRefundPayment = async (req, res) => {
  try {
    const order_id = req.params.id;
    if (!order_id) {
      return res.status(400).json({ success: false, message: "Missing order id" });
    }
    const result = await OrderService.confirmRefundPayment(order_id);
    return res.status(200).json(result);
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message || "Failed to confirm refund payment",
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


    if (req.user.role_id.name !== "customer") {
      return res.status(403).json({
        success: false,
        message: "Only customers can cancel orders.",
      });
    }


    const result = await OrderService.cancelOrderByCustomer(order_id, user_id);


    return res.status(200).json({
      success: true,
      message: "Order cancelled successfully.",
      ...result,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message || "Order cancellation failed.",
    });
  }
};

const retryVnpayPayment = async (req, res) => {
  try {
    const user_id = req.user._id;
    const { order_id,isMobile } = req.body;
    if (!order_id) {
      return res.status(400).json({
        success: false,
        message: "Missing order_id",
      });
    }
    const result = await OrderService.retryVnpayPayment({
      user_id,
      order_id,
      ip: req.ip,
      isMobile
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
/* =====================================================
   CUSTOMER ORDER HISTORY
===================================================== */
const getMyOrders = async (req, res) => {
  try {
    const user_id = req.user._id;
    const response = await OrderService.getOrdersByUser(user_id, req.query);
    if (response.status === "ERR") return res.status(400).json(response);
    return res.status(200).json(response);
  } catch (error) {
    return res.status(500).json({
      status: "ERR",
      message: error.message || "Lấy lịch sử mua hàng thất bại",
    });
  }
};
const getMyOrderById = async (req, res) => {
  try {
    const user_id = req.user._id;
    const response = await OrderService.getOrderByUser(req.params.id, user_id);
    if (response.status === "ERR") return res.status(404).json(response);
    return res.status(200).json(response);
  } catch (error) {
    return res.status(500).json({
      status: "ERR",
      message: error.message || "Lấy chi tiết đơn hàng thất bại",
    });
  }
};
/* =====================================================
   ADMIN ORDER MANAGEMENT
===================================================== */
const getOrdersAdmin = async (req, res) => {
  try {
    const response = await OrderService.getOrdersForAdmin(req.query);
    if (response.status === "ERR") return res.status(400).json(response);
    return res.status(200).json(response);
  } catch (error) {
    return res.status(500).json({
      status: "ERR",
      message: error.message || "Lấy danh sách đơn hàng thất bại",
    });
  }
};


const getOrderDetailAdmin = async (req, res) => {
  try {
    const response = await OrderService.getOrderDetailForAdmin(req.params.id);
    if (response.status === "ERR") return res.status(404).json(response);
    return res.status(200).json(response);
  } catch (error) {
    return res.status(500).json({
      status: "ERR",
      message: error.message || "Lấy chi tiết đơn hàng thất bại",
    });
  }
};


const getOrderStatusStatsAdmin = async (req, res) => {
  try {
    const response = await OrderService.getOrderStatusCounts();
    if (response.status === "ERR") return res.status(400).json(response);
    return res.status(200).json(response);
  } catch (error) {
    return res.status(500).json({
      status: "ERR",
      message: error.message || "Lấy thống kê đơn hàng thất bại",
    });
  }
};
const getOrderStatusLogs = async (req, res) => {
  try {
    const filters = { ...req.query };
    if (req.params.id) {
      filters.order_id = req.params.id;
    }
    const response = await OrderService.getOrderStatusLogs(filters);
    if (response.status === "ERR") return res.status(400).json(response);
    return res.status(200).json(response);
  } catch (error) {
    return res.status(500).json({
      status: "ERR",
      message: error.message || "Lấy log thay đổi trạng thái thất bại",
    });
  }
};
module.exports = {
  createOrder,
  updateOrder,
  confirmRefundPayment,
  cancelOrder,
  retryVnpayPayment,
  getMyOrders,
  getMyOrderById,
  getOrdersAdmin,
  getOrderDetailAdmin,
  getOrderStatusStatsAdmin,
  getOrderStatusLogs,
};
