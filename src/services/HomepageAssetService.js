const HomepageAssetModel = require("../models/HomepageAssetModel");

// Valid keys
const VALID_KEYS = [
  "heroBackground",
  "trustAvatar1",
  "trustAvatar2",
  "trustAvatar3",
  "testimonialImage",
  "testimonialImage2",
  "ctaImage",
  "logo",
];

/**
 * Validate key
 * @param {string} key - Key cần validate
 * @returns {object} - { valid: boolean, message?: string }
 */
const validateKey = (key) => {
  if (!key || !key.trim()) {
    return { valid: false, message: "Key là bắt buộc" };
  }
  if (!VALID_KEYS.includes(key)) {
    return {
      valid: false,
      message: `Key không hợp lệ. Phải là một trong các giá trị: ${VALID_KEYS.join(", ")}`,
    };
  }
  return { valid: true };
};

/**
 * Validate imageUrl
 * @param {string} imageUrl - URL cần validate
 * @returns {object} - { valid: boolean, message?: string }
 */
const validateImageUrl = (imageUrl) => {
  if (!imageUrl || !imageUrl.trim()) {
    return { valid: false, message: "Image URL là bắt buộc" };
  }
  try {
    new URL(imageUrl.trim());
    return { valid: true };
  } catch {
    return { valid: false, message: "Image URL phải là một URL hợp lệ" };
  }
};

/**
 * Get All Homepage Assets (Admin)
 * Lấy tất cả homepage assets với đầy đủ thông tin
 * 
 * @returns {Promise<object>} - { status: "OK"|"ERR", message: string, data: HomepageAssetModel[] }
 */
const getAllAssets = async () => {
  try {
    const assets = await HomepageAssetModel.find({}).sort({ key: 1 });
    return {
      status: "OK",
      message: "Lấy danh sách hình ảnh thành công",
      data: assets,
    };
  } catch (error) {
    return { status: "ERR", message: error.message };
  }
};

/**
 * Get Public Homepage Assets
 * Lấy homepage assets cho public (chỉ trả về key, imageUrl, altText)
 * 
 * @returns {Promise<object>} - { status: "OK"|"ERR", message: string, data: object[] }
 */
const getPublicAssets = async () => {
  try {
    const assets = await HomepageAssetModel.find({})
      .select("key imageUrl altText")
      .sort({ key: 1 });

    return {
      status: "OK",
      message: "Lấy danh sách hình ảnh thành công",
      data: assets,
    };
  } catch (error) {
    return { status: "ERR", message: error.message };
  }
};

/**
 * Update or Create Homepage Asset
 * Cập nhật hoặc tạo mới homepage asset
 * 
 * Thuật toán:
 * 1. Validate key
 * 2. Validate imageUrl
 * 3. Validate altText (nếu có)
 * 4. Tìm asset với key này
 * 5. Nếu tồn tại: Update imageUrl, altText, updatedAt tự động
 * 6. Nếu không tồn tại: Tạo mới
 * 7. Query lại tất cả assets và trả về
 * 
 * @param {object} payload - { key, imageUrl, altText? }
 * @returns {Promise<object>} - { status: "OK"|"ERR", message: string, data: HomepageAssetModel[] }
 */
const updateOrCreateAsset = async (payload = {}) => {
  try {
    const { key, imageUrl, altText = "" } = payload;

    // Validate key
    const keyValidation = validateKey(key);
    if (!keyValidation.valid) {
      return { status: "ERR", message: keyValidation.message };
    }

    // Validate imageUrl
    const urlValidation = validateImageUrl(imageUrl);
    if (!urlValidation.valid) {
      return { status: "ERR", message: urlValidation.message };
    }

    // Validate altText
    if (altText && altText.trim().length > 200) {
      return {
        status: "ERR",
        message: "Alt text không được vượt quá 200 ký tự",
      };
    }

    // Tìm asset với key này
    const existingAsset = await HomepageAssetModel.findOne({ key });

    if (existingAsset) {
      // Update existing asset
      existingAsset.imageUrl = imageUrl.trim();
      existingAsset.altText = altText ? altText.trim() : "";
      // updatedAt sẽ tự động cập nhật bởi timestamps
      await existingAsset.save();
    } else {
      // Create new asset
      const newAsset = new HomepageAssetModel({
        key: key.trim(),
        imageUrl: imageUrl.trim(),
        altText: altText ? altText.trim() : "",
      });
      await newAsset.save();
    }

    // Query lại tất cả assets và trả về
    const allAssets = await HomepageAssetModel.find({}).sort({ key: 1 });

    return {
      status: "OK",
      message: "Cập nhật hình ảnh thành công",
      data: allAssets,
    };
  } catch (error) {
    // Handle duplicate key error
    if (error.code === 11000) {
      return {
        status: "ERR",
        message: "Key đã tồn tại. Vui lòng sử dụng key khác",
      };
    }
    return { status: "ERR", message: error.message };
  }
};

/**
 * Get Asset By Key
 * Lấy asset theo key (helper function)
 * 
 * @param {string} key - Key của asset
 * @returns {Promise<object|null>} - HomepageAssetModel hoặc null
 */
const getAssetByKey = async (key) => {
  try {
    const asset = await HomepageAssetModel.findOne({ key });
    return asset;
  } catch (error) {
    return null;
  }
};

module.exports = {
  getAllAssets,
  getPublicAssets,
  updateOrCreateAsset,
  getAssetByKey,
};
