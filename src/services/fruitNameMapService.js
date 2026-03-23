/**
 * Map English / snake_case class names from the fruit model to Vietnamese tokens
 * used in product names (regex substring search in DB).
 */
const VI_KEYWORDS_BY_CLASS = {
  abiu: ["vú sữa", "abiu"],
  acai: ["açaí", "acai"],
  acerola: ["sơ ri", "acerola"],
  ackee: ["ackee"],
  ambarella: ["cóc", "ambarella"],
  apple: ["táo", "apple"],
  apricot: ["mơ", "apricot"],
  avocado: ["bơ", "avocado"],
  banana: ["chuối", "banana"],
  barbadine: ["barbadine"],
  barberry: ["berberis"],
  bitter_gourd: ["khổ qua", "mướp đắng"],
  black_berry: ["mâm xôi đen", "blackberry"],
  black_mullberry: ["dâu tằm", "mulberry"],
  coconut: ["dừa", "coconut"],
  cranberry: ["nam việt quất", "cranberry"],
  custard_apple: ["mãng cầu", "na", "custard apple"],
  dragonfruit: ["thanh long", "dragon fruit", "dragonfruit"],
  durian: ["sầu riêng", "durian"],
  eggplant: ["cà tím", "eggplant"],
  feijoa: ["ổi dứa", "feijoa"],
  fig: ["sung", "fig"],
  grape: ["nho", "grape"],
  grapefruit: ["bưởi", "grapefruit"],
  guava: ["ổi", "guava"],
  hard_kiwi: ["kiwi", "hard kiwi"],
  jackfruit: ["mít", "jackfruit"],
  jujube: ["táo tàu", "jujube"],
  kumquat: ["quất", "kumquat"],
  longan: ["nhãn", "longan"],
  mandarine: ["quýt", "mandarin", "mandarine"],
  mango: ["xoài", "mango"],
  mangosteen: ["măng cụt", "mangosteen"],
  papaya: ["đu đủ", "papaya"],
  passion_fruit: ["chanh dây", "passion fruit"],
  pawpaw: ["đu đủ", "pawpaw"],
  pineapple: ["dứa", "thơm", "pineapple"],
  pomegranate: ["lựu", "pomegranate"],
  rambutan: ["chôm chôm", "rambutan"],
  raspberry: ["mâm xôi", "raspberry"],
  salak: ["mận lizard", "salak"],
  sapodilla: ["hồng xiêm", "sapoche", "sapodilla"],
  strawberry_guava: ["dâu ổi"],
  sugar_apple: ["mãng cầu ta", "na", "sugar apple"],
  watermelon: ["dưa hấu", "watermelon"],
  yali_pear: ["lê", "yali", "pear"],
  yellow_plum: ["mận", "plum"],
  plumcot: ["mận", "plumcot"],
  olive: ["ô liu", "olive"],
  corn_kernel: ["bắp", "ngô"],
  pea: ["đậu hà lan", "pea"],
  jalapeno: ["ớt jalapeño"],
  tomato: ["cà chua", "tomato"],
  strawberry: ["dâu tây", "strawberry"],
  lemon: ["chanh", "lemon"],
  lime: ["chanh", "lime"],
  orange: ["cam", "orange"],
  pear: ["lê", "pear"],
  peach: ["đào", "peach"],
  cherry: ["anh đào", "cherry"],
  plum: ["mận", "plum"],
  melon: ["dưa", "melon"],
  cantaloupe: ["dưa lưới", "cantaloupe"],
  honeydew: ["dưa lưới", "honeydew"],
  blueberry: ["việt quất", "blueberry"],
  lychee: ["vải", "lychee"],
  rose_hip: ["tầm xuân"],
};

function normalizeClassKey(className) {
  if (!className || typeof className !== "string") return "";
  return className.trim().toLowerCase().replace(/\s+/g, "_");
}

function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * @param {string} className - e.g. "apple", "dragonfruit"
 * @returns {{ keywords: string[], escapedPatterns: string[] }}
 */
function getSearchKeywords(className) {
  const key = normalizeClassKey(className);
  const humanEn = key.replace(/_/g, " ");
  const fromMap = VI_KEYWORDS_BY_CLASS[key];
  const keywords = fromMap
    ? [...fromMap, humanEn, key.replace(/_/g, "")]
    : [humanEn, ...key.split("_").filter((w) => w.length > 1)];
  const unique = [...new Set(keywords.map((k) => String(k).trim()).filter(Boolean))];
  return {
    keywords: unique,
    escapedPatterns: unique.map(escapeRegex),
  };
}

module.exports = {
  normalizeClassKey,
  getSearchKeywords,
  escapeRegex,
};
