const mongoose = require("mongoose");

const tempOTPSchema = new mongoose.Schema({
  email: {
    type: String,
    required: [true, "Email is required"],
    unique: true,
    trim: true,
    lowercase: true,
    match: [/\S+@\S+\.\S+/, "Invalid email format"],
  },
  otp: {
    type: String,
    required: [true, "OTP code is required"],
    match: [/^\d{6}$/, "OTP must be exactly 6 digits"],
  },
  expiresAt: {
    type: Date,
    required: [true, "Expiration date is required"],
  },
  user_name: {
    type: String,
    required: [true, "Username is required"],
    trim: true,
    minlength: [3, "Username must be at least 3 characters"],
    maxlength: [50, "Username must be at most 50 characters"],
  },
  password: {
    type: String,
    required: [true, "Password is required"],
  },
  fullName: {
    type: String,
    required: [true, "Full name is required"],
    trim: true,
    minlength: [3, "Full name must be at least 3 characters"],
    maxlength: [50, "Full name must be at most 50 characters"],
  },
  phone: {
    type: String,
    required: [true, "Phone number is required"],
    trim: true,
    match: [/^\d{9,11}$/, "Phone must be 9–11 digits"],
  },
  address: {
    type: String,
    required: [true, "Address is required"],
    trim: true,
    minlength: [5, "Address must be at least 5 characters"],
  },
  birthday: {
    type: Date,
    required: [true, "Date of birth is required"],
  },
  gender: {
    type: String,
    enum: ["male", "female", "other"],
    required: [true, "Gender is required"],
  },
});

const TempOTPModel = mongoose.model("temp_otps", tempOTPSchema);
module.exports = TempOTPModel;
