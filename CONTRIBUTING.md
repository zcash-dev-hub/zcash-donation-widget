# Contributing to zcash-donation-widget

Thank you for your interest in contributing. This project follows the
contribution norms of the wider Zcash developer community; where this
document is silent, the
[librustzcash style guides](https://github.com/zcash/librustzcash) are the
primary reference.

## Getting set up

- Node.js 20 or newer.
- Install dependencies: `npm install`
- Build: `npm run build`
- Run the test suite: `npm test`
- Type-check only: `npm run typecheck`

All changes must leave `npm run build` and `npm test` green.

## Design principles

- **Testnet first.** This package targets the Zcash testnet. Never point
  examples, fixtures or defaults at mainnet addresses or infrastructure.
- **No spending keys, ever.** The widget and its receipt watcher work with
  unified addresses and Unified Full Viewing Keys (UFVKs) only. Code that
  accepts, stores or transmits a spending key will not be merged.
- **Minimal dependencies.** The single runtime dependency is
  `@z-labs/zip321` for ZIP-321 payment URIs. Propose any new runtime
  dependency in an issue before opening a pull request.
- **ZIP conformance.** Payment URIs follow ZIP-321, addresses follow
  ZIP-316, and memos follow the Zcash memo specification (512 bytes,
  UTF-8). Deviations need a written rationale in the pull request.

## Making changes

1. Open an issue first for anything larger than a small fix, and wait for
   a maintainer response before writing substantial code.
2. Fork the repository and create a topic branch from `main`, named for
   the change (for example `fix/zip321-amount-rounding`).
3. Keep pull requests small and single-purpose. Each pull request should
   do one thing and say why in its description.
4. Add or update tests for every behaviour change. Receipt-watching
   changes must include mocked-lightwalletd tests; do not write tests
   that require a live node.
5. Update `README.md` whenever public APIs, options or behaviour change.

## Code style

- TypeScript, ESM modules, strict mode.
- Validate at the boundary: addresses, amounts and memos are validated
  on entry and rejected with descriptive errors.
- Amounts are handled in zatoshis as `bigint` internally; floating point
  is never used for money.
- No network calls in the core package outside the injectable
  lightwalletd client interface.
- Comments explain *why*, not *what*; match the commenting density of
  the surrounding code.

## Commits and pull requests

- Write commit messages in the imperative mood, with a short summary
  line and a body explaining the motivation when the change is not
  self-evident.
- A pull request is ready for review when CI-equivalent local checks
  (`npm run build`, `npm test`) pass and the description states what
  changed, why, and how it was tested.
- Maintainers may ask for changes; please respond to review comments
  rather than force-pushing over them.

## Reporting bugs

Open an issue with the package version, the input that failed (redact
any real addresses or viewing keys), the expected behaviour, and the
actual behaviour.
