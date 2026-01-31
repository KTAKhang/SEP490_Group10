const HomepageAssetService = require("../services/HomepageAssetService");

/**
 * Get All Homepage Assets (Admin)
 * GET /admin/homepage-assets
 */
const getAllAssets = async (req, res) => {
  try {
    const response = await HomepageAssetService.getAllAssets();
    if (response.status === "ERR") return res.status(400).json(response);
    return res.status(200).json(response);
  } catch (error) {
    return res.status(500).json({ status: "ERR", message: error.message });
  }
};

/**
 * Get Public Homepage Assets
 * GET /homepage-assets/public
 */
const getPublicAssets = async (req, res) => {
  try {
    const response = await HomepageAssetService.getPublicAssets();
    if (response.status === "ERR") return res.status(400).json(response);
    return res.status(200).json(response);
  } catch (error) {
    return res.status(500).json({ status: "ERR", message: error.message });
  }
};

/**
 * Update or Create Homepage Asset
 * PUT /admin/homepage-assets
 */
const updateOrCreateAsset = async (req, res) => {
  try {
    const { key, imageUrl, altText } = req.body;

    if (!key) {
      return res.status(400).json({
        status: "ERR",
        message: "Key là bắt buộc",
      });
    }

    if (!imageUrl) {
      return res.status(400).json({
        status: "ERR",
        message: "Image URL là bắt buộc",
      });
    }

    const response = await HomepageAssetService.updateOrCreateAsset({
      key,
      imageUrl,
      altText,
    });

    if (response.status === "ERR") return res.status(400).json(response);
    return res.status(200).json(response);
  } catch (error) {
    return res.status(500).json({ status: "ERR", message: error.message });
  }
};

/**
 * Upload Homepage Asset Image
 * POST /admin/homepage-assets/upload
 */
const uploadImage = async (req, res) => {
  try {
    if (!req.uploadedImage) {
      return res.status(400).json({
        status: "ERR",
        message: "Không có ảnh được upload",
      });
    }

    return res.status(200).json({
      status: "OK",
      message: "Upload ảnh thành công",
      data: {
        url: req.uploadedImage.url,
        publicId: req.uploadedImage.publicId,
      },
    });
  } catch (error) {
    return res.status(500).json({ status: "ERR", message: error.message });
  }
};

module.exports = {
  getAllAssets,
  getPublicAssets,
  updateOrCreateAsset,
  uploadImage,
};
