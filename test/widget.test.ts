import { describe, expect, it } from "vitest";
import { parsePaymentUri } from "@z-labs/zip321";
import { buildPaymentLink, parsePaymentLink } from "../src/link.js";
import { createDonationWidget } from "../src/widget.js";
import {
  EXAMPLE_MAINNET_UA,
  EXAMPLE_TESTNET_UA,
  EXAMPLE_TESTNET_UA_2,
} from "./examples.js";

describe("payment links", () => {
  it("round-trips address + amount + memo, memo never plaintext", () => {
    const link = buildPaymentLink("https://example.org/tip", {
      address: EXAMPLE_TESTNET_UA,
      amount: "0.01",
      message: "test-123",
    });
    expect(link).not.toContain("test-123");
    const parsed = parsePaymentLink(link);
    expect(parsed.address).toBe(EXAMPLE_TESTNET_UA);
    expect(parsed.amountZats).toBe(1_000_000n);
    expect(parsed.message).toBe("test-123");
  });

  it("refuses to build a link for a mainnet address", () => {
    expect(() =>
      buildPaymentLink("https://example.org/tip", {
        address: EXAMPLE_MAINNET_UA,
      }),
    ).toThrow(/mainnet/);
  });
});

describe("widget controller", () => {
  it("generates a ZIP-321 URI that parses back identically", () => {
    const w = createDonationWidget({
      address: EXAMPLE_TESTNET_UA,
      amount: "0.01",
      message: "test-123",
    });
    const req = w.current();
    expect(req.rotated).toBe(false); // single UA -> reused, and says so
    const parsed = parsePaymentUri(req.uri);
    expect(parsed.payments[0].address).toBe(EXAMPLE_TESTNET_UA);
    expect(parsed.payments[0].amountZats).toBe(1_000_000n);
    expect(parsed.payments[0].memoText).toBe("test-123");
  });

  it("rotates through a diversified UA list per donation", () => {
    const w = createDonationWidget({
      addresses: [EXAMPLE_TESTNET_UA, EXAMPLE_TESTNET_UA_2],
      amount: "0.01",
    });
    const first = w.current();
    const second = w.newDonation();
    expect(first.address).toBe(EXAMPLE_TESTNET_UA);
    expect(second.address).toBe(EXAMPLE_TESTNET_UA_2);
    expect(second.rotated).toBe(true);
  });

  it("refuses construction without an address, or with a mainnet one", () => {
    expect(() => createDonationWidget({})).toThrow();
    expect(() =>
      createDonationWidget({ address: EXAMPLE_MAINNET_UA }),
    ).toThrow(/mainnet/);
  });

  it("watch() requires a UFVK + client", async () => {
    const w = createDonationWidget({ address: EXAMPLE_TESTNET_UA });
    await expect(w.watch()).rejects.toThrow(/ufvk/);
  });
});
