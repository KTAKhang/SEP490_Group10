const mongoose = require("mongoose");

const orderSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      required: [true, "User is required"],
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
      required: [true, "Order total is required"],
      min: [0, "Order total cannot be negative"],
    },
    note: {
      type: String,
      trim: true,
      maxlength: [500, "Note must be at most 500 characters"],
    },
    receiver_address: {
      type: String,
      required: [true, "Receiver address is required"],
      trim: true,
      maxlength: [200, "Receiver address must be at most 200 characters"],
    },
    receiver_name: {
      type: String,
      required: [true, "Receiver name is required"],
      trim: true,
      maxlength: [100, "Receiver name must be at most 100 characters"],
    },
    receiver_phone: {
      type: String,
      required: [true, "Receiver phone is required"],
      match: [
        /^0\d{9}$/,
        "Invalid phone (must start with 0 and be 10 digits)",
      ],
    },
    order_status_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "order_statuses",
      required: [true, "Order status is required"],
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

    /** Applied discount code (shown on the order) */
    discount_code: {
      type: String,
      default: null,
      trim: true,
    },
    /** Discount amount (VND) */
    discount_amount: {
      type: Number,
      default: 0,
      min: 0,
    },

    /* =========================
       🔁 RETRY + AUTO DELETE
    ========================= */
    allow_retry: {
      type: Boolean,
      default: false,
    },

    retry_expired_at: {
      type: Date,
      default: null,
    },

    auto_delete: {
      type: Boolean,
      default: false,
    },
    is_mobile: {
      type: Boolean,
      default: false,
    },
    status: {
      type: Boolean,
      required: [true, "Status is required"],
      default: true,
    },
  },
  {
    timestamps: true,
  },
);

const OrderModel = mongoose.model("orders", orderSchema);
module.exports = OrderModel;
