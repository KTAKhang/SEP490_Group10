const mongoose = require("mongoose");

const orderSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      required: [true, "Người dùng là bắt buộc"],
    },
    status_history: [
      {
        from_status: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "order_statuses",
        },
        to_status: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "order_statuses",
          required: true,
        },
        changed_by: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "users",
        },
        changed_by_role: {
          type: String,
          enum: ["admin", "sales-staff", "customer"],
          required: true,
        },
        note: {
          type: String,
          trim: true,
          maxlength: 200,
        },
        changed_at: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    total_price: {
      type: Number,
      required: [true, "Tổng giá trị đơn hàng là bắt buộc"],
      min: [0, "Tổng giá trị đơn hàng không được âm"],
    },
    note: {
      type: String,
      trim: true,
      maxlength: [500, "Ghi chú không được vượt quá 500 ký tự"],
    },
    receiver_address: {
      type: String,
      required: [true, "Địa chỉ người nhận là bắt buộc"],
      trim: true,
      maxlength: [200, "Địa chỉ người nhận không được vượt quá 200 ký tự"],
    },
    receiver_name: {
      type: String,
      required: [true, "Tên người nhận là bắt buộc"],
      trim: true,
      maxlength: [100, "Tên người nhận không được vượt quá 100 ký tự"],
    },
    receiver_phone: {
      type: String,
      required: [true, "Số điện thoại người nhận là bắt buộc"],
      match: [
        /^0\d{9}$/,
        "Số điện thoại không hợp lệ (phải bắt đầu bằng 0 và đủ 10 số)",
      ],
    },
    order_status_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "order_statuses",
      required: [true, "Trạng thái đơn hàng là bắt buộc"],
    },
    is_preorder: {
      type: Boolean,
      default: false,
    },
    expected_ship_date: {
      type: Date, 
    },
    payment_method: {
      type: String,
      enum: ["COD", "VNPAY"],
      required: true,
    },
    status: {
      type: Boolean,
      required: [true, "Trạng thái là bắt buộc"],
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

const OrderModel = mongoose.model("orders", orderSchema);
module.exports = OrderModel;
