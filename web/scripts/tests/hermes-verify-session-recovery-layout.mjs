import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "../..");
const layoutPath = path.join(projectRoot, "src", "app", "layout.tsx");

if (!fs.existsSync(layoutPath)) {
  console.error(`[FAIL] Missing root layout: ${layoutPath}`);
  process.exit(1);
}

const content = fs.readFileSync(layoutPath, "utf8");

const checks = [
  {
    name: "imports SessionRecovery",
    ok: /from\s+["']@\/components\/session-recovery["']/.test(content),
  },
  {
    name: "renders <SessionRecovery /> in I18nProvider",
    ok: /<I18nProvider[\s\S]*?<SessionRecovery\s*\/?>[\s\S]*?<\/I18nProvider>/.test(content),
  },
];

const failed = checks.filter((c) => !c.ok);
if (failed.length > 0) {
  for (const item of failed) {
    console.error(`[FAIL] ${item.name}`);
  }
  process.exit(1);
}

console.log("[PASS] root layout includes SessionRecovery for all routes");
