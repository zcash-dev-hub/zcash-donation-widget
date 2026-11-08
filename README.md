# zcash-donation-widget

An embeddable widget + payment-link page that lets a creator receive
**shielded ZEC donations on Zcash testnet** — with no server, no POS, no
checkout, no account, and no custody.

> ⚠️ **TESTNET ONLY.** This package works exclusively with Zcash testnet
> addresses (`utest1...`) and viewing keys (`uviewtest1...`). Mainnet
> addresses are rejected in code. TAZ (testnet ZEC) has no monetary value.
> **Never** give this software a spending key, seed phrase, or private
> key — it has no use for one and refuses them.

## Install

```bash
npm install zcash-donation-widget
```

One runtime dependency: [`@z-labs/zip321`](https://www.npmjs.com/package/@z-labs/zip321)
(ZIP-321 payment request URIs). Everything else is implemented in-package.

## Usage (5 lines)

```ts
import { createDonationWidget } from "zcash-donation-widget";

const widget = createDonationWidget({ address: "utest1...", amount: "0.01", message: "thanks!" });
const { uri, address } = widget.newDonation();   // a fresh ZIP-321 payment request
console.log(uri); // zcash:utest1...?amount=0.01&memo=...
```

Render `uri` as a QR code with any QR library in your own app (QR rendering
is deliberately not bundled, to keep the dependency surface at one), show
`address` and the amount, and give the donor a copyable `zcash:...` link.

## How it works

1. **Configure** the widget with ONE of:
   - a single testnet Unified Address (`utest1...`) — reused per donation,
     and the UI says so;
   - a list of pre-generated diversified testnet UAs — rotated, one per
     donation;
   - plus, optionally, a Unified Full Viewing Key (UFVK) — **receipt
     detection only**. A viewing key can observe incoming payments; it can
     never spend.
2. **Donate.** The donor enters an amount in TAZ and an optional message
   (max 512 bytes, UTF-8 — the shielded memo limit).
3. **Pay.** The widget builds a [ZIP-321](https://zips.z.cash/zip-0321)
   payment URI. The memo is base64url-encoded without padding, per the
   spec — never plaintext in a URL. Amounts are bigint zatoshis end to
   end; no float money math anywhere.
4. **Receipt.** A watcher polls a public testnet lightwalletd
   (default `testnet.zec.rocks:443`), trial-decrypts incoming notes with
   the UFVK, and shows **Paid ✓** when a transaction matches BOTH the
   amount and the memo. Default timeout is 10 minutes, after which the
   receipt shows a clear **expired** state. The donor never identifies
   themselves; the memo is the only link between donation and receipt.

Validation (ZIP-316): addresses are bech32m/checksum-validated in-package
before use — `@z-labs/zip321` does not check unified vs transparent, so we
do. Mainnet `u1...`, mainnet `uview1...`, and transparent `t1`/`t3`
addresses (in shielded mode) are all rejected.

### Receipt watcher transport

The watcher logic (polling, memo+amount matching, timeout/expired state)
is transport-agnostic and fully implemented. Because this package ships
zero runtime dependencies besides `@z-labs/zip321`, it does **not** bundle
a gRPC stack: you inject a small `LightwalletdClient` adapter backed by
your preferred lightwalletd gRPC client (`CompactTxStreamer.GetBlockRange`
+ UFVK trial decryption), following the viewing-key watcher pattern used
by `zcash-testnet-wallet`'s `watch --ufvk`. Tests inject a mocked client
and cover: match → paid; wrong memo → not paid; wrong amount → not paid.

```ts
import { watchPayment } from "zcash-donation-widget";

const result = await watchPayment(ufvk, {
  amount: "0.01", memo: "test-123", client: myLightwalletdClient,
});
console.log(result.status); // "paid" | "expired"
```

## Payment links

`buildPaymentLink(baseUrl, { address, amount, message })` produces a
shareable URL for a static payment page. The memo travels base64url-encoded
in the query string — never plaintext. `parsePaymentLink` reverses it.

## Demo

```bash
npm run build
# then serve the repo root statically, e.g.:
npx serve .
# open demo/index.html
```

The demo uses a clearly-labelled synthetic example testnet UA (unfunded,
belongs to nobody). It generates a real ZIP-321 URI that parses back to the
same address, amount, and memo. To try a live testnet donation, configure
your own testnet UA, fund it from a testnet faucet
(`npx zcash-faucet <utest1...>`), and pay 0.01 TAZ with memo `test-123`
from a testnet wallet.

## What this is NOT

- **Not ZGo** — no point-of-sale, no checkout, no invoices, no fiat.
- **Not ZecLink** — no link-claim flow; links here are plain payment
  requests.
- **Not a wallet** — it cannot hold, send, or spend funds. No keys.
- **Not a checkout / payment processor** — no backend, no database, no
  API keys, no accounts, no webhooks.
- **Not for mainnet.** Testnet only, by design and by validation.

## Tests

```bash
npm run build && npm test
```

Covers ZIP-321 round-trips, TAZ↔zatoshi bigint conversion, memo
encode/decode + the 512-byte limit, ZIP-316 UA/UFVK validation (valid
`utest1` passes; `u1`, `t1`, `t3` fail), UA rotation, payment links, and
the receipt watcher against a mocked lightwalletd.

## License

MIT
