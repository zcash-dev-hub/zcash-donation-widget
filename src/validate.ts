/**
 * ZIP-316 unified address / viewing key validation.
 *
 * TESTNET ONLY. This package is for Zcash testnet:
 *  - Unified Addresses start with `utest1...`
 *  - Unified Full Viewing Keys start with `uviewtest1...`
 * Mainnet values (`u1...`, `uview1...`) are rejected outright, as are
 * transparent addresses (`t1...` / `t3...`) in shielded mode.
 *
 * Validation checks the bech32m (BIP-350) encoding and checksum from
 * ZIP-316. It intentionally does NOT parse receivers beyond the encoding:
 * a structurally invalid or wrong-network string is rejected before it is
 * ever handed to the ZIP-321 builder (@z-labs/zip321 does not validate
 * unified vs transparent addresses, so this step is ours).
 */

const BECH32M_CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
const BECH32M_CONST = 0x2bc830a3;

function bech32Polymod(values: number[]): number {
  const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let chk = 1;
  for (const v of values) {
    const top = chk >> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) {
      if ((top >> i) & 1) chk ^= GEN[i];
    }
  }
  return chk;
}

function hrpExpand(hrp: string): number[] {
  const out: number[] = [];
  for (const c of hrp) out.push(c.charCodeAt(0) >> 5);
  out.push(0);
  for (const c of hrp) out.push(c.charCodeAt(0) & 31);
  return out;
}

/**
 * Decode and checksum-verify a bech32m string with the expected HRP.
 * Returns the payload data words (without the 6 checksum words), or null.
 */
export function decodeBech32m(
  value: string,
  expectedHrp: string,
): number[] | null {
  if (value.length < 8 || value.length > 4096) return null;
  if (value !== value.toLowerCase()) return null; // ZIP-316 UAs are lowercase
  const sep = value.lastIndexOf("1");
  if (sep < 1) return null;
  const hrp = value.slice(0, sep);
  if (hrp !== expectedHrp) return null;
  const dataPart = value.slice(sep + 1);
  if (dataPart.length < 6) return null;
  const data: number[] = [];
  for (const c of dataPart) {
    const idx = BECH32M_CHARSET.indexOf(c);
    if (idx === -1) return null;
    data.push(idx);
  }
  const pm = bech32Polymod([...hrpExpand(hrp), ...data]);
  if (pm !== BECH32M_CONST) return null;
  return data.slice(0, data.length - 6);
}

export type ValidationResult =
  | { ok: true }
  | { ok: false; reason: string };

function reject(reason: string): ValidationResult {
  return { ok: false, reason };
}

/**
 * Validate a testnet Unified Address (ZIP-316, HRP `utest`).
 * Rejects mainnet UAs, transparent addresses, and malformed strings.
 */
export function validateUnifiedAddress(address: unknown): ValidationResult {
  if (typeof address !== "string" || address.length === 0) {
    return reject("address must be a non-empty string");
  }
  if (address.startsWith("t1") || address.startsWith("t3")) {
    return reject(
      "transparent addresses (t1/t3) are not accepted in shielded mode",
    );
  }
  if (address.startsWith("u1")) {
    return reject(
      "mainnet unified address (u1...) rejected: this package is testnet only",
    );
  }
  if (!address.startsWith("utest1")) {
    return reject("not a testnet unified address (expected utest1...)");
  }
  const payload = decodeBech32m(address, "utest");
  if (payload === null) {
    return reject("invalid bech32m encoding or checksum (ZIP-316)");
  }
  // A UA must carry at least one receiver: typecode + length + data.
  if (payload.length < 3) {
    return reject("unified address payload too short to contain a receiver");
  }
  return { ok: true };
}

/** Throwing variant of {@link validateUnifiedAddress}. */
export function assertUnifiedAddress(address: unknown): string {
  const res = validateUnifiedAddress(address);
  if (!res.ok) throw new Error(`Invalid unified address: ${res.reason}`);
  return address as string;
}

/**
 * Validate a testnet Unified Full Viewing Key (ZIP-316, HRP `uviewtest`).
 * A UFVK can only ever *detect* receipts; it cannot spend. Mainnet UFVKs
 * are rejected like mainnet addresses.
 */
export function validateUfvk(ufvk: unknown): ValidationResult {
  if (typeof ufvk !== "string" || ufvk.length === 0) {
    return reject("ufvk must be a non-empty string");
  }
  if (ufvk.startsWith("uview1")) {
    return reject(
      "mainnet viewing key (uview1...) rejected: this package is testnet only",
    );
  }
  if (!ufvk.startsWith("uviewtest1")) {
    return reject("not a testnet unified full viewing key (expected uviewtest1...)");
  }
  const payload = decodeBech32m(ufvk, "uviewtest");
  if (payload === null) {
    return reject("invalid bech32m encoding or checksum (ZIP-316)");
  }
  if (payload.length < 3) {
    return reject("viewing key payload too short");
  }
  return { ok: true };
}

/** Throwing variant of {@link validateUfvk}. */
export function assertUfvk(ufvk: unknown): string {
  const res = validateUfvk(ufvk);
  if (!res.ok) throw new Error(`Invalid UFVK: ${res.reason}`);
  return ufvk as string;
}

/**
 * Guard rail: refuse anything that even looks like spending material.
 * This package must never see a spending key, seed phrase, or private key.
 */
export function assertNotSpendingMaterial(value: unknown): void {
  if (typeof value !== "string") return;
  const v = value.trim().toLowerCase();
  if (
    v.startsWith("secret-spending-key") ||
    v.startsWith("sk") ||
    v.startsWith("xprv") ||
    v.startsWith("uusk") // unified spending key (ZIP-316 HRP uusk / uusk1test style)
  ) {
    throw new Error(
      "Spending keys are never accepted by this package. Refusing to continue.",
    );
  }
}
