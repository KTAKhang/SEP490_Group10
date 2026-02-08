const mongoose = require("mongoose");
/**
 * Log mỗi lần cập nhật trạng thái đơn hàng (giống InventoryTransaction có createdBy).
 * Dùng để truy vấn "nhân viên nào đã cập nhật đơn", "đơn X đã đổi trạng thái những lần nào".
 */
const orderStatusChangeLogSchema = new mongoose.Schema(
  {
    order_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "orders",
      required: true,
      index: true,
    },
    from_status: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "order_statuses",
    },
    to_status: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "order_statuses",
      required: true,
    },
    /** Nhân viên/admin đã thao tác (tương tự createdBy trong InventoryTransaction) */
    changed_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      required: true,
      index: true,
    },
    changed_by_role: {
      type: String,
      enum: ["admin", "sales-staff", "customer"],
      required: true,
    },
    note: {
      type: String,
      trim: true,
      maxlength: 500,
      default: "",
    },
    changed_at: {
      type: Date,
      default: Date.now,
      required: true,
    },
  },
  { timestamps: true }
);

const OrderStatusChangeLogModel = mongoose.model("order_status_change_logs", orderStatusChangeLogSchema);
module.exports = OrderStatusChangeLogModel;
