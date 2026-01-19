const ShopModel = require("../models/ShopModel");
const { sanitizeHTMLWithImageValidation, validateHTMLSecurity } = require("../utils/htmlSanitizer");
const cloudinary = require("../config/cloudinaryConfig");

/**
 * UC-01: View Shop Information
 * BR-01: Only one shop record exists
 * BR-02: Only ADMIN can view shop info in admin panel
 * BR-03: Auto-initialize default shop if not exists
 * BR-04: Return latest updated data
 */
const getShopInfo = async () => {
  try {
    let shop = await ShopModel.findOne().sort({ updatedAt: -1 });

    // BR-03: Auto-initialize default shop if not exists
    if (!shop) {
      shop = new ShopModel({
        shopName: "My Shop",
        address: "Chưa cập nhật",
        email: "",
        phone: "",
        description: "",
        workingHours: "",
        images: [],
        imagePublicIds: [],
      });
      await shop.save();
    }

    return { status: "OK", message: "Lấy thông tin shop thành công", data: shop };
  } catch (error) {
    return { status: "ERR", message: error.message };
  }
};

/**
 * UC-02: Update Shop Basic Information
 * BR-05: Only ADMIN can update
 * BR-06: Shop name is required
 * BR-07: Address is required
 * BR-08: Email must be valid format (if provided)
 * BR-09: Phone must be valid format (if provided)
 * BR-10: No create/delete allowed (only update)
 * BR-11: Record update timestamp
 */
const updateShopBasicInfo = async (payload = {}) => {
  try {
    const { shopName, address, email, phone } = payload;

    // BR-06: Shop name is required
    if (!shopName || !shopName.toString().trim()) {
      return { status: "ERR", message: "Tên shop là bắt buộc" };
    }

    // BR-07: Address is required
    if (!address || !address.toString().trim()) {
      return { status: "ERR", message: "Địa chỉ là bắt buộc" };
    }

    // BR-08: Email validation (if provided)
    if (email && email.toString().trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email.toString().trim())) {
        return { status: "ERR", message: "Email không đúng định dạng" };
      }
    }

    // BR-09: Phone validation (if provided)
    if (phone && phone.toString().trim()) {
      // Allow common phone formats: +84, 0xx, international format
      const phoneRegex = /^[\d\s\-\+\(\)]+$/;
      const cleanPhone = phone.toString().trim().replace(/\s/g, "");
      if (!phoneRegex.test(cleanPhone) || cleanPhone.length < 8) {
        return { status: "ERR", message: "Số điện thoại không đúng định dạng" };
      }
    }

    // Get existing shop or create default
    let shop = await ShopModel.findOne();
    if (!shop) {
      // BR-03: Auto-initialize if not exists
      shop = new ShopModel({
        shopName: shopName.toString().trim(),
        address: address.toString().trim(),
        email: email ? email.toString().trim().toLowerCase() : "",
        phone: phone ? phone.toString().trim() : "",
        description: "",
        workingHours: "",
        images: [],
        imagePublicIds: [],
      });
    } else {
      // BR-10: Only update, no create/delete
      shop.shopName = shopName.toString().trim();
      shop.address = address.toString().trim();
      shop.email = email ? email.toString().trim().toLowerCase() : "";
      shop.phone = phone ? phone.toString().trim() : "";
      // BR-11: Timestamp will be updated automatically by mongoose timestamps
    }

    await shop.save();

    return { status: "OK", message: "Cập nhật thông tin shop thành công", data: shop };
  } catch (error) {
    return { status: "ERR", message: error.message };
  }
};

/**
 * UC-03: Update Shop Description
 * BR-12: Description can be stored as HTML
 * BR-13: Only content from valid editor is saved
 * BR-14: Description must not exceed character limit
 * BR-15: No malicious scripts allowed
 * BR-16: Update description doesn't affect other shop info
 */
const updateShopDescription = async (payload = {}) => {
  try {
    const { description } = payload;

    // BR-14: Character limit check (5000 chars as defined in model)
    if (description && description.toString().length > 5000) {
      return { status: "ERR", message: "Nội dung mô tả không được vượt quá 5000 ký tự" };
    }

    // BR-15: Validate HTML security
    if (description && description.toString().trim()) {
      const securityCheck = validateHTMLSecurity(description.toString());
      if (!securityCheck.valid) {
        return {
          status: "ERR",
          message: securityCheck.message || "Nội dung chứa script độc hại không được phép",
          threats: securityCheck.threats,
        };
      }
    }

    // Get existing shop or create default
    let shop = await ShopModel.findOne();
    if (!shop) {
      shop = new ShopModel({
        shopName: "My Shop",
        address: "Chưa cập nhật",
        email: "",
        phone: "",
        description: "",
        workingHours: "",
        images: [],
        imagePublicIds: [],
      });
    }

    // BR-12, BR-13: Sanitize HTML content from editor
    const sanitizedDescription = description
      ? sanitizeHTMLWithImageValidation(description.toString())
      : "";

    // BR-16: Only update description, keep other fields unchanged
    shop.description = sanitizedDescription;
    await shop.save();

    return { status: "OK", message: "Cập nhật mô tả shop thành công", data: shop };
  } catch (error) {
    return { status: "ERR", message: error.message };
  }
};

/**
 * UC-04: Update Working Hours
 * BR-17: Working hours stored as text
 * BR-18: Format must be consistent across system
 * BR-19: Working hours cannot be empty
 * BR-20: Display same on all pages (About Us, Contact, Footer)
 */
const updateWorkingHours = async (payload = {}) => {
  try {
    const { workingHours } = payload;

    // BR-19: Working hours cannot be empty
    if (!workingHours || !workingHours.toString().trim()) {
      return { status: "ERR", message: "Giờ hoạt động không được để trống" };
    }

    // Get existing shop or create default
    let shop = await ShopModel.findOne();
    if (!shop) {
      shop = new ShopModel({
        shopName: "My Shop",
        address: "Chưa cập nhật",
        email: "",
        phone: "",
        description: "",
        workingHours: workingHours.toString().trim(),
        images: [],
        imagePublicIds: [],
      });
    } else {
      // BR-17: Store as text
      shop.workingHours = workingHours.toString().trim();
    }

    await shop.save();

    return { status: "OK", message: "Cập nhật giờ hoạt động thành công", data: shop };
  } catch (error) {
    return { status: "ERR", message: error.message };
  }
};

/**
 * UC-05: Upload or Update Shop Images
 * BR-21: Only ADMIN can manage shop images
 * BR-22: Only valid image files (jpg, png, webp)
 * BR-23: File size must not exceed limit
 * BR-24: Shop can have multiple images
 * BR-25: Old images can be overwritten or deleted when updating
 * BR-26: Images must be stored and accessible via valid URL
 */
const updateShopImages = async (images = [], imagePublicIds = []) => {
  try {
    // Validate arrays
    const validImages = Array.isArray(images) ? images : [];
    const validImagePublicIds = Array.isArray(imagePublicIds) ? imagePublicIds : [];

    // Ensure arrays have same length
    if (validImages.length !== validImagePublicIds.length) {
      return { status: "ERR", message: "Số lượng ảnh và public IDs không khớp" };
    }

    // Validate URLs
    for (let i = 0; i < validImages.length; i++) {
      const url = validImages[i];
      if (!url || typeof url !== "string" || !url.trim()) {
        return { status: "ERR", message: `Ảnh thứ ${i + 1} không hợp lệ` };
      }
      if (!url.startsWith("http://") && !url.startsWith("https://")) {
        return { status: "ERR", message: `URL ảnh thứ ${i + 1} không hợp lệ` };
      }
    }

    // Get existing shop or create default
    let shop = await ShopModel.findOne();
    if (!shop) {
      shop = new ShopModel({
        shopName: "My Shop",
        address: "Chưa cập nhật",
        email: "",
        phone: "",
        description: "",
        workingHours: "",
        images: validImages,
        imagePublicIds: validImagePublicIds,
      });
    } else {
      // BR-25: Get old images to delete if needed
      const oldImagePublicIds = Array.isArray(shop.imagePublicIds) ? shop.imagePublicIds : [];
      const newImagePublicIds = validImagePublicIds;

      // Find images to delete (old images not in new list)
      const imagesToDelete = oldImagePublicIds.filter((id) => !newImagePublicIds.includes(id));

      // Delete old images from Cloudinary
      if (imagesToDelete.length > 0) {
        try {
          await Promise.all(
            imagesToDelete.map((publicId) =>
              cloudinary.uploader.destroy(publicId).catch((err) => {
                console.warn(`Không thể xóa ảnh ${publicId} trên Cloudinary:`, err.message);
              })
            )
          );
        } catch (err) {
          console.warn("Lỗi khi xóa ảnh cũ:", err.message);
        }
      }

      // BR-24: Update images array
      shop.images = validImages;
      shop.imagePublicIds = validImagePublicIds;
    }

    await shop.save();

    return { status: "OK", message: "Cập nhật ảnh shop thành công", data: shop };
  } catch (error) {
    return { status: "ERR", message: error.message };
  }
};

module.exports = {
  getShopInfo,
  updateShopBasicInfo,
  updateShopDescription,
  updateWorkingHours,
  updateShopImages,
};
