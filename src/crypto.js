import crypto from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const DEV_SECRET = "dev-only-change-me-before-production";

export function assertSecretConfiguration() {
  if (process.env.NODE_ENV === "production" && !process.env.DASHBOARD_SECRET) {
    throw new Error("DASHBOARD_SECRET is required in production so API tokens can be encrypted at rest.");
  }
}

function keyFromEnvironment() {
  const secret = process.env.DASHBOARD_SECRET || DEV_SECRET;
  return crypto.createHash("sha256").update(secret).digest();
}

export function encryptSecret(value) {
  if (!value) return null;

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, keyFromEnvironment(), iv);
  const encrypted = Buffer.concat([cipher.update(String(value), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    "v1",
    iv.toString("base64url"),
    tag.toString("base64url"),
    encrypted.toString("base64url")
  ].join(":");
}

export function decryptSecret(value) {
  if (!value) return "";

  const [version, ivText, tagText, encryptedText] = String(value).split(":");
  if (version !== "v1" || !ivText || !tagText || !encryptedText) {
    throw new Error("Stored API token is not in a supported encrypted format.");
  }

  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    keyFromEnvironment(),
    Buffer.from(ivText, "base64url")
  );
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));

  return Buffer.concat([
    decipher.update(Buffer.from(encryptedText, "base64url")),
    decipher.final()
  ]).toString("utf8");
}
