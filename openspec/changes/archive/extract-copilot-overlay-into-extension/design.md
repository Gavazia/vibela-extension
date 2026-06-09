# Design: Extract CopilotOverlay into a standalone browser extension

Scope-bound design for change `extract-copilot-overlay-into-extension`. The proposal forecast already shows the full extraction exceeds the 400-line review budget, so this design fixes the chained-PR boundaries, the message contracts, the storage schema, and the parity strategy used by `sdd-spec` and `sdd-tasks`.

The origin `../Quien-es-quien/src/shared/ui/CopilotOverlay.jsx` is referenced for behavioral parity only. The new code is TypeScript + React 18 inside a WXT extension; semantics are ported, not the JSX file.

---

## Decisions resolved

### Q: Shadow DOM root mode — open or closed?

**Decision:** `attachShadow({ mode: 'closed' })` in production builds. Dev builds (WXT `NODE_ENV !== 'production'`) additionally expose `window.__vibeCopilot = { shadowRoot, store, version }` on the page for debugging. The debug bridge is stripped from production bundles via a `import.meta.env.MODE` guard.

**Rationale:** Closed mode reduces accidental coupling from host pages, keeps self-avoidance checks deterministic (we always own the host element identity), and avoids leaking React internals through `host.shadowRoot`. The debug bridge gives us back inspectability during local development without weakening release builds.

### Q: Tailwind mapping fidelity — port as-is, widen, or vendor a library?

**Decision:** Port the existing `TW_COLORS`, `TW_SPACING`, `TW_FONT_SIZE`, `TW_FONT_WEIGHT`, and `TW_BORDER_RADIUS` dictionaries verbatim into `src/shared/styleMapper.ts` for v1. No widening, no vendored mapping library.

**Rationale:** Byte-stability against the origin `mapStyles()` is required for prompt parity. Widening coverage changes which Tailwind hints appear in `Tailwind: ...` lines and would break the byte-stable guarantee that `copyPrompt` must honor. Widening is filed as a follow-up change.

### Q: Firefox parity timing?

**Decision:** Chrome MV3 only for v1. WXT's Firefox build target is left enabled in `wxt.config.ts` but not smoked. A follow-up change `verify-firefox-build` tracks first-class Firefox support.

**Rationale:** Smoking two browsers in the inaugural extraction inflates an already-over-budget chain. WXT keeps the door open at near-zero cost.

### Q: Web Store publishing path?

**Decision:** Out of scope for the design phase. The build artifacts (`dist/chrome-mv3/` unpacked, `.output/<target>.zip`) will be produced by the bootstrap PR; store listing, icon policy, and privacy disclosure are deferred to a separate `publish-chrome-web-store` change.

**Rationale:** Publishing involves account/legal/asset decisions outside the engineering scope of extraction.

### Q: `html2canvas` fallback for clipped elements?

**Decision:** Drop `html2canvas` entirely for v1. The capture pipeline uses only `chrome.tabs.captureVisibleTab` and content-side cropping. Viewport-only clipping is documented as a known limitation in `docs/known-limitations.md` and surfaced in the overlay when an element's rect extends outside the viewport (small inline warning, no blocking modal).

**Rationale:** `html2canvas` adds ~80 KB minified, brings CORS/tainted-canvas/web-font edge cases, and the v1 user base (the project owner) can scroll the clipped element into view. If real users hit clipped-element pain, a follow-up change can reintroduce it behind a feature flag.

### Q: Per-tab vs global overlay on/off?

**Decision:** Per-tab `active` flag persisted in `chrome.storage.session` (cleared on browser restart); a default `activateOnLoad: boolean` preference lives in `chrome.storage.sync`. The toolbar action toggles only the current tab's flag.

**Rationale:** Per-tab matches the origin floating-bubble UX (each tab can independently enter picker mode without affecting other tabs). `chrome.storage.session` is the right primitive for tab-scoped runtime state, and a global default in `sync` preserves the user's preference across machines without leaking active-state across sessions.

### Q: Minimum fixture pages for byte-stable prompt?

**Decision:** Three fixture HTML pages committed under `fixtures/`:

1. `fixtures/light-theme.html` — bright background, large headings, simple flex grid.
2. `fixtures/dark-theme.html` — dark background, inverted text colors, common Tailwind tokens.
3. `fixtures/deep-nesting.html` — element nested ≥ 8 levels deep with `aria-label`, custom classes, and inline styles to exercise the `getElInfo` label and parent-tag paths.

Each fixture has a matching `fixtures/prompts/<name>.golden.txt` with a hand-curated annotation list and the expected `buildPrompt()` output captured from a one-time run against the origin component.

**Rationale:** Three fixtures are the minimum to exercise the Tailwind dictionaries, dark-mode style extraction, and deep-tree label heuristics without bloating the repo. Golden files turn the manual smoke step into a `diff` command.

---

## Repository layout

Planned tree after the bootstrap PR completes (only the relevant additions are shown; `.gitignore`, `LICENSE`, `README.md` are already in the repo):

```text
vibecopilot-extension/
├── wxt.config.ts              # WXT entry, targets, manifest, content-script matches
├── package.json               # scripts: dev, dev:firefox, build, build:firefox, zip
├── tsconfig.json
├── postcss.config.cjs
├── tailwind.config.ts
├── src/
│   ├── entrypoints/
│   │   ├── background.ts      # service worker: capture + downloads + router
│   │   ├── content.ts         # shadow-host bootstrap, mounts React UI
│   │   └── popup/
│   │       ├── index.html
│   │       └── App.tsx        # minimal toolbar popup (toggle + link)
│   ├── ui/
│   │   ├── Overlay.tsx        # root React component mounted in shadow root
│   │   ├── ModeBar.tsx        # tool switcher
│   │   ├── AnnotationPopup.tsx
│   │   ├── TransformLayer.tsx
│   │   ├── SwapPopup.tsx
│   │   ├── TextEditPopup.tsx
│   │   ├── HighlightBox.tsx
│   │   ├── CssTooltip.tsx
│   │   └── AnnotationsPanel.tsx
│   ├── shared/
│   │   ├── pickerEngine.ts
│   │   ├── styleMapper.ts
│   │   ├── promptBuilder.ts
│   │   ├── captureCrop.ts
│   │   ├── storage.ts
│   │   ├── messaging.ts
│   │   ├── dom.ts
│   │   └── types.ts
│   ├── styles/
│   │   ├── overlay.css        # Tailwind directives compiled here
│   │   └── tokens.css         # CSS variables for theme
│   └── assets/
│       └── icons/
│           ├── icon-16.png
│           ├── icon-32.png
│           ├── icon-48.png
│           └── icon-128.png
├── fixtures/
│   ├── light-theme.html
│   ├── dark-theme.html
│   ├── deep-nesting.html
│   └── prompts/
│       ├── light-theme.golden.txt
│       ├── dark-theme.golden.txt
│       └── deep-nesting.golden.txt
├── docs/
│   ├── known-limitations.md
│   ├── smoke-checklist.md
│   └── byte-stability.md
└── .vscode/
    ├── settings.json
    └── launch.json
```

### Shared module responsibilities

| Module             | Single responsibility                                                                                              |
| ------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `pickerEngine`     | DOM picking, hover overlay sync, mode state machine, self-avoidance via host identity.                             |
| `styleMapper`      | Computed CSS → Tailwind subset; mirrors origin `TW_*` maps and `mapStyles()`; no widening in v1.                   |
| `promptBuilder`    | Byte-stable port of origin `buildPrompt()`; pure `(annotations, meta) => string`.                                  |
| `captureCrop`      | Requests `captureVisibleTab` from background, crops via DPR/scroll/element rect, returns PNG data URL.             |
| `storage`          | Typed wrapper around `chrome.storage.local` / `session` / `sync`; namespaces keys; handles quota errors.           |
| `messaging`        | Typed message router (`postMessage` + `sendResponse` adapters); discriminated-union envelopes.                     |
| `dom`              | `getElInfo`, label heuristics, selector synthesis, viewport-clip detection, `composedPath()` self-check helpers.   |

---

## Runtime architecture

### Text-only flow diagram

```text
 User gesture (toolbar click)
         │
         ▼
 ┌─────────────────────────────┐         ┌────────────────────────────────┐
 │ background.ts (MV3 SW)      │ ◄────── │ popup/App.tsx                  │
 │ - chrome.action.onClicked   │         │ - reads per-tab active flag    │
 │ - messaging router          │         │ - posts TOGGLE_OVERLAY         │
 └──────────────┬──────────────┘         └────────────────────────────────┘
                │ chrome.tabs.sendMessage(tabId, TOGGLE_OVERLAY)
                ▼
 ┌─────────────────────────────────────────────────────────────────────────┐
 │ content.ts (host page, run_at: document_end)                            │
 │ - guards restricted schemes                                              │
 │ - ensures shadow host element exists                                    │
 │ - attachShadow({ mode: 'closed' })                                       │
 │ - injects compiled overlay.css link inside the shadow root              │
 │ - createRoot(shadowRoot.querySelector('#root')).render(<Overlay/>)      │
 └──────────────┬──────────────────────────────────────────────────────────┘
                │ React state, pickerEngine listeners (capture phase)
                ▼
 ┌─────────────────────────────────────────────────────────────────────────┐
 │ pickerEngine + Overlay UI                                               │
 │ - mousemove → highlight box                                             │
 │ - click → annotation popup / transform handles / swap step / text edit  │
 └──────────────┬──────────────────────────────────────────────────────────┘
                │ captureCrop.requestCapture()
                ▼
 ┌─────────────────────────────────────────────────────────────────────────┐
 │ messaging → background.ts                                               │
 │ - chrome.tabs.captureVisibleTab(windowId, { format: 'png' })            │
 │ - returns dataUrl + viewport(width, height, dpr)                        │
 └──────────────┬──────────────────────────────────────────────────────────┘
                │ CAPTURE_VISIBLE_TAB_RESPONSE
                ▼
 ┌─────────────────────────────────────────────────────────────────────────┐
 │ content-side crop                                                       │
 │ - decode dataUrl → ImageBitmap                                          │
 │ - OffscreenCanvas draw at (rect.x*dpr, rect.y*dpr, w*dpr, h*dpr)        │
 │ - canvas.convertToBlob → FileReader → dataUrl                           │
 └──────────────┬──────────────────────────────────────────────────────────┘
                │ on copyPrompt:
                ▼
 ┌─────────────────────────────────────────────────────────────────────────┐
 │ navigator.clipboard.writeText(prompt)  +                                │
 │ messaging → background.ts → chrome.downloads.download(perAnnotation)    │
 └─────────────────────────────────────────────────────────────────────────┘
```

### z-index ladder (preserved from proposal acceptance criteria)

Defined inside the shadow root only; host pages cannot collide because of shadow encapsulation. We still pick high numeric values so any nested portals stay ordered:

| Layer                                | z-index   |
| ------------------------------------ | --------- |
| Hover highlight box                  | 2147480000|
| Selection / transform handles        | 2147481000|
| CSS tooltip                          | 2147482000|
| Annotation / text-edit / swap popups | 2147483000|
| Mode bar + annotations panel         | 2147483100|
| Toast / capture indicator            | 2147483200|

The shadow host element itself is fixed at `top:0;left:0;right:0;bottom:0;z-index:2147483647;pointer-events:none`.

### Restricted-scheme allow-list

Content script `matches` is `<all_urls>` but the script body short-circuits on:

```
chrome://*, chrome-extension://*, edge://*, about:*, moz-extension://*,
devtools://*, view-source:*, file://* (unless user grants it)
```

Behavior on excluded URLs:

- No shadow host is created.
- The toolbar popup shows "Esta página no permite la inyección del overlay" and the toggle is disabled.
- `chrome.action.setBadgeText({ text: '–' })` reflects the disabled state.

### Lifecycle

- **Toolbar click:** background sends `TOGGLE_OVERLAY` to the active tab. Content script flips `active`, persists per-tab flag in `chrome.storage.session`, and updates badge.
- **Tab navigation:** content script `beforeunload` removes the shadow host. WXT re-injects on the next `document_end`. Per-tab `active` persists; if it was `true`, overlay auto-remounts in disabled-by-default UI state until the user re-clicks (avoids surprise picker on cross-origin navigation).
- **SPA route change:** the host element is kept attached to `<body>`; we observe `popstate`/`pushState` via a `history` shim only to refresh `meta.path` for `promptBuilder`. The React tree is not remounted.
- **SW wake-up:** background is stateless beyond `chrome.storage` reads; any in-flight message uses `chrome.runtime.sendMessage` which auto-wakes the worker.

---

## Message contracts

All messages share a discriminated-union envelope:

```ts
type Envelope<K extends string, P> = { kind: K; reqId: string; payload: P };
type Response<P> = { ok: true; payload: P } | { ok: false; error: ExtError };

interface ExtError { code: 'RESTRICTED_URL' | 'CAPTURE_FAILED' | 'DOWNLOAD_FAILED'
                     | 'INVALID_STATE' | 'UNKNOWN'; message: string }
```

### Capture

```ts
type CaptureVisibleTabRequest = Envelope<'CAPTURE_VISIBLE_TAB_REQUEST', {
  tabId?: number;                 // optional; SW resolves active tab otherwise
}>;

type CaptureVisibleTabResponse = Response<{
  dataUrl: string;                // image/png
  viewport: { width: number; height: number; dpr: number };
  capturedAt: number;             // epoch ms
}>;
```

Owner: **background** owns the `chrome.tabs.captureVisibleTab` call. Content sends the request and decodes the result.

### Download

```ts
type DownloadPngRequest = Envelope<'DOWNLOAD_PNG_REQUEST', {
  dataUrl: string;
  filename: string;               // e.g. 'vibecopilot-01-annotate.png'
  conflictAction: 'uniquify';     // fixed; matches Chrome's default behavior
}>;

type DownloadPngResponse = Response<{ downloadId: number }>;
```

Owner: **background** owns `chrome.downloads.download`. Filename must match the byte-stable convention; content is responsible for assembling the name.

### Overlay toggle

```ts
type ToggleOverlay = Envelope<'TOGGLE_OVERLAY', {
  tabId: number;
  next?: boolean;                 // if omitted, flip current value
}>;
```

Owner: **background** writes the per-tab flag in `chrome.storage.session`; the **content script** subscribes via `chrome.storage.onChanged`. The popup also reads/writes the flag through the background router (never directly) so all writes funnel through one place.

### Storage-key ownership

| Key                                | Surface       | Owner (writes)      | Readers                           |
| ---------------------------------- | ------------- | ------------------- | --------------------------------- |
| `session:overlayActive:<tabId>`    | session       | background          | content, popup                    |
| `local:annotations:<tabId>:<origin>` | local       | content             | content                           |
| `local:annotations:lastTouched`    | local         | content             | content (GC)                      |
| `sync:prefs`                       | sync          | popup / options     | content, popup                    |

---

## State model

Names follow the origin component so reviewers can cross-reference line-by-line.

| Origin name           | Lives as          | Persisted?                 | Notes                                                                |
| --------------------- | ----------------- | -------------------------- | -------------------------------------------------------------------- |
| `active`              | React state       | `chrome.storage.session`   | Per-tab toggle; rehydrated on remount.                               |
| `tool`                | React state       | `chrome.storage.sync.prefs.defaultTool` (last value) | Default tool persists across tabs.            |
| `annotations`         | React state       | `chrome.storage.local`     | Keyed by `<tabId>:<origin>`; capped at ~256 KB per key (see schema). |
| `history`             | React state       | session-only (in-memory)   | Cap 20 entries; never persisted.                                     |
| `panelOpen`           | React state       | not persisted              |                                                                       |
| `highlight`           | React state       | not persisted              | High-frequency; debounced via `requestAnimationFrame`.               |
| `popup`               | React state       | not persisted              |                                                                       |
| `comment`             | React state       | not persisted              | Local-only form input.                                               |
| `capturing`           | React state       | not persisted              | UI indicator only.                                                    |
| `cssTooltip`          | React state       | not persisted              |                                                                       |
| `textEditPopup`       | React state       | not persisted              | Includes `{ el, elementInfo, originalText, newText, comment }`.       |
| `selEl`               | **ref**           | not persisted              | Direct DOM reference; not safe in state.                              |
| `acc`                 | React state       | not persisted              | Transform accumulator `{ dx, dy, w, h }`.                            |
| `showSaveForm`        | React state       | not persisted              |                                                                       |
| `transformComment`    | React state       | not persisted              |                                                                       |
| `capturedBefore`      | React state       | not persisted              | Holds "antes" dataUrl until save.                                    |
| `savingTransform`     | React state       | not persisted              |                                                                       |
| `swapStep`            | React state       | not persisted              |                                                                       |
| `swapA`               | React state       | not persisted              | Source element info (snapshot, not live ref).                        |
| `swapPopup`           | React state       | not persisted              |                                                                       |
| `swapComment`         | React state       | not persisted              |                                                                       |
| `origStylesRef`       | **ref**           | not persisted              | Snapshot for transform cancel.                                        |
| `origRectRef`         | **ref**           | not persisted              |                                                                       |
| `dragRef`             | **ref**           | not persisted              | Pointer drag origin.                                                  |
| `selElRef`            | **ref**           | not persisted              | Mirrors `selEl` for event handlers.                                   |

History stack is capped at 20 entries via `prev.slice(-19)` exactly as in the origin (`pushHistory` parity).

---

## Annotation data model

```ts
// Shared by all annotation types
interface ElementInfo {
  tag: string;
  classes: string;                 // space-joined, ≤ 8 entries, each ≤ 50 chars
  text: string;                    // trimmed, ≤ 80 chars
  label: string;                   // aria-label || title || ''
  parentTag: string;
  twClasses: string[];             // styleMapper output
  rawStyles: {
    bg: string; color: string;
    fontSize: string; fontWeight: string;
    padding: string;               // "Tpx Rpx Bpx Lpx"
    borderRadius: string;
    display: string; position: string;
  };
  rect: { top: number; left: number; width: number; height: number };
}

interface BaseAnnotation {
  id: string;                      // crypto.randomUUID()
  createdAt: number;               // epoch ms
  elementInfo: ElementInfo;
  comment?: string;
}

interface AnnotateRecord extends BaseAnnotation {
  type: 'annotate';
  screenshot?: string;             // png dataUrl, optional
}

interface TransformRecord extends BaseAnnotation {
  type: 'transform';
  transform: {
    dx: number; dy: number;
    origW: number; origH: number;
    newW: number; newH: number;
  };
  screenshotBefore?: string;
  screenshotAfter?: string;
}

interface SwapRecord extends BaseAnnotation {
  type: 'swap';
  targetInfo: ElementInfo;         // destination element
}

interface TextEditRecord extends BaseAnnotation {
  type: 'text-edit';
  originalText: string;
  newText: string;
  screenshot?: string;
}

type Annotation = AnnotateRecord | TransformRecord | SwapRecord | TextEditRecord;

// Bundle handed to copyPrompt → promptBuilder + downloads
interface ExportBundle {
  prompt: string;                  // promptBuilder output
  assets: Array<{ filename: string; dataUrl: string }>;
  meta: { path: string; viewport: { w: number; h: number }; date: string };
}
```

Fields the prompt template reads (from `buildPrompt()` parity):

- All `elementInfo.*` fields are read.
- `comment` for annotate/transform/swap/text-edit.
- `transform.{dx,dy,origW,origH,newW,newH}` for transform.
- `targetInfo` for swap.
- `originalText`, `newText` for text-edit.
- `screenshot`, `screenshotBefore`, `screenshotAfter` toggle the `[📸 ...]` reference lines.

Required vs optional:

- Required on every record: `id`, `createdAt`, `type`, `elementInfo`.
- Required by type: `transform` on `TransformRecord`; `targetInfo` on `SwapRecord`; `originalText`+`newText` on `TextEditRecord`.
- Optional everywhere: `comment`, all screenshots.

---

## Capture pipeline

Step-by-step, content side:

1. User triggers a capture (annotate save with screenshot toggled, transform "antes"/"después", text-edit save).
2. `captureCrop.requestCapture(el)` reads `el.getBoundingClientRect()` and current `devicePixelRatio` synchronously.
3. Content sends `CAPTURE_VISIBLE_TAB_REQUEST` to background via `chrome.runtime.sendMessage`.
4. Background calls `chrome.tabs.captureVisibleTab(windowId, { format: 'png' })` and resolves with `{ dataUrl, viewport: { width, height, dpr: <reported by content via the request> } }`.
   - Background does **not** know DPR; the content script attaches its own `devicePixelRatio` to the request payload, and background echoes it back unchanged.
5. Content decodes the dataUrl: `fetch(dataUrl).then(r => r.blob()).then(createImageBitmap)`.
6. Content allocates an `OffscreenCanvas(width: rect.width * dpr, height: rect.height * dpr)` and draws the bitmap at offset `(-rect.left * dpr, -rect.top * dpr)`.
7. `canvas.convertToBlob({ type: 'image/png' })` → `FileReader.readAsDataURL` → final dataUrl.
8. The dataUrl is stored on the annotation record; on `copyPrompt` it is sent to background as a `DOWNLOAD_PNG_REQUEST`.

### DPR cropping math (formal)

Given:

- `vp = { width, height }` from `captureVisibleTab` (image pixels, already DPR-scaled by Chrome).
- `dpr = window.devicePixelRatio`.
- `r = el.getBoundingClientRect()` (CSS pixels, relative to viewport).

Crop region in image pixels:

```
sx = round(r.left   * dpr)
sy = round(r.top    * dpr)
sw = round(r.width  * dpr)
sh = round(r.height * dpr)
```

Clip to `[0, vp.width] × [0, vp.height]`; if the resulting `sw` or `sh` is < 1, we abort and return `null` with `{ code: 'CAPTURE_FAILED', message: 'Element outside viewport' }`.

### Error handling and graceful degradation

- **No screenshot path:** if capture returns `null` or the user disables screenshots in the popup, the annotation is saved without `screenshot*` fields, and `buildPrompt()` simply omits the `[📸 ...]` line (parity with origin behavior).
- **Restricted scheme during capture:** background returns `RESTRICTED_URL`; content surfaces a toast and continues saving without a screenshot.
- **Clipped element:** detected by the clip step above; the overlay shows an inline warning "Elemento fuera del viewport — desplaza para capturar" and does not save a screenshot.
- **DownloadFailed:** logged to console; `copyPrompt` still copies text. Prompt parity is preserved because `[📸 ...]` lines were emitted optimistically based on the dataUrl presence at save time.

### Why not html2canvas in v1

- ~80 KB bundle hit on a content script that should stay light.
- CORS-tainted canvases break `toDataURL()` on real pages.
- Web fonts and pseudo-elements often render incorrectly.
- The user-owned origin already used it as a primary path but the extension has a strictly better primary (`captureVisibleTab`); the only marginal benefit is for clipped elements, which scrolling addresses.

---

## Prompt builder parity strategy

Goal: `promptBuilder.build(annotations, meta)` produces byte-identical output to the origin `buildPrompt(annotations)` for an equivalent annotation list and viewport context.

Approach:

1. **Literal port to TypeScript.** No reformatting, no string-template rewrites, no array spread changes. The `lines.push(...)` sequence stays in the same order; the `'─'.repeat(44)` divider, `'== VIBECOPILOT PROMPT =='` header, `'== FIN VIBECOPILOT PROMPT =='` footer all stay verbatim.
2. **Locale lock.** Date string is computed as `new Date().toLocaleDateString('es-ES', { dateStyle: 'long' })` exactly as in the origin. For deterministic fixtures we accept a `meta.date` override:

   ```ts
   build(annotations, { date?: string; path?: string; viewport?: {w:number; h:number} })
   ```

   When `meta.date` is provided (used by golden tests/fixtures), the builder uses it directly; otherwise it falls back to live locale formatting.
3. **Meta extraction.** `window.location.pathname`, `window.innerWidth`, `window.innerHeight` are read at call-site in `Overlay.tsx` and passed in via `meta`. The builder is pure.
4. **Type label parity.** The `typeLabel()` map is duplicated verbatim:
   - `annotate` → `Anotación`
   - `transform` → `Reposición`
   - `swap` → `Intercambio`
   - `text-edit` → `Edición de Texto`
5. **Screenshot reference lines.** Filenames are zero-padded via `String(i + 1).padStart(2, '0')` and use the same emoji and bracket formatting (`[📸 vibecopilot-NN-<type>.png — adjuntar en el chat]`).
6. **Footer trigger phrase.** The `hasScreenshots` block at the end is preserved with the same text and ordering.
7. **Golden fixtures.** `fixtures/prompts/<name>.golden.txt` are produced once from the origin component using each fixture page and a canned annotation list, then committed. Until Vitest lands, `sdd-verify` does a `git diff --no-index` against a regenerated file.

### Headers and dividers emitted

- Top banner: `== VIBECOPILOT PROMPT ==`
- Header lines: `Fecha:`, `Pantalla:`, `Viewport:`
- Section dividers: 44 × `─` (U+2500) before/after each section title.
- Section titles: `ROL`, `CAMBIOS VISUALES SOLICITADOS`, `INSTRUCCIONES`.
- Per-annotation header: `### CAMBIO N — <typeLabel>`.
- Footer banner: `== FIN VIBECOPILOT PROMPT ==`.

---

## Output and downloads

### Filename convention (preserved)

| Annotation type      | Filename pattern                                  |
| -------------------- | ------------------------------------------------- |
| `annotate`           | `vibecopilot-NN-annotate.png`                     |
| `text-edit`          | `vibecopilot-NN-text-edit.png`                    |
| `transform` (before) | `vibecopilot-NN-before.png`                       |
| `transform` (after)  | `vibecopilot-NN-after.png`                        |

`NN = String(i + 1).padStart(2, '0')` where `i` is the index in the **current** `annotations` array at copy time.

### Counter behavior on repeated `copyPrompt`

The counter is **derived from `annotations.length` at copy time**, not stored. Calling `copyPrompt` twice in the same session with the same `annotations` list produces identical filenames; Chrome's `conflictAction: 'uniquify'` then appends ` (1)`, ` (2)`, etc., so the prompt text still references the canonical name but the on-disk files won't clobber.

A small UI hint near the copy button shows "Los nombres pueden incluir sufijo si descargas la misma sesión dos veces" the second time `copyPrompt` runs.

### Clipboard caveats

- `navigator.clipboard.writeText` requires a user gesture and a focused document. Since `copyPrompt` is bound to a button click inside the shadow root, the gesture chain is preserved as long as nothing async happens before the call.
- The implementation does `await clipboard.writeText(prompt)` **first**, then fires the download requests, to avoid losing the user gesture token mid-async.
- Fallback path: if `clipboard.writeText` rejects (browser quirk, permission denied), we create a hidden `<textarea>` inside the shadow root, `select()` it, and call `document.execCommand('copy')` — same trick the origin component uses.

---

## Shadow DOM and styling

- **Mode:** `attachShadow({ mode: 'closed' })`.
- **CSS bundling:** Tailwind directives live in `src/styles/overlay.css`. WXT/Vite compiles them into `dist/.../assets/overlay.css`. At mount time the content script fetches that asset via `chrome.runtime.getURL('assets/overlay.css')`, builds a `CSSStyleSheet`, and uses `shadowRoot.adoptedStyleSheets = [sheet]`. If `adoptedStyleSheets` is unavailable we fall back to a `<link rel="stylesheet" href="...">` inside the shadow root.
- **Theme tokens:** `src/styles/tokens.css` defines `--vc-bg`, `--vc-fg`, `--vc-accent`, etc., scoped to `:host`. Dark-first by default; a `data-theme="light"` attribute on the root wrapper flips tokens. Theme preference comes from `chrome.storage.sync.prefs.theme`.
- **z-index inside the shadow root:** see the ladder in the runtime architecture section. All values are local to the shadow tree; the host element is the only thing that competes with the host page (set to max int).
- **Pointer-events strategy:**
  - Shadow host element: `pointer-events: none` (so users can click through to the page).
  - Inner UI containers (mode bar, popups, panel, handles): `pointer-events: auto`.
  - Highlight box: `pointer-events: none` (read-only visual).
- **Self-avoidance:** every pointer listener checks `e.composedPath().includes(shadowHostEl)`. We **never** rely on class prefixes like `data-copilot`; the host element identity is the single source of truth. `pickerEngine.isOwnUi(target: EventTarget): boolean` encapsulates this check.

---

## Picker mode state machine

```
                        ┌──────────┐
                        │   idle   │
                        └────┬─────┘
              tool=annotate / click
                        ▼
                ┌──────────────┐
                │   annotate   │  ── dblclick ──▶ textEdit.popup
                └─┬──────────┬─┘
       save/ESC  │          │ click on element
                 │          ▼
                 │   (popup open, comment input)
                 ▼
              annotate  ◀── Ctrl/Cmd+Enter ──┐
                                              │
   tool=transform                             │
        │                                     │
        ▼                                     │
 ┌──────────────────┐  click   ┌─────────────────────┐
 │ transform.select │ ───────▶ │ transform.dragging  │
 └──────────────────┘          └──────┬──────────────┘
        ▲     ▲                       │ pointerup
        │     │                       ▼
        │     │             ┌─────────────────────┐
        │     │   handle   │ transform.resizing  │
        │     └──────────  └──────┬──────────────┘
        │                          │ pointerup
        │                          ▼
        │                ┌────────────────────────┐
        └── ESC/cancel ◀ │ transform.saveForm     │
                         └────────────────────────┘

   tool=swap
        │
        ▼
   ┌─────────────┐ click ┌──────────────┐ click ┌────────────┐
   │ swap.first  │──────▶│ swap.second  │──────▶│ swap.popup │
   └─────────────┘       └──────────────┘       └─────┬──────┘
                                                       │ save/ESC
                                                       ▼
                                                    annotate
```

### Allowed transitions

- From any state, `tool` switch returns the machine to that tool's entry state (`idle` for the new tool's "first" step) and clears any in-flight selection.
- `ESC` layering (preserved from origin lines 405-423):
  1. `textEdit.popup` → close popup, back to `annotate`.
  2. `popup` (annotate save form) → close popup, back to `annotate`.
  3. `swap.popup` → close popup, back to `swap.second`.
  4. `swap.second` → back to `swap.first` (clears `swapA`).
  5. `transform.{dragging,resizing,saveForm}` → cancelTransform (restores original styles), back to `transform.select`.
  6. Otherwise → `active=false` (overlay off).
- `Ctrl/Cmd+Z`: only when overlay is active and no input is focused; pops `history`, replaces `annotations`. Preventing default prevents the host page from undoing its own state.
- `Ctrl/Cmd+Enter`: saves the currently open form for annotate, swap, and text-edit. Decision: transform save form **also** honors Ctrl/Cmd+Enter for consistency (origin omitted it; this is a small, parity-safe extension noted in the spec).

---

## Storage schema

### `chrome.storage.local` — annotations per tab+origin

Key format: `annotations:<tabId>:<origin>`, e.g. `annotations:42:https://example.com`.

Value:

```ts
{
  version: 1;
  updatedAt: number;
  annotations: Annotation[];   // includes inline dataUrls
}
```

**Caps and GC:**

- Hard cap per key: ~256 KB (Chrome `storage.local` is 5 MB total). If a write would exceed, we drop the oldest annotation's screenshots first, then the oldest annotations entirely, and emit a console warning.
- Soft cap on annotations: 50 records per tab+origin; older are trimmed FIFO.
- GC policy: on every content-script start, iterate keys matching `annotations:*` and drop any whose `updatedAt` is older than 7 days. Also drop keys whose `tabId` is not in `chrome.tabs.query({})`.

### `chrome.storage.session` — per-tab overlay flag

Key: `overlayActive:<tabId>`. Value: `boolean`. Cleared by Chrome on browser restart by design.

### `chrome.storage.sync` — preferences

Key: `prefs`. Value:

```ts
{
  version: 1;
  theme: 'dark' | 'light';
  defaultTool: 'annotate' | 'transform' | 'swap' | 'text-edit';
  activateOnLoad: boolean;
  hotkeys: { undo: string; save: string; cancel: string };  // strings for future remap
}
```

### Migration

**None** from the origin `localStorage` key `vibe-copilot:<hostname>`. Documented in `docs/known-limitations.md`: users with existing in-app annotations must re-create them after switching to the extension. Cross-storage migration is out of scope and low-value.

---

## Build and packaging

### WXT entry points

- `src/entrypoints/background.ts` → MV3 service worker.
- `src/entrypoints/content.ts` → content script, `matches: ['<all_urls>']`, `runAt: 'document_end'`, `world: 'ISOLATED'`.
- `src/entrypoints/popup/index.html` + `popup/App.tsx` → toolbar popup.

### npm scripts (planned)

```jsonc
{
  "scripts": {
    "dev": "wxt",
    "dev:firefox": "wxt -b firefox",
    "build": "wxt build",
    "build:firefox": "wxt build -b firefox",
    "zip": "wxt zip",
    "zip:firefox": "wxt zip -b firefox",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  }
}
```

### Output paths

- Unpacked dev: `.output/chrome-mv3/` (loaded via `chrome://extensions → Load unpacked`).
- Production ZIP: `.output/chrome-mv3.zip`.
- Firefox builds land in `.output/firefox-mv2.zip` (not smoked in v1 but produced).

### Icons

| File          | Size  | Usage                          |
| ------------- | ----- | ------------------------------ |
| `icon-16.png` | 16²   | Favicon / extensions list      |
| `icon-32.png` | 32²   | Windows taskbar                |
| `icon-48.png` | 48²   | Extension management page      |
| `icon-128.png`| 128²  | Web Store listing              |

A simple monogram on a dark rounded square is sufficient for v1; full brand work is a publishing-phase concern.

### Source maps

- **Dev:** inline source maps via Vite default.
- **Production build:** external `.map` files emitted but **not** included in the ZIP uploaded to the Web Store. WXT's `analyzeBundle` is enabled in dev only.

---

## Chained PR plan

Each PR is sized against the 400-line review budget. "Lines" counts hand-written code only (lockfile and WXT-generated manifests excluded from the budget by reviewer convention; they are noted in PR descriptions).

| #  | PR title                                                             | Est. lines | Review notes                                                                                              |
| -- | -------------------------------------------------------------------- | ---------: | --------------------------------------------------------------------------------------------------------- |
| 1  | `feat(bootstrap): WXT + TS + React + Tailwind scaffold`              | 280-360    | Manifest, `wxt.config.ts`, `package.json`, `tsconfig`, Tailwind config, empty entrypoints, icons.         |
| 2  | `feat(shared): styleMapper, promptBuilder, dom helpers, types`       | 320-400    | Pure modules + their golden-fixture-friendly signatures. Includes `fixtures/` HTML and golden prompts.     |
| 3  | `feat(capture): messaging, captureCrop, background download handler` | 300-380    | Adds background SW logic, content-side DPR crop, message envelopes. Manual smoke against fixture 1.        |
| 4  | `feat(overlay): shadow host, picker engine, annotate mode`           | 360-400    | Shadow host bootstrap, `pickerEngine`, `Overlay.tsx`, `AnnotationPopup`, `HighlightBox`, undo/ESC layer.  |
| 5  | `feat(overlay): transform mode (drag/resize, before/after capture)`  | 300-380    | Adds `TransformLayer`, transform state, save form, screenshot pre/post hooks.                              |
| 6  | `feat(overlay): swap mode + text-edit mode`                          | 280-360    | Adds `SwapPopup`, `TextEditPopup`, two-step swap state, dblclick handler.                                  |
| 7  | `feat(packaging): popup UI, smoke docs, known-limitations`           | 180-260    | Popup `App.tsx`, `docs/smoke-checklist.md`, `docs/known-limitations.md`, `docs/byte-stability.md`.         |

**Budget risk flags:**

- PR #2 risks crossing 400 if all three golden fixtures are large; mitigation is to commit the golden files separately as a follow-up commit reviewed by inspection (they are generated artifacts).
- PR #4 is the tightest; if review estimates climb during apply, split into 4a (shadow host + picker engine, no UI yet) and 4b (annotate UI + undo). Decision point at the end of PR #3.

Order is fixed: capture pipeline lands before any picker mode because the screenshot dependency is shared, and `promptBuilder` lands before any UI that calls `copyPrompt`.

---

## Risks and mitigations

| Risk (from proposal)                                                | Mitigation                                                                                                              |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Clipboard quirks across browsers / focus                            | Call `clipboard.writeText` synchronously inside the click handler before any `await`; fall back to `execCommand('copy')` inside the shadow root. |
| `html2canvas` CORS / tainted-canvas edge cases                      | Dropped from v1; viewport-only via `captureVisibleTab`. Documented in `docs/known-limitations.md`.                       |
| Shadow DOM event retargeting, focus, pointer capture                | All listeners use capture phase and `composedPath()`; `isOwnUi()` is the only self-check. Focus traps live inside the shadow root via `tabindex`. |
| Restricted-scheme injection failures                                | Allow-list in content script + popup disabled-state UI; toolbar badge `–`.                                              |
| DPR / zoom / scroll off-by-one crop errors                          | DPR math centralized in `captureCrop`; rounding rules documented; clipped-element warning surfaces in UI.                |
| WXT new to repo                                                     | Bootstrap PR is isolated and reviewable on its own; smoke checklist verifies dev/build/zip lifecycle.                    |
| License posture (no Drawbridge / All Rights Reserved code)          | Only user-owned `CopilotOverlay.jsx` is referenced; semantics ported, not pasted. Reviewer checklist item in PR template.|
| Large diff if everything lands together                             | Chained PR plan above; each ≤ 400 hand-written lines.                                                                    |
| `copyPrompt` byte-stability regression                              | Golden fixtures + `git diff --no-index` step in `sdd-verify` until Vitest is added.                                      |
| `chrome.storage.local` quota exhaustion                              | Per-key cap + FIFO trim + 7-day GC documented in storage schema.                                                         |

---

## Verification plan (interim, pre-test-runner)

Until Vitest + `@testing-library/react` land, `sdd-verify` runs a manual smoke pass using the committed fixtures.

### Smoke checklist (`docs/smoke-checklist.md` skeleton)

1. **Build & load**
   - `npm run build` produces `.output/chrome-mv3/`.
   - Load unpacked in Chrome; toolbar icon appears.
2. **Restricted-scheme guard**
   - Open `chrome://extensions`; toolbar popup shows the disabled message.
3. **Fixture: light-theme.html**
   - Toggle overlay; pick the heading; save annotation with screenshot.
   - Verify highlight box, popup, and CSS tooltip render inside the shadow root.
   - `copyPrompt`; diff clipboard text against `fixtures/prompts/light-theme.golden.txt`.
   - Verify `vibecopilot-01-annotate.png` downloaded with non-zero size.
4. **Fixture: dark-theme.html**
   - Annotate a button; verify `bg-*`, `text-*`, `p-*` Tailwind hints match the dictionary.
   - Run transform mode; drag + resize; save; check before/after PNGs.
5. **Fixture: deep-nesting.html**
   - Pick the deepest element; verify `parentTag`, `label`, and `classes` truncation match origin behavior.
   - Run swap mode A→B; verify `→ REPOSICIONAR HACIA:` line in prompt.
   - Run text-edit on a paragraph; verify `Texto actual:` / `Texto propuesto:` lines.
6. **Keyboard layering**
   - Trigger ESC stack through textEdit popup → annotate popup → swap popup → swap step → transform → overlay off.
   - Ctrl/Cmd+Z undoes the most recent annotation.
   - Ctrl/Cmd+Enter saves each open form.
7. **Per-tab toggle**
   - Open two tabs; toggle one; verify the other is unaffected.
   - Reload toggled tab; verify overlay reflects per-tab session flag.
8. **Quota / GC**
   - Inspect `chrome.storage.local` in DevTools after saving; verify keys are `annotations:<tabId>:<origin>`.

### Fixture pages and verification focus

| Fixture                  | Verifies                                                                          |
| ------------------------ | --------------------------------------------------------------------------------- |
| `light-theme.html`       | Tailwind color/spacing mapping, screenshot crop math, golden prompt diff.         |
| `dark-theme.html`        | Dark-mode style extraction, transform before/after PNG naming.                    |
| `deep-nesting.html`      | `getElInfo` label/parent/class truncation, swap and text-edit prompt lines.       |

### Byte-stability check procedure

1. Open the fixture page in the browser (served via `npx http-server fixtures/`).
2. Enable the overlay; replay the recorded annotation list (steps documented in `docs/byte-stability.md`).
3. Click `Copiar Prompt`; paste into `/tmp/actual.txt`.
4. Run `git diff --no-index fixtures/prompts/<name>.golden.txt /tmp/actual.txt`.
5. Diff must be empty (except for the `Fecha:` line, which is locale-time-dependent; we strip that single line before diffing using a `grep -v ^Fecha:` filter documented in the doc).
6. Repeat for each fixture.

---

## Deferred (follow-up changes)

The following are explicitly out of this change and tracked as separate proposals:

- **`widen-tailwind-mapping`** — extend the `TW_*` dictionaries (or vendor a curated table) once byte-stability of the v1 port is established with golden fixtures.
- **`verify-firefox-build`** — first-class Firefox smoke pass via `wxt -b firefox`; ensure shadow-root CSS adoption and `browser.storage` parity behave.
- **`html2canvas-fallback-for-clipped-elements`** — reintroduce `html2canvas` behind a feature flag if real users hit viewport-clipped-element friction.
- **`side-panel-annotations-list`** — move the in-overlay annotations panel into a Chrome side panel for richer management without changing the prompt contract.
- **`side-panel-prompt-editor`** — preview and edit the assembled prompt in a side panel before copy/download.
- **`remove-copilot-overlay-from-quien-es-quien`** — a change in the `Quien-es-quien` repository to delete `CopilotOverlay.jsx` and its `App.jsx` mount after extension parity is verified.

These belong in separate proposals because each independently changes scope, dependencies, or another repository.
