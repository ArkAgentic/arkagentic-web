export type SessionTokenPayload = {
  userId: string;
  email: string;
  role: "user" | "admin";
  balanceUsd: number;
  exp: number;
};

export function encodeSessionToken(payload: SessionTokenPayload): string {
  const header = { alg: "HS256", typ: "JWT" };
  const encode = (obj: object) => Buffer.from(JSON.stringify(obj)).toString("base64url");
  return `${encode(header)}.${encode(payload)}.mock-signature`;
}
