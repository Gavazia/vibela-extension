# vibela-extension

Visual UI annotation browser extension. Pick DOM elements on a Chrome page, annotate, capture screenshots, and copy a structured prompt plus PNGs for LLM handoff.

Extracted from the in-app CopilotOverlay component of Quien-es-quien. The origin component remains in that separate repo until extension parity is manually verified.

## Status

| Area | Status |
| --- | --- |
| Chrome MV3 WXT build | ✅ Implemented |
| Annotate / transform / swap / text-edit modes | ✅ Implemented; manual smoke pending |
| Prompt + PNG filename parity | ✅ Implemented; spot-check with golden required |
| Verification gate | ⚠️ Manual Chrome smoke is the current verification gate |
| Web Store publishing | ⏳ Deferred |
| Final brand icons | ⏳ Deferred; current icons are simple generated placeholders |

## Commands

```bash
npm install
npm run dev
npm run typecheck
npm run build
npm run zip
```

- `npm run build` writes the unpacked Chrome MV3 extension to `.output/chrome-mv3/`.
- `npm run zip` invokes `wxt zip` and writes a package ZIP under `.output/` for local packaging checks.

## Load unpacked in Chrome

1. Run `npm run build`.
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select `.output/chrome-mv3/`.
6. Run the manual checklist in [`docs/manual-smoke.md`](docs/manual-smoke.md).

## Fixtures

Serve the fixture pages locally when smoking picker behavior:

```bash
npx http-server fixtures/
```

Then open `fixtures/light.html`, `fixtures/dark.html`, and `fixtures/nested.html` in Chrome.

## Documentation

- [Local install and packaging](docs/install.md)
- [Manual Chrome smoke checklist](docs/manual-smoke.md)
- [Prompt byte-stability checks](docs/byte-stability.md)
- [Known limitations](docs/known-limitations.md)

## E2E Testing

Playwright regression tests guard the three bugs fixed in the initial stabilisation pass: the hover-close effect (Bug 1), the closed-shadow-DOM composedPath outside-click handler (Bug 2), and the missing `web_accessible_resources` that broke icons (Bug 3). Tests run against the real built extension in a non-headless Chromium instance — the only mode Chrome extensions support.

```bash
# Build extension then run all regression tests (pretest runs build automatically)
npm test

# Run without rebuilding (uses the existing build)
npx playwright test

# Run a single test by name
npx playwright test -g "panel opens and STAYS OPEN"

# Open the HTML report after a run
npx playwright show-report
```

Test results: **6 tests, 6 pass** (A–F in `tests/regression.spec.ts`).
See `tests/fixtures/extension.ts` for the Playwright fixture that launches the extension in a persistent context and serves `fixtures/` via a local HTTP server.
