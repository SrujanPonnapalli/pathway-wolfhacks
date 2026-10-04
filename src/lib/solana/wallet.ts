// App-made wallets are custodial: each profile's 64-byte secret key is stored in Tiger encrypted with
// AES-256-GCM (WALLET_ENCRYPTION_KEY, 32 bytes base64) and decrypted only on the server to sign.
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function key(b64 = process.env.WALLET_ENCRYPTION_KEY) {
  const k = Buffer.from(b64 ?? "", "base64");
  if (k.length !== 32) throw new Error("WALLET_ENCRYPTION_KEY must be 32 bytes, base64");
  return k;
}

/** iv (12) ‖ ciphertext ‖ tag (16) */
export function encrypt(secret: Uint8Array, b64Key?: string): Buffer {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(b64Key), iv);
  return Buffer.concat([iv, c.update(secret), c.final(), c.getAuthTag()]);
}

export function decrypt(blob: Uint8Array, b64Key?: string): Uint8Array {
  const b = Buffer.from(blob);
  const d = createDecipheriv("aes-256-gcm", key(b64Key), b.subarray(0, 12));
  d.setAuthTag(b.subarray(b.length - 16));
  return new Uint8Array(Buffer.concat([d.update(b.subarray(12, b.length - 16)), d.final()]));
}
