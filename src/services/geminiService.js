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
  const base = `You are an expert in food and nutrition for a fruit shop in Vietnam.
Context: the customer just scanned an image; the AI identified the fruit as: "${displayFruit}" (model label; may be English or snake_case).
${shopLine}
Write in English only, clear, friendly, and practical.`;

  if (topic === "nutrition") {
    return `${base}

Task: ONLY write the nutrition value of this fruit.
- Start with the heading: ## Nutrition Facts
- Mention vitamins, minerals, fiber, water, and natural sugars (if applicable) with a short role/benefit for each group.
- You may estimate approximate serving size / calories if it helps.
- Do NOT include any recipes in this section.`;
  }

  if (topic === "health") {
    return `${base}

Task: ONLY write health benefits.
- Start with the heading: ## Health Benefits
- Provide 4–7 short, practical bullet points.
- Do NOT diagnose diseases, do NOT claim to cure, do NOT replace medical treatment, and do NOT advise stopping prescribed treatment.`;
  }

  if (topic === "recipes") {
    return `${base}

Task: ONLY write recipe ideas / formulas.
- Start with the heading: ## Recipe Ideas & Formulas
- Provide at least 2 different meals or drinks (suitable for common Vietnamese or widely-known international cuisine).
- For EACH option: give the dish name; ingredients with specific quantities (e.g., 1 fruit, 2 tbsp, 200 ml); and 4–8 short steps.
- Prefer ingredients that are easy to buy in Vietnam.`;
  }

  return `${base}\nAnswer briefly.`;
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
      ? `This shop currently sells a related product: "${productName}". You may mention it once in the opening as a subtle reference, but do not advertise excessively.`
      : `This fruit is not currently listed by the shop. Still provide complete advice based on what the customer selected.`;

  const instruction = buildTopicInstruction(topic, displayFruit, shopLine);
  return executeGeminiInstruction(instruction);
}

module.exports = {
  generateFruitTopicAdvice,
  getApiKey,
  FRUIT_GEMINI_TOPICS: TOPICS,
};
