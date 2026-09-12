import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

const ALGO = "aes-256-gcm";

function normalizeSecret(secretRaw) {
  if (!secretRaw) throw new Error("ENCRYPTION_SECRET is not set");
  const secret = secretRaw.trim();
  if (!secret) throw new Error("ENCRYPTION_SECRET is empty");

  if (/^[A-Fa-f0-9]{64}$/.test(secret)) return Buffer.from(secret, "hex");

  try {
    const b64 = Buffer.from(secret, "base64");
    if (b64.length >= 32) return b64.subarray(0, 32);
  } catch {
    // noop
  }

  return createHash("sha256").update(secret).digest();
}

export function encryptSecret(plainText, secretRaw, kid = "v1") {
  if (!plainText) throw new Error("plainText is required");
  const key = normalizeSecret(secretRaw);
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const cipherText = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${kid}:gcm:${iv.toString("base64")}:${tag.toString("base64")}:${cipherText.toString("base64")}`;
}

export function decryptSecret(payload, secretRaw) {
  const key = normalizeSecret(secretRaw);
  const parts = String(payload || "").split(":");
  if (parts.length !== 5) throw new Error("Invalid encrypted payload format");
  const [, mode, ivB64, tagB64, cipherB64] = parts;
  if (mode !== "gcm") throw new Error("Unsupported encryption mode");

  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const cipherText = Buffer.from(cipherB64, "base64");

  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(cipherText), decipher.final()]);
  return plain.toString("utf8");
}
