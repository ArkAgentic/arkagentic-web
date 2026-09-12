import { createDecipheriv, createHash, createCipheriv, randomBytes } from "crypto";

const ALGO = "aes-256-gcm";

function normalizeSecret(secretRaw: string | undefined): Buffer {
  if (!secretRaw) throw new Error("ENCRYPTION_SECRET is not set");
  const secret = secretRaw.trim();
  if (!secret) throw new Error("ENCRYPTION_SECRET is empty");

  if (/^[A-Fa-f0-9]{64}$/.test(secret)) return Buffer.from(secret, "hex");

  try {
    const asB64 = Buffer.from(secret, "base64");
    if (asB64.length >= 32) return asB64.subarray(0, 32);
  } catch {
    // noop
  }

  return createHash("sha256").update(secret).digest();
}

export function encryptApiKey(plainText: string, secretRaw = process.env.ENCRYPTION_SECRET, kid = "v1"): string {
  const key = normalizeSecret(secretRaw);
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${kid}:gcm:${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
}

function looksLikePlainApiKey(value: string): boolean {
  const v = value.trim();
  if (!v) return false;
  if (v.includes(" ")) return false;
  if (v.startsWith("sk-") || v.startsWith("AIza") || v.startsWith("ghp_")) return true;
  return v.length >= 24;
}

export function decryptApiKey(payload: string, secretRaw = process.env.ENCRYPTION_SECRET): string {
  const raw = String(payload || "").trim();
  const parts = raw.split(":");

  // Backward compatibility: legacy rows may store plaintext keys.
  if (parts.length !== 5) {
    if (looksLikePlainApiKey(raw)) return raw;
    throw new Error("Invalid encrypted API key payload");
  }

  const [, mode, ivB64, tagB64, cipherB64] = parts;
  if (mode !== "gcm") throw new Error("Unsupported encryption mode");

  const key = normalizeSecret(secretRaw);
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const cipher = Buffer.from(cipherB64, "base64");

  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(cipher), decipher.final()]);
  return decrypted.toString("utf8");
}
