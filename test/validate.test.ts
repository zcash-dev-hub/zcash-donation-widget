import { describe, expect, it } from "vitest";
import { validateUfvk, validateUnifiedAddress } from "../src/validate.js";
import {
  EXAMPLE_MAINNET_UA,
  EXAMPLE_TESTNET_UA,
  EXAMPLE_TESTNET_UA_2,
  EXAMPLE_TESTNET_UFVK,
  EXAMPLE_TRANSPARENT_T1,
  EXAMPLE_TRANSPARENT_T3,
} from "./examples.js";

describe("validateUnifiedAddress (ZIP-316, testnet only)", () => {
  it("accepts a valid testnet UA (utest1...)", () => {
    expect(validateUnifiedAddress(EXAMPLE_TESTNET_UA).ok).toBe(true);
    expect(validateUnifiedAddress(EXAMPLE_TESTNET_UA_2).ok).toBe(true);
  });

  it("rejects a mainnet UA (u1...)", () => {
    const res = validateUnifiedAddress(EXAMPLE_MAINNET_UA);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toMatch(/mainnet/);
  });

  it("rejects transparent addresses for shielded mode (t1/t3)", () => {
    expect(validateUnifiedAddress(EXAMPLE_TRANSPARENT_T1).ok).toBe(false);
    expect(validateUnifiedAddress(EXAMPLE_TRANSPARENT_T3).ok).toBe(false);
  });

  it("rejects garbage and corrupted checksums", () => {
    expect(validateUnifiedAddress("hello").ok).toBe(false);
    expect(validateUnifiedAddress("").ok).toBe(false);
    expect(validateUnifiedAddress(undefined).ok).toBe(false);
    // Flip the final char of a valid UA -> checksum must fail.
    const corrupt = EXAMPLE_TESTNET_UA.slice(0, -1) + "q";
    expect(corrupt).not.toBe(EXAMPLE_TESTNET_UA);
    expect(validateUnifiedAddress(corrupt).ok).toBe(false);
  });
});

describe("validateUfvk (ZIP-316, testnet only)", () => {
  it("accepts a valid testnet UFVK (uviewtest1...)", () => {
    expect(validateUfvk(EXAMPLE_TESTNET_UFVK).ok).toBe(true);
  });

  it("rejects mainnet UFVKs and addresses-as-UFVKs", () => {
    expect(
      validateUfvk(EXAMPLE_TESTNET_UFVK.replace("uviewtest1", "uview1")).ok,
    ).toBe(false);
    expect(validateUfvk(EXAMPLE_TESTNET_UA).ok).toBe(false);
  });
});
