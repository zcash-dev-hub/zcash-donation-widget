import { describe, expect, it } from "vitest";
import { encodeMemo } from "../src/memo.js";
import {
  matchesPayment,
  watchPayment,
  type IncomingTx,
  type LightwalletdClient,
} from "../src/receipt.js";
import { EXAMPLE_TESTNET_UFVK } from "./examples.js";

/** Mock lightwalletd: replays scripted responses, one per poll. */
function mockClient(script: IncomingTx[][]): LightwalletdClient {
  let i = 0;
  return {
    async getIncomingTransactions() {
      const res = script[Math.min(i, script.length - 1)] ?? [];
      i++;
      return res;
    },
  };
}

const fastClock = () => {
  let t = 0;
  return {
    now: () => t,
    sleep: async (ms: number) => {
      t += ms;
    },
  };
};

const gift: IncomingTx = {
  txid: "aa".repeat(32),
  amountZats: 1_000_000n, // 0.01 TAZ
  memo: encodeMemo("test-123"),
};

describe("matchesPayment", () => {
  it("matches on memo + amount", () => {
    expect(matchesPayment(gift, 1_000_000n, "test-123")).toBe(true);
  });
  it("does not match a wrong amount", () => {
    expect(matchesPayment(gift, 2_000_000n, "test-123")).toBe(false);
    expect(
      matchesPayment({ ...gift, amountZats: 999_999n }, 1_000_000n, "test-123"),
    ).toBe(false);
  });
  it("does not match a wrong memo", () => {
    expect(matchesPayment(gift, 1_000_000n, "test-124")).toBe(false);
    expect(
      matchesPayment(
        { ...gift, memo: encodeMemo("other") },
        1_000_000n,
        "test-123",
      ),
    ).toBe(false);
  });
});

describe("watchPayment (mocked lightwalletd)", () => {
  it("resolves paid when the matching tx appears", async () => {
    const clock = fastClock();
    const client = mockClient([[], [], [gift]]);
    const res = await watchPayment(EXAMPLE_TESTNET_UFVK, {
      amount: "0.01",
      memo: "test-123",
      timeoutMs: 600_000,
      pollIntervalMs: 1_000,
      client,
      ...clock,
    });
    expect(res.status).toBe("paid");
    expect(res.tx?.txid).toBe(gift.txid);
  });

  it("expires (does NOT show paid) on wrong memo", async () => {
    const clock = fastClock();
    const wrongMemo: IncomingTx = { ...gift, memo: encodeMemo("nope") };
    const client = mockClient([[wrongMemo]]);
    const res = await watchPayment(EXAMPLE_TESTNET_UFVK, {
      amount: "0.01",
      memo: "test-123",
      timeoutMs: 10_000,
      pollIntervalMs: 1_000,
      client,
      ...clock,
    });
    expect(res.status).toBe("expired");
    expect(res.tx).toBeUndefined();
  });

  it("expires (does NOT show paid) on wrong amount", async () => {
    const clock = fastClock();
    const wrongAmount: IncomingTx = { ...gift, amountZats: 500_000n };
    const client = mockClient([[wrongAmount]]);
    const res = await watchPayment(EXAMPLE_TESTNET_UFVK, {
      amountZats: 1_000_000n,
      memo: "test-123",
      timeoutMs: 10_000,
      pollIntervalMs: 1_000,
      client,
      ...clock,
    });
    expect(res.status).toBe("expired");
  });

  it("rejects a mainnet UFVK", async () => {
    const client = mockClient([[]]);
    await expect(
      watchPayment("uview1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq", {
        amount: "0.01",
        client,
        timeoutMs: 1,
      }),
    ).rejects.toThrow();
  });
});
