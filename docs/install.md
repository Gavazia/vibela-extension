# Install and package locally

## Prerequisites

- Node.js/npm
- Google Chrome

## Install dependencies

```bash
npm install
```

## Development

```bash
npm run dev
```

WXT starts a local dev build. Use Chrome's extension page if you need to reload or inspect the extension.

## Production build

```bash
npm run typecheck
npm run build
```

The unpacked Chrome MV3 extension is written to:

```text
.output/chrome-mv3/
```

## Load unpacked in Chrome

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select `.output/chrome-mv3/` from this repository.
5. Open a fixture page and run `docs/manual-smoke.md`.

## ZIP package

```bash
npm run zip
```

This invokes `wxt zip` and writes a Chrome package ZIP under `.output/`. Use it only for local packaging checks in this change.

## Web Store publishing

Chrome Web Store submission, listing copy, privacy disclosure, and final branded icons are deferred to a separate publishing change. Do not publish from this PR.
