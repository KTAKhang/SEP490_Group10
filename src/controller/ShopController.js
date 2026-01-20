const ShopService = require("../services/ShopService");

const getShopInfo = async (req, res) => {
  try {
    const response = await ShopService.getShopInfo();
    if (response.status === "ERR") return res.status(400).json(response);
    return res.status(200).json(response);
  } catch (error) {
    return res.status(500).json({ status: "ERR", message: error.message });
  }
};

const updateShopBasicInfo = async (req, res) => {
  try {
    const response = await ShopService.updateShopBasicInfo(req.body);
    if (response.status === "ERR") return res.status(400).json(response);
    return res.status(200).json(response);
  } catch (error) {
    return res.status(500).json({ status: "ERR", message: error.message });
  }
};

const updateShopDescription = async (req, res) => {
  try {
    const response = await ShopService.updateShopDescription(req.body);
    if (response.status === "ERR") return res.status(400).json(response);
    return res.status(200).json(response);
  } catch (error) {
    return res.status(500).json({ status: "ERR", message: error.message });
  }
};

const updateWorkingHours = async (req, res) => {
  try {
    const response = await ShopService.updateWorkingHours(req.body);
    if (response.status === "ERR") return res.status(400).json(response);
    return res.status(200).json(response);
  } catch (error) {
    return res.status(500).json({ status: "ERR", message: error.message });
  }
};

const updateShopImages = async (req, res) => {
  try {
    const { images, imagePublicIds } = req.body;
    const response = await ShopService.updateShopImages(images, imagePublicIds);
    if (response.status === "ERR") return res.status(400).json(response);
    return res.status(200).json(response);
  } catch (error) {
    return res.status(500).json({ status: "ERR", message: error.message });
  }
};

const uploadShopImage = async (req, res) => {
  try {
    if (!req.uploadedImage) {
      return res.status(400).json({ 
        status: "ERR", 
        message: "Không có ảnh được upload" 
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
  getShopInfo,
  updateShopBasicInfo,
  updateShopDescription,
  updateWorkingHours,
  updateShopImages,
  uploadShopImage,
};
