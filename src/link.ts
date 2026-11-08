/**
 * Shareable payment links, no backend.
 *
 * A link is an ordinary URL for a static payment page. The memo travels as
 * base64url (ZIP-321 encoding) — never as plaintext in the query string.
 * Amount is decimal TAZ. The address is a testnet Unified Address and is
 * validated before a link is built or accepted.
 */
import { zecToZats, zatsToZec } from "@z-labs/zip321";
import { decodeMemo, encodeMemo } from "./memo.js";
import { assertUnifiedAddress } from "./validate.js";

export interface PaymentLinkParams {
  address: string;
  /** Amount as decimal TAZ string, e.g. "0.01". */
  amount?: string;
  /** Amount in zatoshis (alternative to `amount`). */
  amountZats?: bigint;
  /** Donor message; stored base64url-encoded, never plaintext. */
  message?: string;
}

/** Build a shareable payment-link URL from a base page URL. */
export function buildPaymentLink(
  baseUrl: string,
  params: PaymentLinkParams,
): string {
  assertUnifiedAddress(params.address);
  const url = new URL(baseUrl);
  url.searchParams.set("address", params.address);
  const zats =
    params.amountZats ??
    (params.amount !== undefined ? zecToZats(params.amount) : undefined);
  if (zats !== undefined) url.searchParams.set("amount", zatsToZec(zats));
  if (params.message !== undefined && params.message !== "") {
    url.searchParams.set("memo", encodeMemo(params.message));
  }
  return url.toString();
}

export interface ParsedPaymentLink {
  address: string;
  amountZats?: bigint;
  amount?: string;
  message?: string;
}

/** Parse a payment link produced by {@link buildPaymentLink}. */
export function parsePaymentLink(link: string): ParsedPaymentLink {
  const url = new URL(link);
  const address = url.searchParams.get("address");
  if (!address) throw new Error("payment link is missing the address parameter");
  assertUnifiedAddress(address);
  const out: ParsedPaymentLink = { address };
  const amount = url.searchParams.get("amount");
  if (amount !== null) {
    out.amount = amount;
    out.amountZats = zecToZats(amount);
  }
  const memo = url.searchParams.get("memo");
  if (memo !== null && memo !== "") {
    out.message = decodeMemo(memo);
  }
  return out;
}
