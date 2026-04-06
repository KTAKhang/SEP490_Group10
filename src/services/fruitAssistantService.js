const crypto = require("crypto");
const { Readable } = require("stream");
const sharp = require("sharp");
const cloudinary = require("../config/cloudinaryConfig");
const { getSearchKeywords } = require("./fruitNameMapService");
const { predictFruit } = require("./aiFruitServerService");
const { FRUIT_GEMINI_TOPICS, generateFruitTopicAdvice } = require("./geminiService");
const PublicProductService = require("./PublicProductService");

const CACHE_TTL_MS = parseInt(process.env.FRUIT_AI_CACHE_TTL_MS || "600000", 10);
const recognitionCache = new Map();

function cacheGet(key) {
  const row = recognitionCache.get(key);
  if (!row) return null;
  if (Date.now() > row.expires) {
    recognitionCache.delete(key);
    return null;
  }
  return row.value;
}

function cacheSet(key, value) {
  recognitionCache.set(key, { value, expires: Date.now() + CACHE_TTL_MS });
}

function uploadResizedToCloudinary(buffer) {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: "fruit_ai_scan",
        resource_type: "image",
        overwrite: true,
        use_filename: false,
        unique_filename: true,
      },
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    );
    Readable.from(buffer).pipe(uploadStream);
  });
}

async function resizeForModel(buffer) {
  return sharp(buffer)
    .rotate()
    .resize(160, 160, { fit: "cover" })
    .jpeg({ quality: 92 })
    .toBuffer();
}

/**
 * @param {Buffer} originalBuffer
 * @param {string} [mimetype]
 */
async function analyzeFruitImage(originalBuffer, mimetype = "") {
  if (!originalBuffer || !Buffer.isBuffer(originalBuffer) || originalBuffer.length === 0) {
    return {
      status: "ERR",
      phase: "error",
      message: "Image file is required",
    };
  }

  let resized;
  try {
    resized = await resizeForModel(originalBuffer);
  } catch (e) {
    return {
      status: "ERR",
      phase: "error",
      message: "Could not process image. Please upload a valid image file.",
    };
  }

  const cacheKey = `${crypto.createHash("sha256").update(resized).digest("hex")}:v2-followup`;
  const cached = cacheGet(cacheKey);
  if (cached) {
    return { ...cached, cached: true };
  }

  let cloudinaryResult;
  try {
    cloudinaryResult = await uploadResizedToCloudinary(resized);
  } catch (e) {
    return {
      status: "ERR",
      phase: "error",
      message: e.message || "Cloudinary upload failed",
    };
  }

  const predictResult = await predictFruit(resized, "fruit.jpg");
  if (!predictResult.ok) {
    const errPayload = {
      status: "ERR",
      phase: "error",
      message: predictResult.error || "AI recognition failed",
      data: { cloudinaryUrl: cloudinaryResult.secure_url },
    };
    return errPayload;
  }

  const { class_name: className, confidence, top3, class_id, image_url: aiImageUrl } =
    predictResult.data;
//Set confidence threshold at 70% to ensure reasonable accuracy. This can be adjusted based on testing and requirements.
  if (typeof confidence !== "number" || confidence < 70) {
    const payload = {
      status: "OK",
      phase: "low_confidence",
      message:
        "Sorry, I couldn't confidently recognize this fruit. Please try again.",
      data: {
        recognition: {
          class_id,
          class_name: className,
          confidence,
          top3,
          cloudinaryUrl: cloudinaryResult.secure_url,
          aiImageUrl: aiImageUrl || null,
        },
      },
      cached: false,
    };
    cacheSet(cacheKey, payload);
    return payload;
  }

  const { keywords, startPatterns } = getSearchKeywords(className);
  const searchResult = await PublicProductService.searchProductsByKeywords(keywords, {
    limit: 12,
    patterns: startPatterns,
  });
  if (searchResult.status === "ERR") {
    return {
      status: "ERR",
      phase: "error",
      message: searchResult.message,
      data: {
        recognition: {
          class_id,
          class_name: className,
          confidence,
          top3,
          cloudinaryUrl: cloudinaryResult.secure_url,
        },
      },
    };
  }

  const products = searchResult.data || [];
  const inStock = products.length > 0;
  const primaryProduct = inStock ? products[0] : null;

  const geminiContext = {
    fruitLabelEn: className,
    inStock,
    productName: primaryProduct?.name || null,
  };

  let payload;
  if (!inStock) {
    payload = {
      status: "OK",
      phase: "success",
      productAvailable: false,
      message: "This fruit is currently not available in our shop.",
      data: {
        recognition: {
          class_id,
          class_name: className,
          confidence,
          top3,
          cloudinaryUrl: cloudinaryResult.secure_url,
          aiImageUrl: aiImageUrl || null,
        },
        products: [],
        geminiFollowUp: {
          topics: [...FRUIT_GEMINI_TOPICS],
          context: geminiContext,
        },
      },
      cached: false,
    };
  } else {
    payload = {
      status: "OK",
      phase: "success",
      productAvailable: true,
      data: {
        recognition: {
          class_id,
          class_name: className,
          confidence,
          top3,
          cloudinaryUrl: cloudinaryResult.secure_url,
          aiImageUrl: aiImageUrl || null,
        },
        products: products.map((p) => ({
          _id: p._id,
          name: p.name,
          price: p.price,
          effectivePrice: p.effectivePrice,
          featuredImage: p.featuredImage,
          productUrl: `/products/${p._id}`,
        })),
        geminiFollowUp: {
          topics: [...FRUIT_GEMINI_TOPICS],
          context: geminiContext,
        },
      },
      cached: false,
    };
  }

  cacheSet(cacheKey, payload);
  return payload;
}

/**
 * @param {{ topic: string, fruitLabelEn: string, inStock?: boolean, productName?: string|null }} body
 */
async function generateGeminiTopicPayload(body = {}) {
  const topic = body.topic;
  const fruitLabelEn = body.fruitLabelEn;
  if (!FRUIT_GEMINI_TOPICS.includes(topic)) {
    return { status: "ERR", message: "Invalid topic. Use nutrition, recipes, or health." };
  }
  const label = fruitLabelEn != null ? String(fruitLabelEn).trim() : "";
  if (!label || label.length > 120) {
    return { status: "ERR", message: "Invalid fruitLabelEn" };
  }
  const nameRaw = body.productName;
  const productName =
    nameRaw != null && String(nameRaw).trim()
      ? String(nameRaw).trim().slice(0, 200)
      : undefined;

  const result = await generateFruitTopicAdvice({
    topic,
    fruitLabelEn: label,
    inStock: !!body.inStock,
    productName,
  });

  if (!result.ok) {
    return { status: "ERR", message: result.error || "Gemini request failed" };
  }
  return {
    status: "OK",
    data: { topic, text: result.text },
  };
}

module.exports = {
  analyzeFruitImage,
  generateGeminiTopicPayload,
};
