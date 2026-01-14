const NewsService = require("../services/NewsService");

const createNews = async (req, res) => {
  try {
    const response = await NewsService.createNews({
      ...req.body,
      author_id: req.user._id,
    });
    if (response.status === "ERR") return res.status(400).json(response);
    return res.status(201).json(response);
  } catch (error) {
    return res.status(500).json({ status: "ERR", message: error.message });
  }
};

const getNews = async (req, res) => {
  try {
    const response = await NewsService.getNews(req.query);
    if (response.status === "ERR") return res.status(400).json(response);
    return res.status(200).json(response);
  } catch (error) {
    return res.status(500).json({ status: "ERR", message: error.message });
  }
};

const getNewsById = async (req, res) => {
  try {
    const userId = req.user?._id || null;
    
    // Get IP address from various sources (support proxy/load balancer)
    // Priority: x-forwarded-for > x-real-ip > req.ip > connection.remoteAddress
    let ipAddress = null;
    
    if (req.headers['x-forwarded-for']) {
      // x-forwarded-for can contain multiple IPs, take the first one
      ipAddress = req.headers['x-forwarded-for'].split(',')[0].trim();
    } else if (req.headers['x-real-ip']) {
      ipAddress = req.headers['x-real-ip'];
    } else if (req.ip) {
      ipAddress = req.ip;
    } else if (req.connection && req.connection.remoteAddress) {
      ipAddress = req.connection.remoteAddress;
    } else if (req.socket && req.socket.remoteAddress) {
      ipAddress = req.socket.remoteAddress;
    }
    
    // Remove IPv6 prefix if present
    if (ipAddress && ipAddress.startsWith('::ffff:')) {
      ipAddress = ipAddress.substring(7);
    }
    
    const response = await NewsService.getNewsById(req.params.id, userId, ipAddress);
    if (response.status === "ERR") return res.status(404).json(response);
    return res.status(200).json(response);
  } catch (error) {
    return res.status(500).json({ status: "ERR", message: error.message });
  }
};

const updateNews = async (req, res) => {
  try {
    const userId = req.user._id;
    const isAdmin = req.user.role_name === "admin";
    const response = await NewsService.updateNews(req.params.id, req.body, userId, isAdmin);
    if (response.status === "ERR") return res.status(400).json(response);
    return res.status(200).json(response);
  } catch (error) {
    return res.status(500).json({ status: "ERR", message: error.message });
  }
};

const deleteNews = async (req, res) => {
  try {
    const userId = req.user._id;
    const isAdmin = req.user.role_name === "admin";
    const response = await NewsService.deleteNews(req.params.id, userId, isAdmin);
    if (response.status === "ERR") return res.status(400).json(response);
    return res.status(200).json(response);
  } catch (error) {
    return res.status(500).json({ status: "ERR", message: error.message });
  }
};

const getFeaturedNews = async (req, res) => {
  try {
    const response = await NewsService.getFeaturedNews();
    if (response.status === "ERR") return res.status(400).json(response);
    return res.status(200).json(response);
  } catch (error) {
    return res.status(500).json({ status: "ERR", message: error.message });
  }
};

const uploadContentImage = async (req, res) => {
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
  createNews,
  getNews,
  getNewsById,
  updateNews,
  deleteNews,
  getFeaturedNews,
  uploadContentImage,
};
