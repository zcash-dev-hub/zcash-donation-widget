import { describe, expect, it } from "vitest";
import {
  buildPaymentUri,
  parsePaymentUri,
  zatsToZec,
  zecToZats,
} from "@z-labs/zip321";
import { decodeMemo, encodeMemo, MAX_MEMO_BYTES } from "../src/memo.js";
import { EXAMPLE_TESTNET_UA } from "./examples.js";

describe("ZIP-321 build/parse round-trip", () => {
  it("round-trips address + amount + memo (acceptance vector)", () => {
    const uri = buildPaymentUri([
      {
        address: EXAMPLE_TESTNET_UA,
        amountZats: zecToZats("0.01"),
        memo: encodeMemo("test-123"),
      },
    ]);
    expect(uri.startsWith(`zcash:${EXAMPLE_TESTNET_UA}?`)).toBe(true);
    // Memo must be base64url, unpadded, and NOT plaintext in the URI.
    expect(uri).not.toContain("test-123");
    const memoParam = new URLSearchParams(uri.split("?")[1]).get("memo");
    expect(memoParam).toBe("dGVzdC0xMjM");
    expect(memoParam).not.toMatch(/[+/=]/);

    const parsed = parsePaymentUri(uri);
    expect(parsed.payments).toHaveLength(1);
    const p = parsed.payments[0];
    expect(p.address).toBe(EXAMPLE_TESTNET_UA);
    expect(p.amountZats).toBe(1_000_000n);
    expect(p.memoText).toBe("test-123");
  });

  it("converts TAZ <-> zatoshis with bigint precision (no floats)", () => {
    expect(zecToZats("0.01")).toBe(1_000_000n);
    expect(zecToZats("1")).toBe(100_000_000n);
    expect(zecToZats("0.00000001")).toBe(1n);
    expect(zatsToZec(1_000_000n)).toBe("0.01");
    expect(zatsToZec(zecToZats("12.34567891"))).toBe("12.34567891");
  });

  it("round-trips a URI with no amount and no memo", () => {
    const uri = buildPaymentUri([{ address: EXAMPLE_TESTNET_UA }]);
    const parsed = parsePaymentUri(uri);
    expect(parsed.payments[0].address).toBe(EXAMPLE_TESTNET_UA);
    expect(parsed.payments[0].amountZats).toBeUndefined();
  });
});

describe("memo encode/decode (ZIP-321, 512-byte limit)", () => {
  it("encodes base64url without padding and decodes back", () => {
    const enc = encodeMemo("hello zcash");
    expect(enc).not.toMatch(/[+/=]/);
    expect(decodeMemo(enc)).toBe("hello zcash");
  });

  it("handles unicode by UTF-8 bytes", () => {
    const msg = "धन्यवाद 🦓";
    expect(decodeMemo(encodeMemo(msg))).toBe(msg);
  });

  it("accepts exactly 512 bytes and rejects 513", () => {
    const ok = "a".repeat(MAX_MEMO_BYTES);
    expect(decodeMemo(encodeMemo(ok))).toBe(ok);
    expect(() => encodeMemo("a".repeat(MAX_MEMO_BYTES + 1))).toThrow(/512/);
  });

  it("rejects padded / standard-base64 memos on decode", () => {
    expect(() => decodeMemo("aGVsbG8=")).toThrow();
  });
});
