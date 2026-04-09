const multer = require("multer");
const cloudinary = require("../config/cloudinaryConfig");
const { Readable } = require("stream");
const sharp = require("sharp");
const CategoryModel = require("../models/CategoryModel");
const ProductModel = require("../models/ProductModel");
const FruitTypeModel = require("../models/FruitTypeModel");
const ReviewModel = require("../models/ReviewModel");


// Use memory storage to receive multipart/form-data files
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
});

// Single, clear error message for invalid file type (avoid duplicate or vague messages)
const ALLOWED_IMAGE_MIMES = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"];
const IMAGE_FILE_TYPE_ERROR = "Only image files are allowed (jpg, png, webp, gif). Documents and other file types are not accepted.";

// Helper: Resize and compress image before upload (significantly reduces file size)
const optimizeImage = async (buffer) => {
    try {
        // Resize image to max 1920x1920 (keep aspect ratio), compress at quality 85
        // Convert to WebP when possible (30-50% smaller than JPEG/PNG)
        const optimized = await sharp(buffer)
            .resize(1920, 1920, {
                fit: 'inside', // Keep aspect ratio, no crop
                withoutEnlargement: true, // Do not upscale small images
            })
            .webp({ quality: 85 }) // Convert to WebP at quality 85 (good quality, smaller files)
            .toBuffer();
        
        return optimized;
    } catch (error) {
        // If optimization fails (e.g. non-image input), return original buffer
        console.warn("Could not optimize image, using original buffer:", error.message);
        return buffer;
    }
};

// Helper: Upload file to Cloudinary using optimization and stream (faster than base64)
const uploadToCloudinary = async (buffer, folder, options = {}) => {
    // Optimize image first (resize + compress) - significantly reduce file size
    const optimizedBuffer = await optimizeImage(buffer);
    
    return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
            {
                folder: folder,
                resource_type: "image",
                // Cloudinary applies additional optimization
                quality: "auto",
                fetch_format: "auto",
                ...options,
            },
            (error, result) => {
                if (error) return reject(error);
                resolve(result);
            }
        );

        // Upload optimized buffer stream (much faster)
        const bufferStream = new Readable();
        bufferStream.push(optimizedBuffer);
        bufferStream.push(null);
        bufferStream.pipe(uploadStream);
    });
};

// Middleware: Upload category image to Cloudinary when 'image' file exists
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
                // ✅ Auto-load old image from database for update flow (req.params.id)
                let oldImagePublicId = null;
                if (req.params && req.params.id) {
                    try {
                        const category = await CategoryModel.findById(req.params.id).select("imagePublicId");
                        if (category && category.imagePublicId) {
                            oldImagePublicId = category.imagePublicId;
                            console.log(`📸 Found old image from database: ${oldImagePublicId}`);
                        }
                    } catch (err) {
                        // Ignore not-found/errors (may be a create flow)
                        console.warn("Could not load old image from database:", err.message);
                    }
                }
                
                // If DB has no old image, read from body (frontend may send it)
                if (!oldImagePublicId) {
                    oldImagePublicId = req.body.oldImagePublicId || req.body.imagePublicId;
                }
                
                // Upload using stream (faster than base64) + optimization
                const result = await uploadToCloudinary(req.file.buffer, "categories");
                req.body.image = result.secure_url;
                req.body.imagePublicId = result.public_id;
                
                // ✅ Auto-delete old image when a different new image is uploaded
                if (oldImagePublicId && oldImagePublicId !== result.public_id) {
                    console.log(`🗑️ Deleting old category image: ${oldImagePublicId}`);
                    cloudinary.uploader.destroy(oldImagePublicId).catch(err => {
                        console.warn(`Could not delete old image ${oldImagePublicId} on Cloudinary:`, err.message);
                    });
                } else if (oldImagePublicId && oldImagePublicId === result.public_id) {
                    console.log(`ℹ️ New image matches old image, no deletion needed`);
                }
            }
            return next();
        } catch (error) {
            return res.status(500).json({ status: "ERR", message: error.message });
        }
    });
};

// Middleware: Upload FruitType (pre-order) image to Cloudinary when 'image' file exists (single - legacy)
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
                        console.warn("Could not load old FruitType image:", e.message);
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
                        console.warn("Could not delete old FruitType image:", e.message)
                    );
                }
            }
            return next();
        } catch (error) {
            return res.status(500).json({ status: "ERR", message: error.message });
        }
    });
};

// Middleware: Upload multiple FruitType (pre-order) images to Cloudinary - field "images" (max 10)
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

// Middleware: Upload multiple product images to Cloudinary when field 'images' exists
const uploadProductImages = (req, res, next) => {
    const handler = upload.array("images", 10);
    handler(req, res, async (err) => {
        if (err) {
            console.error(`❌ Multer error:`, err);
            return res.status(400).json({ status: "ERR", message: err.message });
        }
        try {
            // ✅ Auto-load old image list from database for update flow (req.params.id)
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
                    // Ignore not-found/errors (may be a create flow)
                    console.warn("Could not load old image from database:", err.message);
                }
            }
            
            // Get old image list from body (if provided - higher priority than DB). [] = "do not keep old images".
            let existingImages = [];
            let existingImagePublicIds = [];
            
            // Parse existingImages and existingImagePublicIds from body (JSON string or array)
            if (req.body.existingImages !== undefined) {
                try {
                    existingImages = typeof req.body.existingImages === 'string'
                        ? JSON.parse(req.body.existingImages)
                        : req.body.existingImages;
                } catch (e) {
                    existingImages = Array.isArray(req.body.existingImages) ? req.body.existingImages : [];
                }
                existingImages = Array.isArray(existingImages) ? existingImages : [];
            }
            if (req.body.existingImagePublicIds !== undefined) {
                try {
                    existingImagePublicIds = typeof req.body.existingImagePublicIds === 'string'
                        ? JSON.parse(req.body.existingImagePublicIds)
                        : req.body.existingImagePublicIds;
                } catch (e) {
                    existingImagePublicIds = Array.isArray(req.body.existingImagePublicIds) ? req.body.existingImagePublicIds : [];
                }
                existingImagePublicIds = Array.isArray(existingImagePublicIds) ? existingImagePublicIds : [];
            }
            // Use old DB images only when frontend does NOT send existingImages/existingImagePublicIds (backward compatibility).
            // If frontend sends explicit values (including [] = "remove all old images, keep only new"), do not override from DB.
            const didSendExisting = req.body.existingImages !== undefined || req.body.existingImagePublicIds !== undefined;
            if (!didSendExisting && req.params && req.params.id) {
                if (oldImagesFromDB.length > 0) existingImages = oldImagesFromDB;
                if (oldImagePublicIdsFromDB.length > 0) existingImagePublicIds = oldImagePublicIdsFromDB;
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

            // ✅ Actual upload flow - parallel upload with stream + optimization
            if (Array.isArray(req.files) && req.files.length > 0) {
                // Upload all images in parallel using stream (faster than base64)
                const uploads = req.files.map((file) => 
                    uploadToCloudinary(file.buffer, "products")
                );
                
                const results = await Promise.all(uploads);
                const newImages = results.map((r) => r.secure_url);
                const newImagePublicIds = results.map((r) => r.public_id);
                
                // Merge old images (kept) and newly uploaded images
                const finalImages = [...existingImages, ...newImages];
                const finalImagePublicIds = [...existingImagePublicIds, ...newImagePublicIds];
                
                // ✅ Auto-delete old images no longer present in final list
                // Compare old DB images with final list (kept old + new images)
                // If any old image is missing from final list -> delete on Cloudinary
                const allOldImagePublicIds = oldImagePublicIdsFromDB.length > 0 
                    ? oldImagePublicIdsFromDB 
                    : existingImagePublicIds;
                
                if (allOldImagePublicIds.length > 0) {
                    const imagesToDelete = allOldImagePublicIds.filter(
                        oldId => !finalImagePublicIds.includes(oldId)
                    );
                    
                    // Delete old images on Cloudinary (parallel, non-blocking)
                    if (imagesToDelete.length > 0) {
                        console.log(`🗑️ Deleting ${imagesToDelete.length} old images not present in final list`);
                        Promise.all(
                            imagesToDelete.map(publicId => 
                                cloudinary.uploader.destroy(publicId).catch(err => {
                                    console.warn(`Could not delete image ${publicId} on Cloudinary:`, err.message);
                                })
                            )
                        ).catch(err => {
                            console.warn("Error while deleting old images:", err.message);
                        });
                    }
                }
                
                req.body.images = finalImages;
                req.body.imagePublicIds = finalImagePublicIds;
            } else {
                // No new files: keep old images (if any)
                if (existingImages.length > 0 || existingImagePublicIds.length > 0) {
                    req.body.images = existingImages;
                    req.body.imagePublicIds = existingImagePublicIds;
                }
                // If no old images and no new files, let service layer handle it (may remove all images)
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

// Middleware: Upload multiple review images to Cloudinary
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
                    console.warn("Could not load old image from database:", err.message);
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
                                    console.warn(`Could not delete image ${publicId} on Cloudinary:`, err.message);
                                })
                            )
                        ).catch(err => {
                            console.warn("Error while deleting old images:", err.message);
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

// Middleware: Upload news thumbnail to Cloudinary
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

                // ✅ Auto-load old image from database during update (req.params.id)
                let oldThumbnailPublicId = null;
                if (req.params && req.params.id) {
                    try {
                        const NewsModel = require("../models/NewsModel");
                        const news = await NewsModel.findById(req.params.id).select("thumbnailPublicId");
                        if (news && news.thumbnailPublicId) {
                            oldThumbnailPublicId = news.thumbnailPublicId;
                        }
                    } catch (err) {
                        console.warn("Could not load old image from database:", err.message);
                    }
                }

                // If DB has no old image, read from body (frontend may send it)
                if (!oldThumbnailPublicId) {
                    oldThumbnailPublicId = req.body.oldThumbnailPublicId || req.body.thumbnailPublicId;
                }

                // Upload with stream + optimization
                const result = await uploadToCloudinary(req.file.buffer, "news");

                req.body.thumbnail_url = result.secure_url;
                req.body.thumbnailPublicId = result.public_id;

                // ✅ Auto-delete old image when a different new image is uploaded
                if (oldThumbnailPublicId && oldThumbnailPublicId !== result.public_id) {
                    cloudinary.uploader.destroy(oldThumbnailPublicId).catch((err) => {
                        console.warn(`Could not delete old image ${oldThumbnailPublicId} on Cloudinary:`, err.message);
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

// Middleware: Upload content image (used in HTML editor)
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

                // Upload with stream + optimization to "news/content"
                const result = await uploadToCloudinary(req.file.buffer, "news/content");

                // Return URL and publicId for frontend usage
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

// Middleware: Upload shop description image to Cloudinary
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

                // Upload with stream + optimization to "shop/description"
                const result = await uploadToCloudinary(req.file.buffer, "shop/description");

                // Return URL and publicId for frontend usage
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

// Middleware: Upload multiple shop images to Cloudinary
const uploadShopImages = (req, res, next) => {
    const handler = upload.array("images", 20); // Allow up to 20 images
    handler(req, res, async (err) => {
        if (err) {
            console.error(`❌ Multer error:`, err);
            return res.status(400).json({ status: "ERR", message: err.message });
        }
        try {
            // ✅ Auto-load old image list from database
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
                console.warn("Could not load old image from database:", err.message);
            }
            
            // Get old image list from body (if frontend sends it - higher priority than DB)
            let existingImages = [];
            let existingImagePublicIds = [];
            
            // Parse existingImages and existingImagePublicIds from body
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
            
            // If frontend does not send these values, use old images from database
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
            
            // ✅ Actual upload flow - parallel upload with stream + optimization
            if (Array.isArray(req.files) && req.files.length > 0) {
                // Upload all images in parallel using stream (faster than base64)
                const uploads = req.files.map((file) => 
                    uploadToCloudinary(file.buffer, "shop")
                );
                
                const results = await Promise.all(uploads);
                const newImages = results.map((r) => r.secure_url);
                const newImagePublicIds = results.map((r) => r.public_id);
                
                // Merge old images (kept) and newly uploaded images
                const finalImages = [...existingImages, ...newImages];
                const finalImagePublicIds = [...existingImagePublicIds, ...newImagePublicIds];
                
                // ✅ Auto-delete old images no longer present in final list
                const allOldImagePublicIds = oldImagePublicIdsFromDB.length > 0 
                    ? oldImagePublicIdsFromDB 
                    : existingImagePublicIds;
                
                if (allOldImagePublicIds.length > 0) {
                    const imagesToDelete = allOldImagePublicIds.filter(
                        oldId => !finalImagePublicIds.includes(oldId)
                    );
                    
                    // Delete old images on Cloudinary (parallel, non-blocking)
                    if (imagesToDelete.length > 0) {
                        console.log(`🗑️ Deleting ${imagesToDelete.length} old images not present in final list`);
                        Promise.all(
                            imagesToDelete.map(publicId => 
                                cloudinary.uploader.destroy(publicId).catch(err => {
                                    console.warn(`Could not delete image ${publicId} on Cloudinary:`, err.message);
                                })
                            )
                        ).catch(err => {
                            console.warn("Error while deleting old images:", err.message);
                        });
                    }
                }
                
                req.body.images = finalImages;
                req.body.imagePublicIds = finalImagePublicIds;
            } else {
                // No new files uploaded
                // If frontend sends images and imagePublicIds directly in body (without file upload)
                if (req.body.images !== undefined || req.body.imagePublicIds !== undefined) {
                    // Parse if it's a JSON string (from form-data)
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
                    
                    // Frontend is sending arrays directly (possibly to clear all images)
                    req.body.images = Array.isArray(imagesArray) ? imagesArray : [];
                    req.body.imagePublicIds = Array.isArray(imagePublicIdsArray) ? imagePublicIdsArray : [];
                } else {
                    // Keep old images as-is (if any)
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

                // Upload with stream + optimization to "shop"
                const result = await uploadToCloudinary(req.file.buffer, "shop");

                // Return URL and publicId for frontend usage
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

// Middleware: Upload homepage asset image to Cloudinary
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

                // Upload with stream + optimization to "homepage"
                const result = await uploadToCloudinary(req.file.buffer, "homepage");

                // Return URL and publicId for frontend usage
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

const uploadChatImages = (req, res, next) => {
  const handler = upload.array("images", 3); // max 3

  handler(req, res, async (err) => {
    if (err) {
      return res.status(400).json({
        status: "ERR",
        message: err.message,
      });
    }

    try {
      if (req.files && req.files.length > 0) {
        const uploads = req.files.map((file) =>
          uploadToCloudinary(file.buffer, "chat")
        );

        const results = await Promise.all(uploads);

        req.body.images = results.map((r) => r.secure_url);
        req.body.imagePublicIds = results.map((r) => r.public_id);
      } else {
        req.body.images = [];
        req.body.imagePublicIds = [];
      }

      next();
    } catch (error) {
      return res.status(500).json({
        status: "ERR",
        message: error.message,
      });
    }
  });
};

module.exports.uploadChatImages = uploadChatImages;

