const axios = require("axios");

const LIST_MODELS_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const MODELS_CACHE_MS = parseInt(process.env.GEMINI_MODELS_CACHE_MS || "3600000", 10);

/** Sau khi gọi thành công, lần sau thử model này trước (giảm latency). */
let lastWorkingModelId = null;

let modelsListCache = { at: 0, ids: null };

const TOPICS = /** @type {const} */ (["nutrition", "recipes", "health"]);

function shortenGeminiError(raw) {
  const s = String(raw || "");
  const lower = s.toLowerCase();
  if (
    lower.includes("quota") ||
    lower.includes("resource_exhausted") ||
    lower.includes("exceeded your current quota") ||
    lower.includes("generate_content_free_limit")
  ) {
    return (
      "Gemini free quota exceeded. Enable billing in Google AI Studio / Cloud Console or wait for quota reset."
    );
  }
  if (lower.includes("not found") && lower.includes("model")) {
    return (
      "Gemini model not found (API name may have changed). Leave GEMINI_MODEL unset so the server picks from ListModels."
    );
  }
  if (s.length > 280) {
    return `${s.slice(0, 240)}…`;
  }
  return s;
}

function getApiKey() {
  const key = process.env.GEMINI_API_KEY;
  if (!key || !String(key).trim()) {
    return null;
  }
  return String(key).trim();
}

async function fetchAvailableGenerateModelIds(apiKey) {
  const now = Date.now();
  if (modelsListCache.ids && now - modelsListCache.at < MODELS_CACHE_MS) {
    return modelsListCache.ids;
  }

  const ids = [];
  let pageToken = null;
  let pages = 0;
  const maxPages = 8;

  do {
    pages += 1;
    const params = { key: apiKey, pageSize: 100 };
    if (pageToken) params.pageToken = pageToken;

    const { data } = await axios.get(LIST_MODELS_URL, {
      params,
      timeout: 25000,
    });

    const models = data.models || [];
    for (const m of models) {
      if (!m.name) continue;
      const methods = m.supportedGenerationMethods;
      if (!Array.isArray(methods) || !methods.includes("generateContent")) continue;
      ids.push(m.name.replace(/^models\//, ""));
    }

    pageToken = data.nextPageToken || null;
  } while (pageToken && pages < maxPages);

  modelsListCache = { at: now, ids };
  return ids;
}

function buildOrderedCandidates(availableIds) {
  const set = new Set(availableIds);
  const ordered = [];

  const preference = [
    "gemini-2.5-flash-preview-05-20",
    "gemini-2.5-flash",
    "gemini-2.0-flash",
    "gemini-2.0-flash-001",
    "gemini-2.0-flash-lite",
    "gemini-2.0-flash-lite-001",
    "gemini-1.5-flash-8b",
    "gemini-1.5-flash-8b-latest",
    "gemini-1.5-flash-latest",
    "gemini-1.5-flash-002",
    "gemini-1.5-flash-001",
    "gemini-1.5-flash",
    "gemini-1.5-pro-latest",
    "gemini-1.5-pro-002",
    "gemini-1.5-pro",
    "gemini-pro",
  ];

  for (const p of preference) {
    if (set.has(p) && !ordered.includes(p)) ordered.push(p);
  }

  for (const id of availableIds) {
    if (ordered.includes(id)) continue;
    if (!/^gemini/i.test(id)) continue;
    if (id.includes("embedding") || id.includes("aqa") || id.includes("gecko")) continue;
    ordered.push(id);
  }

  return ordered;
}

function shouldTryNextModel(err) {
  const status = err.response?.status;
  const msg = String(err.response?.data?.error?.message || err.message || "").toLowerCase();
  if (status === 404) return true;
  if (/not found|not supported for generatecontent|is not supported/.test(msg)) return true;
  if (status === 429 || /quota|resource_exhausted|rate limit/.test(msg)) return true;
  return false;
}

async function generateContentOnce(apiKey, modelId, instruction) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent`;
  const { data } = await axios.post(
    url,
    {
      contents: [{ role: "user", parts: [{ text: instruction }] }],
      generationConfig: {
        temperature: 0.55,
        maxOutputTokens: 2048,
      },
    },
    {
      params: { key: apiKey },
      headers: { "Content-Type": "application/json" },
      timeout: 90000,
    }
  );

  const parts = data?.candidates?.[0]?.content?.parts;
  const text = Array.isArray(parts)
    ? parts.map((p) => p.text || "").join("\n").trim()
    : "";
  return text;
}

async function executeGeminiInstruction(instruction) {
  const apiKey = getApiKey();
  if (!apiKey) {
    return {
      ok: false,
      text: "",
      error: "GEMINI_API_KEY is not configured",
    };
  }

  const envModel = process.env.GEMINI_MODEL && String(process.env.GEMINI_MODEL).trim();

  const candidates = [];
  const push = (id) => {
    if (id && !candidates.includes(id)) candidates.push(id);
  };

  if (lastWorkingModelId) push(lastWorkingModelId);
  if (envModel) push(envModel);

  try {
    const available = await fetchAvailableGenerateModelIds(apiKey);
    if (!available.length) {
      return {
        ok: false,
        text: "",
        error:
          "Gemini: no models returned for this API key (enable Generative Language API).",
      };
    }
    for (const id of buildOrderedCandidates(available)) {
      push(id);
    }
  } catch (listErr) {
    modelsListCache = { at: 0, ids: null };
    const fallback = [
      "gemini-2.0-flash",
      "gemini-2.0-flash-001",
      "gemini-1.5-flash-latest",
      "gemini-1.5-flash-8b",
      "gemini-1.5-pro-latest",
    ];
    if (envModel) push(envModel);
    fallback.forEach(push);
    if (!candidates.length) {
      return {
        ok: false,
        text: "",
        error: shortenGeminiError(listErr.response?.data?.error?.message || listErr.message),
      };
    }
  }

  let lastRawError = null;

  for (const modelId of candidates) {
    try {
      const text = await generateContentOnce(apiKey, modelId, instruction);
      if (!text) {
        lastRawError = new Error("Empty Gemini response");
        continue;
      }
      lastWorkingModelId = modelId;
      return { ok: true, text, error: null, modelUsed: modelId };
    } catch (err) {
      lastRawError = err;
      if (shouldTryNextModel(err)) {
        continue;
      }
      break;
    }
  }

  const raw =
    lastRawError?.response?.data?.error?.message ||
    lastRawError?.message ||
    "Gemini request failed";
  return { ok: false, text: "", error: shortenGeminiError(raw) };
}

function buildTopicInstruction(topic, displayFruit, shopLine) {
  const base = `Bạn là chuyên gia ẩm thực & dinh dưỡng cho cửa hàng trái cây tại Việt Nam.
Ngữ cảnh: khách vừa quét ảnh; AI nhận diện trái: "${displayFruit}" (tên từ model, có thể là tiếng Anh/snake_case).
${shopLine}
Viết hoàn toàn bằng tiếng Việt, rõ ràng, thân thiện.`;

  if (topic === "nutrition") {
    return `${base}

Nhiệm vụ: CHỈ viết phần giá trị dinh dưỡng của trái này.
- Bắt đầu bằng tiêu đề ## Giá trị dinh dưỡng
- Nêu vitamin, khoáng chất, chất xơ, nước, đường tự nhiên (nếu có) và vai trò tóm tắt.
- Có thể ước lượng khẩu phần / năng lượng đại khái nếu phù hợp.
- Không viết công thức món ăn ở phần này.`;
  }

  if (topic === "health") {
    return `${base}

Nhiệm vụ: CHỈ viết lợi ích sức khỏe.
- Bắt đầu bằng tiêu đề ## Lợi ích sức khỏe
- 4–7 ý ngắn, thực tế.
- KHÔNG chẩn đoán bệnh, KHÔNG hứa chữa bệnh, KHÔNG thay thuốc, KHÔNG khuyên ngừng điều trị.`;
  }

  if (topic === "recipes") {
    return `${base}

Nhiệm vụ: CHỈ viết gợi ý món ăn / đồ uống và công thức.
- Bắt đầu bằng tiêu đề ## Gợi ý món & công thức
- Đưa ÍT NHẤT 2 món hoặc đồ uống khác nhau (phù hợp ẩm thực Việt hoặc quốc tế phổ biến).
- Với MỖI món: tên món; nguyên liệu có SỐ LƯỢNG cụ thể (vd: 1 quả, 2 thìa canh, 200 ml); cách làm 4–8 bước ngắn.
- Ưu tiên nguyên liệu dễ mua tại VN.`;
  }

  return `${base}\nTrả lời ngắn gọn.`;
}

/**
 * @param {object} opts
 * @param {"nutrition"|"recipes"|"health"} opts.topic
 * @param {string} opts.fruitLabelEn
 * @param {boolean} opts.inStock
 * @param {string} [opts.productName]
 */
async function generateFruitTopicAdvice({ topic, fruitLabelEn, inStock, productName }) {
  if (!TOPICS.includes(topic)) {
    return { ok: false, text: "", error: "Invalid topic" };
  }

  const displayFruit = (fruitLabelEn || "fruit").replace(/_/g, " ");
  const shopLine =
    inStock && productName
      ? `Cửa hàng đang bán sản phẩm: "${productName}" (có thể nhắc nhẹ một lần trong phần mở đầu, không quảng cáo quá đà).`
      : `Trái này hiện không có trong cửa hàng; vẫn tư vấn đầy đủ theo chủ đề khách chọn.`;

  const instruction = buildTopicInstruction(topic, displayFruit, shopLine);
  return executeGeminiInstruction(instruction);
}

module.exports = {
  generateFruitTopicAdvice,
  getApiKey,
  FRUIT_GEMINI_TOPICS: TOPICS,
};
