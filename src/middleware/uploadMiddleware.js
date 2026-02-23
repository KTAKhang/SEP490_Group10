const multer = require("multer");
const cloudinary = require("../config/cloudinaryConfig");
const { Readable } = require("stream");
const sharp = require("sharp");
const CategoryModel = require("../models/CategoryModel");
const ProductModel = require("../models/ProductModel");
const FruitBasketModel = require("../models/FruitBasketModel");
const FruitTypeModel = require("../models/FruitTypeModel");
const ReviewModel = require("../models/ReviewModel");


// Sử dụng memory storage để nhận file từ multipart/form-data
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }, // giới hạn 5MB
});

// Single, clear error message for invalid file type (avoid duplicate or vague messages)
const ALLOWED_IMAGE_MIMES = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"];
const IMAGE_FILE_TYPE_ERROR = "Only image files are allowed (jpg, png, webp, gif). Documents and other file types are not accepted.";

// Helper: Resize và compress ảnh trước khi upload (giảm kích thước file đáng kể)
const optimizeImage = async (buffer) => {
    try {
        // Resize ảnh xuống tối đa 1920x1920 (giữ aspect ratio), compress với quality 85
        // Format WebP nếu có thể (file nhỏ hơn 30-50% so với JPEG/PNG)
        const optimized = await sharp(buffer)
            .resize(1920, 1920, {
                fit: 'inside', // Giữ aspect ratio, không crop
                withoutEnlargement: true, // Không phóng to ảnh nhỏ
            })
            .webp({ quality: 85 }) // Convert sang WebP với quality 85 (tốt nhưng file nhỏ)
            .toBuffer();
        
        return optimized;
    } catch (error) {
        // Nếu lỗi (ví dụ: không phải ảnh), trả về buffer gốc
        console.warn("Không thể optimize ảnh, sử dụng ảnh gốc:", error.message);
        return buffer;
    }
};

// Helper: Upload file lên Cloudinary với optimization và stream (nhanh hơn base64)
const uploadToCloudinary = async (buffer, folder, options = {}) => {
    // Tối ưu ảnh trước (resize + compress) - giảm kích thước file đáng kể
    const optimizedBuffer = await optimizeImage(buffer);
    
    return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
            {
                folder: folder,
                resource_type: "image",
                // Cloudinary sẽ tự động optimize thêm
                quality: "auto",
                fetch_format: "auto",
                ...options,
            },
            (error, result) => {
                if (error) return reject(error);
                resolve(result);
            }
        );

        // Upload từ buffer stream đã được optimize (nhanh hơn nhiều)
        const bufferStream = new Readable();
        bufferStream.push(optimizedBuffer);
        bufferStream.push(null);
        bufferStream.pipe(uploadStream);
    });
};

// Middleware: Upload ảnh category lên Cloudinary nếu có file 'image'
const uploadCategoryImage = (req, res, next) => {
    const handler = upload.single("image");
    handler(req, res, async (err) => {
        if (err) {
            return res.status(400).json({ status: "ERR", message: err.message });
        }
        try {
            if (req.file && req.file.buffer) {
                // Validate file type first: only images allowed (reject doc, pdf, etc.) — single response, no double error
                if (!ALLOWED_IMAGE_MIMES.includes(req.file.mimetype)) {
                    return res.status(400).json({ status: "ERR", message: IMAGE_FILE_TYPE_ERROR });
                }
                // ✅ Tự động lấy ảnh cũ từ database nếu đang update (có req.params.id)
                let oldImagePublicId = null;
                if (req.params && req.params.id) {
                    try {
                        const category = await CategoryModel.findById(req.params.id).select("imagePublicId");
                        if (category && category.imagePublicId) {
                            oldImagePublicId = category.imagePublicId;
                            console.log(`📸 Tìm thấy ảnh cũ từ database: ${oldImagePublicId}`);
                        }
                    } catch (err) {
                        // Nếu không tìm thấy hoặc lỗi, bỏ qua (có thể là create mới)
                        console.warn("Không thể lấy ảnh cũ từ database:", err.message);
                    }
                }
                
                // Nếu không có từ database, lấy từ body (frontend có thể gửi)
                if (!oldImagePublicId) {
                    oldImagePublicId = req.body.oldImagePublicId || req.body.imagePublicId;
                }
                
                // Upload với stream (nhanh hơn base64) + optimization
                const result = await uploadToCloudinary(req.file.buffer, "categories");
                req.body.image = result.secure_url;
                req.body.imagePublicId = result.public_id;
                
                // ✅ Tự động xóa ảnh cũ nếu có ảnh mới và khác ảnh cũ
                if (oldImagePublicId && oldImagePublicId !== result.public_id) {
                    console.log(`🗑️ Xóa ảnh cũ category: ${oldImagePublicId}`);
                    cloudinary.uploader.destroy(oldImagePublicId).catch(err => {
                        console.warn(`Không thể xóa ảnh cũ ${oldImagePublicId} trên Cloudinary:`, err.message);
                    });
                } else if (oldImagePublicId && oldImagePublicId === result.public_id) {
                    console.log(`ℹ️ Ảnh mới trùng với ảnh cũ, không cần xóa`);
                }
            }
            return next();
        } catch (error) {
            return res.status(500).json({ status: "ERR", message: error.message });
        }
    });
};

// Middleware: Upload ảnh FruitType (pre-order) lên Cloudinary nếu có file 'image' (single - legacy)
const uploadFruitTypeImage = (req, res, next) => {
    const handler = upload.single("image");
    handler(req, res, async (err) => {
        if (err) {
            return res.status(400).json({ status: "ERR", message: err.message });
        }
        try {
            if (req.file && req.file.buffer) {
                if (!ALLOWED_IMAGE_MIMES.includes(req.file.mimetype)) {
                    return res.status(400).json({ status: "ERR", message: IMAGE_FILE_TYPE_ERROR });
                }
                let oldImagePublicId = null;
                if (req.params && req.params.id) {
                    try {
                        const ft = await FruitTypeModel.findById(req.params.id).select("imagePublicId");
                        if (ft && ft.imagePublicId) oldImagePublicId = ft.imagePublicId;
                    } catch (e) {
                        console.warn("Không thể lấy ảnh cũ FruitType:", e.message);
                    }
                }
                if (!oldImagePublicId) {
                    oldImagePublicId = req.body.oldImagePublicId || req.body.imagePublicId;
                }
                const result = await uploadToCloudinary(req.file.buffer, "fruit-types");
                req.body.image = result.secure_url;
                req.body.imagePublicId = result.public_id;
                if (oldImagePublicId && oldImagePublicId !== result.public_id) {
                    cloudinary.uploader.destroy(oldImagePublicId).catch((e) =>
                        console.warn("Không thể xóa ảnh cũ FruitType:", e.message)
                    );
                }
            }
            return next();
        } catch (error) {
            return res.status(500).json({ status: "ERR", message: error.message });
        }
    });
};

// Middleware: Upload nhiều ảnh FruitType (pre-order) lên Cloudinary - field "images" (max 10)
const uploadFruitTypeImages = (req, res, next) => {
    const handler = upload.array("images", 10);
    handler(req, res, async (err) => {
        if (err) {
            return res.status(400).json({ status: "ERR", message: err.message });
        }
        try {
            let oldImagesFromDB = [];
            let oldImagePublicIdsFromDB = [];
            if (req.params && req.params.id) {
                try {
                    const ft = await FruitTypeModel.findById(req.params.id).select("images imagePublicIds image imagePublicId");
                    if (ft) {
                        oldImagesFromDB = Array.isArray(ft.images) && ft.images.length > 0 ? ft.images : (ft.image ? [ft.image] : []);
                        oldImagePublicIdsFromDB = Array.isArray(ft.imagePublicIds) && ft.imagePublicIds.length > 0 ? ft.imagePublicIds : (ft.imagePublicId ? [ft.imagePublicId] : []);
                    }
                } catch (e) {
                    console.warn("Could not load existing FruitType images:", e.message);
                }
            }
            let existingImages = [];
            let existingImagePublicIds = [];
            if (req.body.existingImages) {
                try {
                    existingImages = typeof req.body.existingImages === "string" ? JSON.parse(req.body.existingImages) : req.body.existingImages;
                } catch (e) {
                    existingImages = Array.isArray(req.body.existingImages) ? req.body.existingImages : [];
                }
            }
            if (req.body.existingImagePublicIds) {
                try {
                    existingImagePublicIds = typeof req.body.existingImagePublicIds === "string" ? JSON.parse(req.body.existingImagePublicIds) : req.body.existingImagePublicIds;
                } catch (e) {
                    existingImagePublicIds = Array.isArray(req.body.existingImagePublicIds) ? req.body.existingImagePublicIds : [];
                }
            }
            if (existingImages.length === 0 && oldImagesFromDB.length > 0) existingImages = oldImagesFromDB;
            if (existingImagePublicIds.length === 0 && oldImagePublicIdsFromDB.length > 0) existingImagePublicIds = oldImagePublicIdsFromDB;

            if (Array.isArray(req.files) && req.files.length > 0) {
                const uploads = req.files.map((file) => uploadToCloudinary(file.buffer, "fruit-types"));
                const results = await Promise.all(uploads);
                const newImages = results.map((r) => r.secure_url);
                const newImagePublicIds = results.map((r) => r.public_id);
                const finalImages = [...existingImages, ...newImages];
                const finalImagePublicIds = [...existingImagePublicIds, ...newImagePublicIds];
                const allOld = oldImagePublicIdsFromDB.length > 0 ? oldImagePublicIdsFromDB : existingImagePublicIds;
                const toDelete = allOld.filter((id) => !finalImagePublicIds.includes(id));
                if (toDelete.length > 0) {
                    Promise.all(toDelete.map((publicId) => cloudinary.uploader.destroy(publicId).catch((e) => console.warn("FruitType image delete failed:", e.message)))).catch(() => {});
                }
                req.body.images = finalImages;
                req.body.imagePublicIds = finalImagePublicIds;
                req.body.image = finalImages[0] || null;
                req.body.imagePublicId = finalImagePublicIds[0] || null;
            } else {
                req.body.images = existingImages;
                req.body.imagePublicIds = existingImagePublicIds;
                req.body.image = existingImages[0] || null;
                req.body.imagePublicId = existingImagePublicIds[0] || null;
            }
            return next();
        } catch (error) {
            return res.status(500).json({ status: "ERR", message: error.message });
        }
    });
};

module.exports = { uploadCategoryImage, uploadFruitTypeImage, uploadFruitTypeImages };

// Middleware: Upload nhiều ảnh product lên Cloudinary nếu có field 'images'
const uploadProductImages = (req, res, next) => {
    const handler = upload.array("images", 10);
    handler(req, res, async (err) => {
        if (err) {
            console.error(`❌ Multer error:`, err);
            return res.status(400).json({ status: "ERR", message: err.message });
        }
        try {
            // ✅ Tự động lấy danh sách ảnh cũ từ database nếu đang update (có req.params.id)
            let oldImagesFromDB = [];
            let oldImagePublicIdsFromDB = [];
            
            if (req.params && req.params.id) {
                try {
                    const product = await ProductModel.findById(req.params.id).select("images imagePublicIds");
                    if (product) {
                        oldImagesFromDB = Array.isArray(product.images) ? product.images : [];
                        oldImagePublicIdsFromDB = Array.isArray(product.imagePublicIds) ? product.imagePublicIds : [];
                    }
                } catch (err) {
                    // Nếu không tìm thấy hoặc lỗi, bỏ qua (có thể là create mới)
                    console.warn("Không thể lấy ảnh cũ từ database:", err.message);
                }
            }
            
            // Lấy danh sách ảnh cũ từ body (nếu frontend gửi - ưu tiên hơn DB)
            let existingImages = [];
            let existingImagePublicIds = [];
            
            // Parse existingImages và existingImagePublicIds từ body (có thể là JSON string hoặc array)
            if (req.body.existingImages) {
                try {
                    existingImages = typeof req.body.existingImages === 'string' 
                        ? JSON.parse(req.body.existingImages) 
                        : req.body.existingImages;
                } catch (e) {
                    existingImages = Array.isArray(req.body.existingImages) ? req.body.existingImages : [];
                }
            }
            
            if (req.body.existingImagePublicIds) {
                try {
                    existingImagePublicIds = typeof req.body.existingImagePublicIds === 'string'
                        ? JSON.parse(req.body.existingImagePublicIds)
                        : req.body.existingImagePublicIds;
                } catch (e) {
                    existingImagePublicIds = Array.isArray(req.body.existingImagePublicIds) ? req.body.existingImagePublicIds : [];
                }
            }
            
            // Nếu frontend không gửi, dùng ảnh cũ từ database
            if (existingImages.length === 0 && oldImagesFromDB.length > 0) {
                existingImages = oldImagesFromDB;
            }
            if (existingImagePublicIds.length === 0 && oldImagePublicIdsFromDB.length > 0) {
                existingImagePublicIds = oldImagePublicIdsFromDB;
            }
            
            // ✅ Validate: only allow image files (reject doc, pdf, etc.) — single 400 response, clear message
            if (Array.isArray(req.files) && req.files.length > 0) {
                const invalidFiles = req.files.filter((file) => !ALLOWED_IMAGE_MIMES.includes(file.mimetype));
                if (invalidFiles.length > 0) {
                    const names = invalidFiles.map((f) => f.originalname || f.fieldname).join(", ");
                    return res.status(400).json({
                        status: "ERR",
                        message: IMAGE_FILE_TYPE_ERROR + (names ? " Rejected file(s): " + names : ""),
                    });
                }
            }

            // ✅ Xử lý file upload thực tế - Upload song song với stream + optimization
            if (Array.isArray(req.files) && req.files.length > 0) {
                // Upload tất cả ảnh song song với stream (nhanh hơn base64)
                const uploads = req.files.map((file) => 
                    uploadToCloudinary(file.buffer, "products")
                );
                
                const results = await Promise.all(uploads);
                const newImages = results.map((r) => r.secure_url);
                const newImagePublicIds = results.map((r) => r.public_id);
                
                // Merge ảnh cũ (giữ lại) và ảnh mới
                const finalImages = [...existingImages, ...newImages];
                const finalImagePublicIds = [...existingImagePublicIds, ...newImagePublicIds];
                
                // ✅ Tự động xóa ảnh cũ không còn trong danh sách mới
                // So sánh ảnh cũ từ DB với danh sách mới (ảnh cũ giữ lại + ảnh mới)
                // Nếu có ảnh cũ không còn trong danh sách mới → xóa trên Cloudinary
                const allOldImagePublicIds = oldImagePublicIdsFromDB.length > 0 
                    ? oldImagePublicIdsFromDB 
                    : existingImagePublicIds;
                
                if (allOldImagePublicIds.length > 0) {
                    const imagesToDelete = allOldImagePublicIds.filter(
                        oldId => !finalImagePublicIds.includes(oldId)
                    );
                    
                    // Xóa ảnh cũ trên Cloudinary (chạy song song, không block)
                    if (imagesToDelete.length > 0) {
                        console.log(`🗑️ Xóa ${imagesToDelete.length} ảnh cũ không còn trong danh sách mới`);
                        Promise.all(
                            imagesToDelete.map(publicId => 
                                cloudinary.uploader.destroy(publicId).catch(err => {
                                    console.warn(`Không thể xóa ảnh ${publicId} trên Cloudinary:`, err.message);
                                })
                            )
                        ).catch(err => {
                            console.warn("Lỗi khi xóa ảnh cũ:", err.message);
                        });
                    }
                }
                
                req.body.images = finalImages;
                req.body.imagePublicIds = finalImagePublicIds;
            } else {
                // Không có file mới, giữ nguyên ảnh cũ (nếu có)
                if (existingImages.length > 0 || existingImagePublicIds.length > 0) {
                    req.body.images = existingImages;
                    req.body.imagePublicIds = existingImagePublicIds;
                }
                // Nếu không có ảnh cũ và không có file mới, để service xử lý (có thể là xóa tất cả ảnh)
            }
            
            return next();
        } catch (error) {
            console.error(`❌ Upload middleware error:`, error);
            console.error(`❌ Error stack:`, error.stack);
            return res.status(500).json({ status: "ERR", message: error.message });
        }
    });
};

module.exports.uploadProductImages = uploadProductImages;

// Middleware: Upload nhiều ảnh giỏ trái cây lên Cloudinary
const uploadFruitBasketImages = (req, res, next) => {
    const handler = upload.array("images", 10);
    handler(req, res, async (err) => {
        if (err) {
            console.error(`❌ Multer error:`, err);
            return res.status(400).json({ status: "ERR", message: err.message });
        }
        try {
            let oldImagesFromDB = [];
            let oldImagePublicIdsFromDB = [];

            if (req.params && req.params.id) {
                try {
                    const basket = await FruitBasketModel.findById(req.params.id).select("images imagePublicIds");
                    if (basket) {
                        oldImagesFromDB = Array.isArray(basket.images) ? basket.images : [];
                        oldImagePublicIdsFromDB = Array.isArray(basket.imagePublicIds) ? basket.imagePublicIds : [];
                    }
                } catch (err) {
                    console.warn("Không thể lấy ảnh cũ từ database:", err.message);
                }
            }

            let existingImages = [];
            let existingImagePublicIds = [];

            if (req.body.existingImages) {
                try {
                    existingImages = typeof req.body.existingImages === "string"
                        ? JSON.parse(req.body.existingImages)
                        : req.body.existingImages;
                } catch (e) {
                    existingImages = Array.isArray(req.body.existingImages) ? req.body.existingImages : [];
                }
            }

            if (req.body.existingImagePublicIds) {
                try {
                    existingImagePublicIds = typeof req.body.existingImagePublicIds === "string"
                        ? JSON.parse(req.body.existingImagePublicIds)
                        : req.body.existingImagePublicIds;
                } catch (e) {
                    existingImagePublicIds = Array.isArray(req.body.existingImagePublicIds) ? req.body.existingImagePublicIds : [];
                }
            }

            if (existingImages.length === 0 && oldImagesFromDB.length > 0) {
                existingImages = oldImagesFromDB;
            }
            if (existingImagePublicIds.length === 0 && oldImagePublicIdsFromDB.length > 0) {
                existingImagePublicIds = oldImagePublicIdsFromDB;
            }

            if (Array.isArray(req.files) && req.files.length > 0) {
                const uploads = req.files.map((file) =>
                    uploadToCloudinary(file.buffer, "fruit-baskets")
                );

                const results = await Promise.all(uploads);
                const newImages = results.map((r) => r.secure_url);
                const newImagePublicIds = results.map((r) => r.public_id);

                const finalImages = [...existingImages, ...newImages];
                const finalImagePublicIds = [...existingImagePublicIds, ...newImagePublicIds];

                const allOldImagePublicIds = oldImagePublicIdsFromDB.length > 0
                    ? oldImagePublicIdsFromDB
                    : existingImagePublicIds;

                if (allOldImagePublicIds.length > 0) {
                    const imagesToDelete = allOldImagePublicIds.filter(
                        oldId => !finalImagePublicIds.includes(oldId)
                    );

                    if (imagesToDelete.length > 0) {
                        Promise.all(
                            imagesToDelete.map(publicId =>
                                cloudinary.uploader.destroy(publicId).catch(err => {
                                    console.warn(`Không thể xóa ảnh ${publicId} trên Cloudinary:`, err.message);
                                })
                            )
                        ).catch(err => {
                            console.warn("Lỗi khi xóa ảnh cũ:", err.message);
                        });
                    }
                }

                req.body.images = finalImages;
                req.body.imagePublicIds = finalImagePublicIds;
            } else {
                if (req.body.images !== undefined || req.body.imagePublicIds !== undefined) {
                    let imagesArray = req.body.images;
                    let imagePublicIdsArray = req.body.imagePublicIds;

                    if (typeof imagesArray === "string") {
                        try {
                            imagesArray = JSON.parse(imagesArray);
                        } catch (e) {
                            imagesArray = [];
                        }
                    }

                    if (typeof imagePublicIdsArray === "string") {
                        try {
                            imagePublicIdsArray = JSON.parse(imagePublicIdsArray);
                        } catch (e) {
                            imagePublicIdsArray = [];
                        }
                    }

                    req.body.images = Array.isArray(imagesArray) ? imagesArray : [];
                    req.body.imagePublicIds = Array.isArray(imagePublicIdsArray) ? imagePublicIdsArray : [];
                } else {
                    req.body.images = existingImages;
                    req.body.imagePublicIds = existingImagePublicIds;
                }
            }

            return next();
        } catch (error) {
            console.error(`❌ Upload middleware error:`, error);
            console.error(`❌ Error stack:`, error.stack);
            return res.status(500).json({ status: "ERR", message: error.message });
        }
    });
};

module.exports.uploadFruitBasketImages = uploadFruitBasketImages;

// Middleware: Upload nhiều ảnh review lên Cloudinary
const uploadReviewImages = (req, res, next) => {
    const handler = upload.array("images", 3);
    handler(req, res, async (err) => {
        if (err) {
            console.error(`❌ Multer error:`, err);
            return res.status(400).json({ status: "ERR", message: err.message });
        }
        try {
            let oldImagesFromDB = [];
            let oldImagePublicIdsFromDB = [];

            if (req.params && req.params.id) {
                try {
                    const review = await ReviewModel.findById(req.params.id).select("images imagePublicIds");
                    if (review) {
                        oldImagesFromDB = Array.isArray(review.images) ? review.images : [];
                        oldImagePublicIdsFromDB = Array.isArray(review.imagePublicIds) ? review.imagePublicIds : [];
                    }
                } catch (err) {
                    console.warn("Không thể lấy ảnh cũ từ database:", err.message);
                }
            }

            let existingImages = [];
            let existingImagePublicIds = [];

            if (req.body.existingImages) {
                try {
                    existingImages = typeof req.body.existingImages === "string"
                        ? JSON.parse(req.body.existingImages)
                        : req.body.existingImages;
                } catch (e) {
                    existingImages = Array.isArray(req.body.existingImages) ? req.body.existingImages : [];
                }
            }

            if (req.body.existingImagePublicIds) {
                try {
                    existingImagePublicIds = typeof req.body.existingImagePublicIds === "string"
                        ? JSON.parse(req.body.existingImagePublicIds)
                        : req.body.existingImagePublicIds;
                } catch (e) {
                    existingImagePublicIds = Array.isArray(req.body.existingImagePublicIds) ? req.body.existingImagePublicIds : [];
                }
            }

            if (existingImages.length === 0 && oldImagesFromDB.length > 0) {
                existingImages = oldImagesFromDB;
            }
            if (existingImagePublicIds.length === 0 && oldImagePublicIdsFromDB.length > 0) {
                existingImagePublicIds = oldImagePublicIdsFromDB;
            }

            if (Array.isArray(req.files) && req.files.length > 0) {
                const uploads = req.files.map((file) =>
                    uploadToCloudinary(file.buffer, "reviews")
                );

                const results = await Promise.all(uploads);
                const newImages = results.map((r) => r.secure_url);
                const newImagePublicIds = results.map((r) => r.public_id);

                const finalImages = [...existingImages, ...newImages];
                const finalImagePublicIds = [...existingImagePublicIds, ...newImagePublicIds];

                const allOldImagePublicIds = oldImagePublicIdsFromDB.length > 0
                    ? oldImagePublicIdsFromDB
                    : existingImagePublicIds;

                if (allOldImagePublicIds.length > 0) {
                    const imagesToDelete = allOldImagePublicIds.filter(
                        oldId => !finalImagePublicIds.includes(oldId)
                    );

                    if (imagesToDelete.length > 0) {
                        Promise.all(
                            imagesToDelete.map(publicId =>
                                cloudinary.uploader.destroy(publicId).catch(err => {
                                    console.warn(`Không thể xóa ảnh ${publicId} trên Cloudinary:`, err.message);
                                })
                            )
                        ).catch(err => {
                            console.warn("Lỗi khi xóa ảnh cũ:", err.message);
                        });
                    }
                }

                req.body.images = finalImages;
                req.body.imagePublicIds = finalImagePublicIds;
            } else {
                if (req.body.images !== undefined || req.body.imagePublicIds !== undefined) {
                    let imagesArray = req.body.images;
                    let imagePublicIdsArray = req.body.imagePublicIds;

                    if (typeof imagesArray === "string") {
                        try {
                            imagesArray = JSON.parse(imagesArray);
                        } catch (e) {
                            imagesArray = [];
                        }
                    }

                    if (typeof imagePublicIdsArray === "string") {
                        try {
                            imagePublicIdsArray = JSON.parse(imagePublicIdsArray);
                        } catch (e) {
                            imagePublicIdsArray = [];
                        }
                    }

                    req.body.images = Array.isArray(imagesArray) ? imagesArray : [];
                    req.body.imagePublicIds = Array.isArray(imagePublicIdsArray) ? imagePublicIdsArray : [];
                } else {
                    req.body.images = existingImages;
                    req.body.imagePublicIds = existingImagePublicIds;
                }
            }

            return next();
        } catch (error) {
            console.error(`❌ Upload middleware error:`, error);
            console.error(`❌ Error stack:`, error.stack);
            return res.status(500).json({ status: "ERR", message: error.message });
        }
    });
};

module.exports.uploadReviewImages = uploadReviewImages;

// Middleware: Upload news thumbnail lên Cloudinary
const uploadNewsThumbnail = (req, res, next) => {
    const handler = upload.single("thumbnail");
    handler(req, res, async (err) => {
        if (err) {
            return res.status(400).json({ status: "ERR", message: err.message });
        }
        try {
            if (req.file && req.file.buffer) {
                // Validate file type
                const allowedMimes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
                if (!allowedMimes.includes(req.file.mimetype)) {
                    return res.status(400).json({
                        status: "ERR",
                        message: "Thumbnail must be jpg, png or webp format",
                    });
                }

                // ✅ Tự động lấy ảnh cũ từ database nếu đang update (có req.params.id)
                let oldThumbnailPublicId = null;
                if (req.params && req.params.id) {
                    try {
                        const NewsModel = require("../models/NewsModel");
                        const news = await NewsModel.findById(req.params.id).select("thumbnailPublicId");
                        if (news && news.thumbnailPublicId) {
                            oldThumbnailPublicId = news.thumbnailPublicId;
                        }
                    } catch (err) {
                        console.warn("Không thể lấy ảnh cũ từ database:", err.message);
                    }
                }

                // Nếu không có từ database, lấy từ body (frontend có thể gửi)
                if (!oldThumbnailPublicId) {
                    oldThumbnailPublicId = req.body.oldThumbnailPublicId || req.body.thumbnailPublicId;
                }

                // Upload với stream + optimization
                const result = await uploadToCloudinary(req.file.buffer, "news");

                req.body.thumbnail_url = result.secure_url;
                req.body.thumbnailPublicId = result.public_id;

                // ✅ Tự động xóa ảnh cũ nếu có ảnh mới và khác ảnh cũ
                if (oldThumbnailPublicId && oldThumbnailPublicId !== result.public_id) {
                    cloudinary.uploader.destroy(oldThumbnailPublicId).catch((err) => {
                        console.warn(`Không thể xóa ảnh cũ ${oldThumbnailPublicId} trên Cloudinary:`, err.message);
                    });
                }
            }
            return next();
        } catch (error) {
            return res.status(500).json({ status: "ERR", message: error.message });
        }
    });
};

module.exports.uploadNewsThumbnail = uploadNewsThumbnail;

// Middleware: Upload ảnh cho content (dùng trong HTML editor)
const uploadNewsContentImage = (req, res, next) => {
    const handler = upload.single("image");
    handler(req, res, async (err) => {
        if (err) {
            return res.status(400).json({ status: "ERR", message: err.message });
        }
        try {
            if (req.file && req.file.buffer) {
                // Validate file type
                const allowedMimes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
                if (!allowedMimes.includes(req.file.mimetype)) {
                    return res.status(400).json({
                        status: "ERR",
                        message: "Image must be jpg, png or webp format",
                    });
                }

                // Upload với stream + optimization vào folder "news/content"
                const result = await uploadToCloudinary(req.file.buffer, "news/content");

                // Trả về URL và publicId để frontend sử dụng
                req.uploadedImage = {
                    url: result.secure_url,
                    publicId: result.public_id,
                };
            } else {
                return res.status(400).json({
                    status: "ERR",
                    message: "No image file was uploaded",
                });
            }
            return next();
        } catch (error) {
            return res.status(500).json({ status: "ERR", message: error.message });
        }
    });
};

module.exports.uploadNewsContentImage = uploadNewsContentImage;

// Middleware: Upload shop description image lên Cloudinary
const uploadShopDescriptionImage = (req, res, next) => {
    const handler = upload.single("image"); // Field name for description image
    handler(req, res, async (err) => {
        if (err) {
            return res.status(400).json({ status: "ERR", message: err.message });
        }
        try {
            if (req.file && req.file.buffer) {
                // Validate file type
                const allowedMimes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
                if (!allowedMimes.includes(req.file.mimetype)) {
                    return res.status(400).json({
                        status: "ERR",
                        message: "Image must be jpg, png or webp format",
                    });
                }

                // Upload với stream + optimization vào folder "shop/description"
                const result = await uploadToCloudinary(req.file.buffer, "shop/description");

                // Trả về URL và publicId để frontend sử dụng
                req.uploadedImage = {
                    url: result.secure_url,
                    publicId: result.public_id,
                };
            } else {
                return res.status(400).json({
                    status: "ERR",
                    message: "No image file was uploaded",
                });
            }
            return next();
        } catch (error) {
            return res.status(500).json({ status: "ERR", message: error.message });
        }
    });
};

module.exports.uploadShopDescriptionImage = uploadShopDescriptionImage;

// Middleware: Upload nhiều ảnh shop lên Cloudinary
const uploadShopImages = (req, res, next) => {
    const handler = upload.array("images", 20); // Allow up to 20 images
    handler(req, res, async (err) => {
        if (err) {
            console.error(`❌ Multer error:`, err);
            return res.status(400).json({ status: "ERR", message: err.message });
        }
        try {
            // ✅ Tự động lấy danh sách ảnh cũ từ database
            let oldImagesFromDB = [];
            let oldImagePublicIdsFromDB = [];
            
            try {
                const ShopModel = require("../models/ShopModel");
                const shop = await ShopModel.findOne().select("images imagePublicIds");
                if (shop) {
                    oldImagesFromDB = Array.isArray(shop.images) ? shop.images : [];
                    oldImagePublicIdsFromDB = Array.isArray(shop.imagePublicIds) ? shop.imagePublicIds : [];
                }
            } catch (err) {
                console.warn("Không thể lấy ảnh cũ từ database:", err.message);
            }
            
            // Lấy danh sách ảnh cũ từ body (nếu frontend gửi - ưu tiên hơn DB)
            let existingImages = [];
            let existingImagePublicIds = [];
            
            // Parse existingImages và existingImagePublicIds từ body
            if (req.body.existingImages) {
                try {
                    existingImages = typeof req.body.existingImages === 'string' 
                        ? JSON.parse(req.body.existingImages) 
                        : req.body.existingImages;
                } catch (e) {
                    existingImages = Array.isArray(req.body.existingImages) ? req.body.existingImages : [];
                }
            }
            
            if (req.body.existingImagePublicIds) {
                try {
                    existingImagePublicIds = typeof req.body.existingImagePublicIds === 'string'
                        ? JSON.parse(req.body.existingImagePublicIds)
                        : req.body.existingImagePublicIds;
                } catch (e) {
                    existingImagePublicIds = Array.isArray(req.body.existingImagePublicIds) ? req.body.existingImagePublicIds : [];
                }
            }
            
            // Nếu frontend không gửi, dùng ảnh cũ từ database
            if (existingImages.length === 0 && oldImagesFromDB.length > 0) {
                existingImages = oldImagesFromDB;
            }
            if (existingImagePublicIds.length === 0 && oldImagePublicIdsFromDB.length > 0) {
                existingImagePublicIds = oldImagePublicIdsFromDB;
            }
            
            // ✅ Validate file types (BR-22: jpg, png, webp only)
            if (Array.isArray(req.files) && req.files.length > 0) {
                const allowedMimes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
                for (const file of req.files) {
                    if (!allowedMimes.includes(file.mimetype)) {
                        return res.status(400).json({
                            status: "ERR",
                            message: "Only valid image files are allowed (jpg, png, webp)",
                        });
                    }
                    // BR-23: Check file size (5MB limit from multer config)
                    if (file.size > 5 * 1024 * 1024) {
                        return res.status(400).json({
                            status: "ERR",
                            message: `File size of ${file.originalname} exceeds 5MB`,
                        });
                    }
                }
            }
            
            // ✅ Xử lý file upload thực tế - Upload song song với stream + optimization
            if (Array.isArray(req.files) && req.files.length > 0) {
                // Upload tất cả ảnh song song với stream (nhanh hơn base64)
                const uploads = req.files.map((file) => 
                    uploadToCloudinary(file.buffer, "shop")
                );
                
                const results = await Promise.all(uploads);
                const newImages = results.map((r) => r.secure_url);
                const newImagePublicIds = results.map((r) => r.public_id);
                
                // Merge ảnh cũ (giữ lại) và ảnh mới
                const finalImages = [...existingImages, ...newImages];
                const finalImagePublicIds = [...existingImagePublicIds, ...newImagePublicIds];
                
                // ✅ Tự động xóa ảnh cũ không còn trong danh sách mới
                const allOldImagePublicIds = oldImagePublicIdsFromDB.length > 0 
                    ? oldImagePublicIdsFromDB 
                    : existingImagePublicIds;
                
                if (allOldImagePublicIds.length > 0) {
                    const imagesToDelete = allOldImagePublicIds.filter(
                        oldId => !finalImagePublicIds.includes(oldId)
                    );
                    
                    // Xóa ảnh cũ trên Cloudinary (chạy song song, không block)
                    if (imagesToDelete.length > 0) {
                        console.log(`🗑️ Xóa ${imagesToDelete.length} ảnh cũ không còn trong danh sách mới`);
                        Promise.all(
                            imagesToDelete.map(publicId => 
                                cloudinary.uploader.destroy(publicId).catch(err => {
                                    console.warn(`Không thể xóa ảnh ${publicId} trên Cloudinary:`, err.message);
                                })
                            )
                        ).catch(err => {
                            console.warn("Lỗi khi xóa ảnh cũ:", err.message);
                        });
                    }
                }
                
                req.body.images = finalImages;
                req.body.imagePublicIds = finalImagePublicIds;
            } else {
                // Không có file mới upload
                // Nếu frontend gửi trực tiếp images và imagePublicIds trong body (không qua file upload)
                if (req.body.images !== undefined || req.body.imagePublicIds !== undefined) {
                    // Parse nếu là JSON string (từ form-data)
                    let imagesArray = req.body.images;
                    let imagePublicIdsArray = req.body.imagePublicIds;
                    
                    if (typeof imagesArray === 'string') {
                        try {
                            imagesArray = JSON.parse(imagesArray);
                        } catch (e) {
                            imagesArray = [];
                        }
                    }
                    
                    if (typeof imagePublicIdsArray === 'string') {
                        try {
                            imagePublicIdsArray = JSON.parse(imagePublicIdsArray);
                        } catch (e) {
                            imagePublicIdsArray = [];
                        }
                    }
                    
                    // Frontend đang gửi trực tiếp arrays (có thể là để xóa tất cả ảnh)
                    req.body.images = Array.isArray(imagesArray) ? imagesArray : [];
                    req.body.imagePublicIds = Array.isArray(imagePublicIdsArray) ? imagePublicIdsArray : [];
                } else {
                    // Giữ nguyên ảnh cũ (nếu có)
                    req.body.images = existingImages;
                    req.body.imagePublicIds = existingImagePublicIds;
                }
            }
            
            return next();
        } catch (error) {
            console.error(`❌ Upload middleware error:`, error);
            console.error(`❌ Error stack:`, error.stack);
            return res.status(500).json({ status: "ERR", message: error.message });
        }
    });
};

module.exports.uploadShopImages = uploadShopImages;

// Middleware: Upload single shop image (for editor or gallery)
const uploadShopImage = (req, res, next) => {
    const handler = upload.single("image");
    handler(req, res, async (err) => {
        if (err) {
            return res.status(400).json({ status: "ERR", message: err.message });
        }
        try {
            if (req.file && req.file.buffer) {
                // Validate file type
                const allowedMimes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
                if (!allowedMimes.includes(req.file.mimetype)) {
                    return res.status(400).json({
                        status: "ERR",
                        message: "Image must be jpg, png or webp format",
                    });
                }

                // BR-23: Check file size (5MB limit)
                if (req.file.size > 5 * 1024 * 1024) {
                    return res.status(400).json({
                        status: "ERR",
                        message: "File size exceeds 5MB",
                    });
                }

                // Upload với stream + optimization vào folder "shop"
                const result = await uploadToCloudinary(req.file.buffer, "shop");

                // Trả về URL và publicId để frontend sử dụng
                req.uploadedImage = {
                    url: result.secure_url,
                    publicId: result.public_id,
                };
            } else {
                return res.status(400).json({
                    status: "ERR",
                    message: "No image file was uploaded",
                });
            }
            return next();
        } catch (error) {
            return res.status(500).json({ status: "ERR", message: error.message });
        }
    });
};

module.exports.uploadShopImage = uploadShopImage;

// Middleware: Upload homepage asset image lên Cloudinary
const uploadHomepageAssetImage = (req, res, next) => {
    const handler = upload.single("image");
    handler(req, res, async (err) => {
        if (err) {
            return res.status(400).json({ status: "ERR", message: err.message });
        }
        try {
            if (req.file && req.file.buffer) {
                // Validate file type
                const allowedMimes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
                if (!allowedMimes.includes(req.file.mimetype)) {
                    return res.status(400).json({
                        status: "ERR",
                        message: "Image must be jpg, png or webp format",
                    });
                }

                // Check file size (5MB limit)
                if (req.file.size > 5 * 1024 * 1024) {
                    return res.status(400).json({
                        status: "ERR",
                        message: "File size exceeds 5MB",
                    });
                }

                // Upload với stream + optimization vào folder "homepage"
                const result = await uploadToCloudinary(req.file.buffer, "homepage");

                // Trả về URL và publicId để frontend sử dụng
                req.uploadedImage = {
                    url: result.secure_url,
                    publicId: result.public_id,
                };
            } else {
                return res.status(400).json({
                    status: "ERR",
                    message: "No image file was uploaded",
                });
            }
            return next();
        } catch (error) {
            return res.status(500).json({ status: "ERR", message: error.message });
        }
    });
};

module.exports.uploadHomepageAssetImage = uploadHomepageAssetImage;