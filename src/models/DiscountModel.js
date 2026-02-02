const mongoose = require("mongoose");

const discountSchema = new mongoose.Schema(
    {
        code: {
            type: String,
            required: true,
            unique: true,
            uppercase: true,
            trim: true
        },

        discountPercent: {
            type: Number,
            required: true,
            min: 1,
            max: 100
        },

        minOrderValue: {
            type: Number,
            default: 0,
            min: 0
        },

        maxDiscountAmount: {
            type: Number,
            default: null,
            min: 0
        },

        startDate: {
            type: Date,
            required: true
        },

        endDate: {
            type: Date,
            required: true
        },

        usageLimit: {
            type: Number,
            default: null,
            min: 1
        },

        usedCount: {
            type: Number,
            default: 0,
            min: 0
        },

        status: {
            type: String,
            enum: ["PENDING", "APPROVED", "REJECTED", "EXPIRED"],
            default: "PENDING"
        },

        isActive: {
            type: Boolean,
            default: false
        },

        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "users",
            required: true
        },

        approvedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "users",
            default: null
        },

        approvedAt: {
            type: Date,
            default: null
        },

       
        rejectedReason: {
            type: String,
            default: ""
        },

        description: {
            type: String,
            trim: true,
            maxlength: [500, "Description cannot exceed 500 characters"],
            default: ""
        }
    },
    {
        timestamps: true
    }
);


// discountSchema.index({ code: 1 });

discountSchema.index({ status: 1, isActive: 1 });
discountSchema.index({ startDate: 1, endDate: 1 });

const DiscountModel = mongoose.model("discounts", discountSchema);
module.exports = DiscountModel;
