/**
 * The embeddable donation widget.
 *
 * Framework-light: a plain DOM API when a mount element is given, and a
 * pure data/controller API everywhere else (SSR, tests, other frameworks).
 *
 * TESTNET ONLY. The widget works with:
 *  - a single testnet Unified Address (utest1...), or
 *  - a list of pre-generated diversified testnet UAs, rotated per donation, or
 *  - a UFVK — for RECEIPT DETECTION ONLY. A viewing key cannot receive or
 *    spend; pair it with an address/list for the payment itself.
 *
 * It never asks for, stores, or transmits a spending key, seed, or
 * private key. There is no backend and no account.
 */
import { buildPaymentUri, parsePaymentUri, zecToZats, zatsToZec } from "@z-labs/zip321";
import { encodeMemo } from "./memo.js";
import {
  watchPayment,
  type LightwalletdClient,
  type WatchResult,
} from "./receipt.js";
import {
  assertNotSpendingMaterial,
  assertUfvk,
  assertUnifiedAddress,
} from "./validate.js";

export interface DonationWidgetOptions {
  /** Single testnet Unified Address (utest1...). */
  address?: string;
  /** Pre-generated diversified testnet UAs, rotated per donation. */
  addresses?: string[];
  /** Unified Full Viewing Key — receipt detection only (uviewtest1...). */
  ufvk?: string;
  /** Default amount as decimal TAZ string, e.g. "0.01". */
  amount?: string;
  /** Default donor message (max 512 bytes). */
  message?: string;
  /** Called when the receipt watcher sees the matching payment. */
  onPaid?: (result: WatchResult) => void;
  /** Lightwalletd client for receipt detection (required to watch). */
  client?: LightwalletdClient;
  /** Mount element for the DOM UI. Omit for headless/controller use. */
  mount?: HTMLElement;
}

export interface DonationRequest {
  /** The UA this donation should be paid to. */
  address: string;
  /** True if a fresh/rotated UA was used; false if the configured UA is reused. */
  rotated: boolean;
  amountZats?: bigint;
  amount?: string;
  message?: string;
  /** ZIP-321 payment URI (zcash:...) — render this as a QR code. */
  uri: string;
}

export interface DonationWidget {
  /** Build the payment request for a new donation (rotates UA if a list was configured). */
  newDonation(input?: { amount?: string; message?: string }): DonationRequest;
  /** The most recent donation request. */
  current(): DonationRequest;
  /** Set/update the amount (decimal TAZ) for the current donation. */
  setAmount(amount: string): DonationRequest;
  /** Set/update the donor message for the current donation. */
  setMessage(message: string): DonationRequest;
  /**
   * Watch for the current donation's payment using the configured UFVK.
   * Resolves "paid" or "expired"; calls onPaid on success.
   */
  watch(timeoutMs?: number): Promise<WatchResult>;
  /** The rendered root element, if mounted. */
  element?: HTMLElement;
}

function buildRequest(
  address: string,
  rotated: boolean,
  amount: string | undefined,
  message: string | undefined,
): DonationRequest {
  assertUnifiedAddress(address);
  const amountZats = amount !== undefined ? zecToZats(amount) : undefined;
  const uri = buildPaymentUri([
    {
      address,
      ...(amountZats !== undefined ? { amountZats } : {}),
      ...(message ? { memo: encodeMemo(message) } : {}),
    },
  ]);
  // Sanity: the URI must parse back to the same address/amount/memo.
  const parsed = parsePaymentUri(uri).payments[0];
  if (parsed?.address !== address) {
    throw new Error("internal error: generated URI does not round-trip");
  }
  return {
    address,
    rotated,
    ...(amountZats !== undefined
      ? { amountZats, amount: zatsToZec(amountZats) }
      : {}),
    ...(message ? { message } : {}),
    uri,
  };
}

export function createDonationWidget(
  options: DonationWidgetOptions,
): DonationWidget {
  for (const v of [options.address, options.ufvk, ...(options.addresses ?? [])]) {
    assertNotSpendingMaterial(v);
  }
  const list = options.addresses?.length
    ? [...options.addresses]
    : options.address
      ? [options.address]
      : [];
  if (list.length === 0) {
    throw new Error(
      "createDonationWidget requires `address` or `addresses` (a UFVK alone cannot receive payments)",
    );
  }
  list.forEach((a) => assertUnifiedAddress(a));
  if (options.ufvk) assertUfvk(options.ufvk);

  const rotating = list.length > 1;
  let cursor = 0;
  let amount = options.amount;
  let message = options.message;
  let current: DonationRequest = buildRequest(
    list[0],
    rotating,
    amount,
    message,
  );

  const widget: DonationWidget = {
    newDonation(input) {
      if (input?.amount !== undefined) amount = input.amount;
      if (input?.message !== undefined) message = input.message;
      if (rotating) {
        cursor = (cursor + 1) % list.length;
      }
      current = buildRequest(list[cursor], rotating, amount, message);
      render();
      return current;
    },
    current: () => current,
    setAmount(a) {
      amount = a;
      current = buildRequest(current.address, current.rotated, amount, message);
      render();
      return current;
    },
    setMessage(m) {
      message = m;
      current = buildRequest(current.address, current.rotated, amount, message);
      render();
      return current;
    },
    async watch(timeoutMs) {
      if (!options.ufvk) {
        throw new Error("watch() requires a `ufvk` (receipt detection only)");
      }
      if (!options.client) {
        throw new Error("watch() requires a lightwalletd `client`");
      }
      const result = await watchPayment(options.ufvk, {
        amountZats: current.amountZats,
        amount: current.amount,
        memo: current.message ?? "",
        client: options.client,
        ...(timeoutMs !== undefined ? { timeoutMs } : {}),
      });
      if (result.status === "paid") options.onPaid?.(result);
      render(result.status);
      return result;
    },
  };

  // ---- Optional DOM rendering (plain DOM, no framework) ----
  let root: HTMLElement | undefined;
  function render(status?: string) {
    if (!options.mount || typeof document === "undefined") return;
    if (!root) {
      root = document.createElement("div");
      root.className = "zdw-widget";
      options.mount.appendChild(root);
      widget.element = root;
    }
    const reusedNote = current.rotated
      ? "Fresh address for this donation."
      : "This donation reuses the configured address.";
    root.innerHTML = "";
    const title = document.createElement("p");
    title.className = "zdw-title";
    title.textContent = "Donate with Zcash (TESTNET)";
    const addr = document.createElement("code");
    addr.className = "zdw-address";
    addr.textContent = current.address;
    const amt = document.createElement("p");
    amt.className = "zdw-amount";
    amt.textContent = current.amount
      ? `Amount: ${current.amount} TAZ`
      : "Amount: any";
    const note = document.createElement("p");
    note.className = "zdw-note";
    note.textContent = reusedNote;
    const link = document.createElement("a");
    link.className = "zdw-uri";
    link.href = current.uri;
    link.textContent = current.uri;
    root.append(title, addr, amt, note, link);
    if (status) {
      const s = document.createElement("p");
      s.className = "zdw-status";
      s.textContent = status === "paid" ? "Paid ✓" : `Status: ${status}`;
      root.appendChild(s);
    }
  }
  render();

  return widget;
}
