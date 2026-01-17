const mongoose = require("mongoose");

const discountUsageSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true
        },

        discountId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Discount",
            required: true
        },

        // this is snapshot fields to record discount details at the time of usage
        discountCode: {
            type: String,
            required: true
        },

        discountPercent: {
            type: Number,
            required: true
        },

        discountAmount: {
            type: Number,
            required: true,
            min: 0
        },

        usedAt: {
            type: Date,
            default: Date.now
        }
    },
    {
        timestamps: true
    }
);

//each user can use a discount only once
discountUsageSchema.index(
    { userId: 1, discountId: 1 },
    { unique: true }
);

module.exports = mongoose.model("DiscountUsage", discountUsageSchema);
