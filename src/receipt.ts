/**
 * Receipt detection: watch for an incoming shielded payment using ONLY a
 * Unified Full Viewing Key (UFVK). A viewing key can observe incoming
 * transactions; it can never spend. No spending key is involved anywhere.
 *
 * Approach (adapted from the viewing-key watcher pattern used by
 * zcash-testnet-wallet's `watch --ufvk` / watchPayments): poll a public
 * testnet lightwalletd (default testnet.zec.rocks:443), trial-decrypt
 * incoming notes with the UFVK, and match a transaction on BOTH the memo
 * and the amount. The memo is the only link between a donation and its
 * receipt page — the donor never identifies themselves.
 *
 * This package ships zero runtime dependencies besides @z-labs/zip321, so
 * it does not bundle a gRPC stack. The lightwalletd transport is an
 * injected {@link LightwalletdClient}: production users supply one backed
 * by their preferred lightwalletd gRPC client; tests supply a mock.
 */
import { zecToZats } from "@z-labs/zip321";
import { decodeMemo } from "./memo.js";
import { assertUfvk } from "./validate.js";

export const DEFAULT_LIGHTWALLETD_ENDPOINT = "testnet.zec.rocks:443";
export const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
export const DEFAULT_POLL_INTERVAL_MS = 5_000;

/** An incoming shielded transaction as seen through a viewing key. */
export interface IncomingTx {
  txid: string;
  /** Amount received, in zatoshis (bigint — never floats). */
  amountZats: bigint;
  /** Memo as base64url (ZIP-321 encoding), if present. */
  memo?: string;
  /** Memo already decoded to text, if the client provides it. */
  memoText?: string;
  blockHeight?: number;
}

/**
 * Minimal lightwalletd surface the watcher needs. Implement this over
 * lightwalletd's gRPC `CompactTxStreamer` (GetBlockRange + trial decrypt
 * with the UFVK) in production; mock it in tests.
 */
export interface LightwalletdClient {
  getIncomingTransactions(
    ufvk: string,
    opts?: { sinceBlockHeight?: number },
  ): Promise<IncomingTx[]>;
}

export type WatchStatus = "paid" | "expired";

export interface WatchResult {
  status: WatchStatus;
  /** The matching transaction, present iff status === "paid". */
  tx?: IncomingTx;
  /** How long we watched before resolving, in ms. */
  elapsedMs: number;
}

export interface WatchPaymentOptions {
  /** Expected amount as decimal TAZ string, e.g. "0.01". */
  amount?: string;
  /** Expected amount in zatoshis (alternative to `amount`). */
  amountZats?: bigint;
  /** Expected memo text. The receipt matches on memo + amount. */
  memo?: string;
  /** Give up after this long. Default 10 minutes. */
  timeoutMs?: number;
  /** Poll cadence. Default 5s. */
  pollIntervalMs?: number;
  /** Injected lightwalletd client (required). */
  client: LightwalletdClient;
  /** Called on every poll with the current state, for UI updates. */
  onPoll?: (info: { elapsedMs: number; seen: number }) => void;
  /** Injectable clock for tests. */
  now?: () => number;
  /** Injectable sleep for tests. */
  sleep?: (ms: number) => Promise<void>;
}

function txMemoText(tx: IncomingTx): string | null {
  if (typeof tx.memoText === "string") return tx.memoText;
  if (typeof tx.memo === "string" && tx.memo.length > 0) {
    try {
      return decodeMemo(tx.memo);
    } catch {
      return null;
    }
  }
  return "";
}

/** Does this transaction match the expected amount AND memo? */
export function matchesPayment(
  tx: IncomingTx,
  expectedZats: bigint,
  expectedMemo: string,
): boolean {
  if (tx.amountZats !== expectedZats) return false;
  const memo = txMemoText(tx);
  if (memo === null) return false;
  return memo === expectedMemo;
}

const realSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Poll lightwalletd until a transaction matching amount + memo arrives
 * (status "paid") or the timeout elapses (status "expired"). The expired
 * state is a normal result, not an exception, so UIs can render it.
 */
export async function watchPayment(
  ufvk: string,
  options: WatchPaymentOptions,
): Promise<WatchResult> {
  assertUfvk(ufvk);
  const { client } = options;
  if (!client || typeof client.getIncomingTransactions !== "function") {
    throw new Error(
      "watchPayment requires an injected LightwalletdClient (see createLightwalletdClient / README)",
    );
  }
  const expectedZats =
    options.amountZats ??
    (options.amount !== undefined ? zecToZats(options.amount) : undefined);
  if (expectedZats === undefined) {
    throw new Error("watchPayment requires either amount (TAZ) or amountZats");
  }
  const expectedMemo = options.memo ?? "";
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? realSleep;

  const start = now();
  for (;;) {
    const txs = await client.getIncomingTransactions(ufvk);
    options.onPoll?.({ elapsedMs: now() - start, seen: txs.length });
    for (const tx of txs) {
      if (matchesPayment(tx, expectedZats, expectedMemo)) {
        return { status: "paid", tx, elapsedMs: now() - start };
      }
    }
    const elapsed = now() - start;
    if (elapsed >= timeoutMs) {
      return { status: "expired", elapsedMs: elapsed };
    }
    await sleep(Math.min(pollIntervalMs, timeoutMs - elapsed));
  }
}

/**
 * Create a lightwalletd client descriptor for an endpoint
 * (default testnet.zec.rocks:443).
 *
 * Zero-dependency note: this package does not bundle a gRPC transport, so
 * the returned client throws a descriptive error if used directly. Wrap
 * your lightwalletd gRPC client in the {@link LightwalletdClient}
 * interface (GetBlockRange + UFVK trial decryption) and pass that to
 * watchPayment instead. The watcher logic — polling, memo+amount
 * matching, timeout/expired state — is fully implemented and tested
 * against mocked clients.
 */
export function createLightwalletdClient(
  endpoint: string = DEFAULT_LIGHTWALLETD_ENDPOINT,
): LightwalletdClient & { endpoint: string } {
  return {
    endpoint,
    async getIncomingTransactions(): Promise<IncomingTx[]> {
      throw new Error(
        `No lightwalletd transport bundled (endpoint ${endpoint}). ` +
          "Inject a LightwalletdClient backed by a gRPC client for " +
          "testnet.zec.rocks:443, as documented in the README.",
      );
    },
  };
}
