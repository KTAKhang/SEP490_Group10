function getPredictUrl() {
  const base = process.env.AI_FRUIT_PREDICT_URL || "http://127.0.0.1:5000/predict";
  return base.replace(/\/$/, "");
}

/**
 * @param {Buffer} imageBuffer
 * @param {string} [filename]
 * @returns {Promise<{ ok: boolean, data?: object, error?: string }>}
 */
async function predictFruit(imageBuffer, filename = "fruit.jpg") {
  const url = getPredictUrl();
  try {
    const blob = new Blob([imageBuffer], { type: "image/jpeg" });
    const form = new FormData();
    form.append("file", blob, filename);

    const res = await fetch(url, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(120000),
    });

    if (!res.ok) {
      let errBody = "";
      try {
        errBody = await res.text();
      } catch (_) {
        /* ignore */
      }
      return { ok: false, error: errBody || res.statusText || `HTTP ${res.status}` };
    }

    const data = await res.json();

    const className = data.class_name ?? data.className;
    const confidenceRaw = data.confidence;
    const confidence =
      typeof confidenceRaw === "number"
        ? confidenceRaw
        : parseFloat(confidenceRaw);

    const top3Raw = Array.isArray(data.top3) ? data.top3 : [];
    const top3 = top3Raw.map((item) => ({
      class_name: item.class_name ?? item.label ?? "",
      confidence:
        typeof item.confidence === "number"
          ? item.confidence
          : parseFloat(item.confidence ?? item.score ?? 0),
    }));

    if (className === undefined || className === null || Number.isNaN(confidence)) {
      return { ok: false, error: "Invalid AI server response shape" };
    }

    return {
      ok: true,
      data: {
        class_id: data.class_id,
        class_name: String(className),
        confidence,
        image_url: data.image_url,
        top3,
      },
    };
  } catch (err) {
    const msg = err?.message || "AI fruit server request failed";
    return { ok: false, error: String(msg) };
  }
}

module.exports = {
  predictFruit,
  getPredictUrl,
};
