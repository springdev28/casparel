/**
 * @fileOverview Security role: encrypts support-request personal data before it reaches Postgres.
 * System connection: support routes use the same field-specific authenticated encryption for writes and admin reads.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const PREFIX = "enc:v1";

function encryptionKey(): Buffer {
  const secret = process.env.DATA_ENCRYPTION_KEY ?? process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("DATA_ENCRYPTION_KEY or SESSION_SECRET must contain at least 32 characters");
  }
  return createHash("sha256").update("casparel-support-v1\0").update(secret).digest();
}

export function encryptSupportValue(field: string, value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(Buffer.from(`support_requests:${field}:v1`));
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [PREFIX, iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(":");
}

export function decryptSupportValue(field: string, value: string): string {
  const [marker, version, ivPart, tagPart, encryptedPart] = value.split(":");
  if (`${marker}:${version}` !== PREFIX || !ivPart || !tagPart || encryptedPart === undefined) {
    throw new Error("Encrypted support value has an unknown format");
  }
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivPart, "base64url"));
  decipher.setAAD(Buffer.from(`support_requests:${field}:v1`));
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedPart, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
