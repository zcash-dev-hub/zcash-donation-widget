/**
 * Memo handling per ZIP-321 / ZIP-302.
 *
 * A shielded memo field is at most 512 bytes. The donor message is carried
 * in the ZIP-321 URI as base64url WITHOUT padding — never as plaintext,
 * and never in a URL query parameter in plaintext.
 */
import { base64UrlDecode, base64UrlEncode } from "@z-labs/zip321";

export const MAX_MEMO_BYTES = 512;

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

/** UTF-8 byte length of a string. */
export function memoByteLength(text: string): number {
  return encoder.encode(text).length;
}

/**
 * Encode a donor message for a ZIP-321 URI: base64url, no padding.
 * Throws if the message exceeds the 512-byte memo limit.
 */
export function encodeMemo(text: string): string {
  if (typeof text !== "string") throw new Error("memo must be a string");
  const bytes = encoder.encode(text);
  if (bytes.length > MAX_MEMO_BYTES) {
    throw new Error(
      `Memo is ${bytes.length} bytes; the shielded memo limit is ${MAX_MEMO_BYTES} bytes`,
    );
  }
  return base64UrlEncode(text);
}

/** Decode a base64url (unpadded) ZIP-321 memo back to text. */
export function decodeMemo(encoded: string): string {
  if (/[+/=]/.test(encoded)) {
    throw new Error("memo must be base64url without padding (+, /, = rejected)");
  }
  const bytes = base64UrlDecode(encoded);
  if (bytes.length > MAX_MEMO_BYTES) {
    throw new Error(`Decoded memo exceeds ${MAX_MEMO_BYTES} bytes`);
  }
  return decoder.decode(bytes);
}
