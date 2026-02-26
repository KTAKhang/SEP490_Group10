const ProfileService = require("../services/ProfileService");
const UserModel = require("../models/UserModel");

const checkRole = async (userID) => {
  try {
    const user = await UserModel.findById(userID).populate(
      "role_id",
      "name -_id",
    );

    if (!user || !user.role_id || !user.role_id.name) {
      return { status: "ERR", message: "User or role not found" };
    }

    return {
      status: "OK",
      role: user.role_id.name,
      id: user._id,
    };
  } catch (error) {
    return {
      status: "ERR",
      message: "Error checking user role",
      detail: error.message,
    };
  }
};

const updateProfile = async (req, res) => {
  try {
    const id = req.user._id;
    const { user_name, phone, address, birthday, gender } = req.body;
    const file = req.file;
console.log("REQ.FILE:", req.file);
    // Validate user_name
    const isStrictUserName = (name) => /^[\p{L}\p{N}_ ]{3,30}$/u.test(name);
    if (!isStrictUserName(user_name)) {
      return res.status(400).json({
        status: "ERR",
        message:
          "Usernames must be between 3 and 30 characters long and can only include letters, numbers, spaces, or underscores.",
      });
    }

    // Validate phone
    const isStrictPhone = (phone) => /^0\d{8,10}$/.test(phone);
    if (!isStrictPhone(phone)) {
      return res.status(400).json({
        status: "ERR",
        message:
          "Invalid phone number (must start with 0 and contain 9–11 digits)",
      });
    }

    // Validate address
    const isStrictAddress = (addr) =>
      /^[\p{L}\p{N}\s,.\-\/]{5,100}$/u.test(addr);
    if (!isStrictAddress(address)) {
      return res.status(400).json({
        status: "ERR",
        message:
          "Addresses must be between 5 and 100 characters long and contain only letters, numbers, spaces, and commas ,.-",
      });
    }

    const isValidBirthday = (date) => {
      const birth = new Date(date);
      if (isNaN(birth)) return false;

      const age = new Date().getFullYear() - birth.getFullYear();
      return age >= 13;
    };

    if (!isValidBirthday(birthday)) {
      return res.status(400).json({
        status: "ERR",
        message: "Invalid date of birth (must be 13 years old or older)",
      });
    }

    const validGenders = ["male", "female", "other"];
    if (!validGenders.includes(gender)) {
      return res.status(400).json({
        status: "ERR",
        message: "Gender invalid",
      });
    }

    // Validate file upload
    if (file) {
      const maxSize = 3 * 1024 * 1024; // 3MB
      if (file.size > maxSize) {
        return res.status(400).json({
          status: "ERR",
          message: "File size must be under 3MB",
        });
      }
      const allowedTypes = ["image/jpeg", "image/png"];
      if (!allowedTypes.includes(file.mimetype)) {
        return res.status(400).json({
          status: "ERR",
          message: "Only JPG, PNG images are allowed",
        });
      }
    }

    const response = await ProfileService.updateProfile(
      id,
      { user_name, phone, address, birthday, gender },
      file,
    );
    return res.status(200).json(response);
  } catch (error) {
    console.error("Update user error:", error);
    return res.status(500).json({
      status: "ERR",
      message: "Server error",
      detail: error.message,
    });
  }
};

const getUserById = async (req, res) => {
  try {
    const id = req.user._id;

    if (!id) {
      return res.status(400).json({
        status: "ERR",
        message: "User ID is required",
      });
    }

    const response = await ProfileService.getUserById(id);

    if (!response || response.status === "ERR") {
      return res.status(404).json({
        status: "ERR",
        message: response?.message || "User not found",
      });
    }

    return res.status(200).json({
      status: "OK",
      data: response.data || response,
    });
  } catch (error) {
    return res.status(500).json({
      status: "ERR",
      message: "Internal Server Error",
      detail: error.message,
    });
  }
};

const changePassword = async (req, res) => {
  try {
    const { old_password, new_password } = req.body;
    const userID = req.user._id;

    if (!old_password || !new_password) {
      return res.status(400).json({
        status: "ERR",
        message: "All fields are required",
      });
    }

    const isStrictPassword = (password) => {
      const regex = /^(?=.*[A-Z])(?=.*\d).{8,8}$/;
      return regex.test(password);
    };

    if (!isStrictPassword(new_password)) {
      return res.status(400).json({
        status: "ERR",
        message: "The password must contain 8 characters, including uppercase letters and numbers",
      });
    }

    const response = await ProfileService.changePassword(
      userID,
      old_password,
      new_password,
    );

    if (response.status === "ERR") {
      return res.status(400).json(response);
    }

    return res.status(200).json(response);
  } catch (error) {
    return res.status(500).json({
      status: "ERR",
      message: "Internal Server Error",
      detail: error.message,
    });
  }
};

module.exports = {
  checkRole,
  updateProfile,
  getUserById,
  changePassword,
};
