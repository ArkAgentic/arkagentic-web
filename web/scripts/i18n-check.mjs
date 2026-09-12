import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const base = path.join(root, "src", "locales");
const langs = ["en", "zh", "ja", "fr", "de", "ko"];
const prefixes = ["docs.page.", "pricing.page.", "home.hero.", "home.featureGrid.", "home.contact.", "home.map.", "footer."];
const strictPrefixes = ["home.contact.", "footer.", "home.hero.", "pricing.page."];

const data = Object.fromEntries(
  langs.map((l) => [l, JSON.parse(fs.readFileSync(path.join(base, `${l}.json`), "utf8"))]),
);

const en = data.en;
let ok = true;

const nonEnglishLangs = ["zh", "ja", "fr", "de", "ko"];
const exactMatchAllowlist = new Set([
  "docs.page.subtitle.base",
  "pricing.page.models.names.ark-gpt-4o",
  "pricing.page.models.names.ark-gpt-5.3-codex",
  "pricing.page.models.names.ark-claude-sonnet-5",
  "pricing.page.models.names.ark-claude-opus-5",
  "pricing.page.models.names.ark-deepseek-v4-pro",
  "pricing.page.models.names.ark-deepseek-v4-flash",
  "pricing.page.models.names.ark-mai-thinking-1",
  "pricing.page.models.names.ark-cohere-embed-v3",
  "pricing.page.models.names.ark-cohere-rerank-v4-pro",
  "pricing.page.models.names.ark-cohere-rerank-v4-fast",
  "pricing.page.models.names.ark-mai-image-2.5-pro",
  "pricing.page.models.names.ark-mai-transcribe-1.5",
  "pricing.page.models.names.ark-mai-voice-2",
  "home.contact.emailPlaceholder",
]);

const termAllowlist = new Set([
  "arkagentic",
  "api",
  "sdk",
  "sla",
  "https",
  "json",
  "curl",
  "sse",
  "stripe",
]);

function isAllowlistedTermPhrase(value) {
  const tokens = value.toLowerCase().match(/[a-z0-9.+-]+/g) || [];
  if (!tokens.length) return false;
  return tokens.every((token) => termAllowlist.has(token));
}

for (const prefix of prefixes) {
  const ref = Object.keys(en).filter((k) => k.startsWith(prefix)).sort();
  console.log(`\n[${prefix}] reference keys: ${ref.length}`);
  for (const lang of langs) {
    const keys = Object.keys(data[lang]).filter((k) => k.startsWith(prefix));
    const missing = ref.filter((k) => !keys.includes(k));
    const extra = keys.filter((k) => !ref.includes(k));
    if (missing.length || extra.length) ok = false;
    console.log(`${lang}: missing=${missing.length}, extra=${extra.length}`);
    if (missing.length) console.log(`  missing sample: ${missing.slice(0, 5).join(", ")}`);
    if (extra.length) console.log(`  extra sample: ${extra.slice(0, 5).join(", ")}`);
  }
}

for (const lang of nonEnglishLangs) {
  const strictOffenders = [];
  const warningOffenders = [];

  for (const prefix of prefixes) {
    const keys = Object.keys(en).filter((k) => k.startsWith(prefix));
    const isStrictPrefix = strictPrefixes.some((sp) => prefix.startsWith(sp) || sp.startsWith(prefix));

    for (const key of keys) {
      const enValue = en[key];
      const localValue = data[lang][key];
      if (typeof enValue !== "string" || typeof localValue !== "string") continue;
      if (exactMatchAllowlist.has(key)) continue;
      if (enValue.length < 14) continue;
      if (localValue !== enValue) continue;
      if (isAllowlistedTermPhrase(enValue)) continue;

      if (isStrictPrefix) strictOffenders.push(key);
      else warningOffenders.push(key);
    }
  }

  if (warningOffenders.length) {
    console.warn(`\n[WARNING][${lang}] exact-English placeholder detected (non-strict): ${warningOffenders.length}`);
    console.warn(`  sample: ${warningOffenders.slice(0, 10).join(", ")}`);
  }

  if (strictOffenders.length) {
    ok = false;
    console.error(`\n[ERROR][${lang}] exact-English placeholder detected (strict): ${strictOffenders.length}`);
    console.error(`  sample: ${strictOffenders.slice(0, 10).join(", ")}`);
  }
}

if (!ok) {
  console.error("\ni18n check failed");
  process.exit(1);
}

console.log("\ni18n check passed");
