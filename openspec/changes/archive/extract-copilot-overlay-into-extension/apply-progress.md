# Apply Progress: extract-copilot-overlay-into-extension

## PR 1 — Bootstrap WXT extension shell

### Completed tasks

- Created WXT + React + TypeScript bootstrap files: `package.json`, `wxt.config.ts`, and `tsconfig.json`.
- Added npm scripts: `dev`, `dev:firefox`, `build`, `build:firefox`, `zip`, and `typecheck`.
- Configured Chrome MV3 manifest metadata, toolbar action, permissions (`activeTab`, `storage`, `scripting`, `downloads`), host permissions (`<all_urls>`), and content script `document_end` matching through WXT.
- Added placeholder PNG icons under `public/icons/`.
- Added `src/entrypoints/background.ts` with toolbar click toggle, per-tab `chrome.storage.session` active flag, restricted-scheme guard, badge handling, and acknowledged content toggle messaging. The active flag is persisted only after the content script confirms receipt; unavailable pages revert to off.
- Added `src/entrypoints/content.tsx` with restricted-scheme guard and a minimal React marker mounted into a closed Shadow DOM host.
- Added a minimal `src/entrypoints/popup/App.tsx` placeholder, but intentionally did not enable a popup manifest entry because Chrome disables `chrome.action.onClicked` when `default_popup` is present; direct toolbar click toggle is required for PR 1.
- Added fixture stubs: `fixtures/light.html`, `fixtures/dark.html`, `fixtures/nested.html`, and `fixtures/prompts/.gitkeep`.
- Updated `README.md` with install/build/load-unpacked and PR 1 smoke commands.
- Updated PR 1 task checkboxes in `tasks.md` for completed implementation and automated checks.

### Files changed

- `package.json`
- `package-lock.json` (npm-generated dependency lockfile; excluded from hand-written review budget)
- `wxt.config.ts`
- `tsconfig.json`
- `README.md`
- `public/icons/icon-16.png`
- `public/icons/icon-32.png`
- `public/icons/icon-48.png`
- `public/icons/icon-128.png`
- `src/entrypoints/background.ts`
- `src/entrypoints/content.tsx`
- `src/entrypoints/popup/App.tsx`
- `fixtures/light.html`
- `fixtures/dark.html`
- `fixtures/nested.html`
- `fixtures/prompts/.gitkeep`
- `openspec/changes/extract-copilot-overlay-into-extension/tasks.md`
- `openspec/changes/extract-copilot-overlay-into-extension/apply-progress.md`

### Verification commands run

| Command | Result |
| --- | --- |
| `npm install` | Passed; installed 372 packages, 0 vulnerabilities. |
| `npm run typecheck` | Passed after `wxt prepare`; `tsc --noEmit` succeeded. |
| `npm run build` | Passed; produced `.output/chrome-mv3/` with manifest, background, content script, and icons. |
| `npm install react@18.3.1 react-dom@18.3.1 @types/react@18.3.23 @types/react-dom@18.3.7 --save-exact` | Passed; pinned React baseline to 18 and regenerated lockfile. |
| `npm install @vitejs/plugin-react@6.0.2 @wxt-dev/module-react@1.2.2 wxt@0.20.26 @types/chrome@0.1.42 typescript@6.0.3 --save-exact` | Passed; replaced `latest` ranges with exact versions. |
| `npm run typecheck` | Passed after reviewer fixes. |
| `npm run build` | Passed after reviewer fixes. |

### TDD Cycle Evidence

Strict TDD is not active for this repository (`openspec/config.yaml` has `strict_tdd: false` and no detected runner), so no RED/GREEN/REFACTOR cycles were required for PR 1.

### Deviations from design

- Popup entrypoint is not enabled in the manifest for PR 1. This preserves direct toolbar click toggling via `chrome.action.onClicked`, which Chrome suppresses if `action.default_popup` exists. A placeholder `App.tsx` is present for later popup work.
- Placeholder icons are 1x1 PNG stubs for bootstrap verification only; real icon artwork remains a later packaging concern.
- Fixture pages are minimal stubs, not the fuller prompt/style fixtures planned for PR 2+.

### Reviewer-requested fixes applied

- Fixed toolbar toggle correctness: `background.ts` now sends `VIBE_COPILOT_TOGGLE` and persists `overlayActive:<tabId>` only after the content script acknowledges `{ ok: true }`. If `sendMessage` fails on pages such as `file://` without access or other non-injectable URLs, the extension writes inactive state and clears the badge instead of claiming `ON`.
- Fixed dependency drift risk: `package.json` no longer uses `latest`; React is pinned to the approved React 18 baseline and extension/tooling packages are pinned to the installed versions.

### Remaining tasks

- Manual Chrome verification was not executed in this headless/tool environment: load `.output/chrome-mv3/`, click the toolbar icon on an allowed fixture page, verify marker on/off, restricted-scheme quiet behavior, and per-tab isolation.
- PR 2 should add shared data contracts, DOM info, style mapper, prompt builder, and richer fixtures/goldens.

### Workload / PR boundary

- Delivery path: stacked chain, PR 1 only.
- Hand-written PR 1 line estimate from `wc -l` over `package.json`, configs, README, fixtures, public icon placeholders, and `src/`: 335 lines. `package-lock.json`, `.wxt/`, `.output/`, and `node_modules/` are generated/dependency artifacts and excluded from the review-line budget.

## PR 2 — Shared data contracts, DOM info, style mapper, prompt builder fixtures

### Completed tasks

- Added `src/shared/types.ts` with shared `ElementInfo`, annotation unions, prompt/export metadata, viewport, raw style, and extension response/error contracts.
- Added `src/shared/styleMapper.ts` with the v1 partial Tailwind dictionaries and `mapStyles` behavior ported from the user-owned origin semantics without widening coverage.
- Added `src/shared/dom.ts` with `getElInfo`, body/html exclusion, class/text/label/parent extraction, rounded viewport rects, viewport clipping check, and Shadow DOM self-check helper signatures.
- Added `src/shared/promptBuilder.ts` with pure prompt construction, Spanish headers/footer, 44-character divider lines, type labels, screenshot markers, filename helper, and optional date/pathname/viewport overrides.
- Finalized `fixtures/light.html`, `fixtures/dark.html`, and `fixtures/nested.html` with distinct style and DOM-depth cases.
- Added compact mixed golden prompt fixture `fixtures/prompts/mixed.golden.txt` and `docs/byte-stability.md` manual diff procedure.
- Updated PR 2 task checkboxes in `tasks.md`.

### Files changed

- `src/shared/types.ts`
- `src/shared/styleMapper.ts`
- `src/shared/dom.ts`
- `src/shared/promptBuilder.ts`
- `fixtures/light.html`
- `fixtures/dark.html`
- `fixtures/nested.html`
- `fixtures/prompts/mixed.golden.txt`
- `docs/byte-stability.md`
- `openspec/changes/extract-copilot-overlay-into-extension/tasks.md`
- `openspec/changes/extract-copilot-overlay-into-extension/apply-progress.md`

### Verification commands run

| Command | Result |
| --- | --- |
| `npx vite-node /tmp/make-vc-golden.ts > fixtures/prompts/mixed.golden.txt` | Passed; generated the compact mixed prompt golden from `buildPrompt()` using deterministic metadata. |
| `npm run typecheck` | Failed first on discriminated-union screenshot property access in `promptBuilder.ts`; fixed with `in` guards. |
| `npm run typecheck` | Passed after fix; `tsc --noEmit` succeeded. |
| `npm run build` | Passed; WXT produced `.output/chrome-mv3/`. |
| `git diff --no-index fixtures/prompts/mixed.golden.txt /tmp/vibecopilot-actual.txt` | Passed; no prompt differences for regenerated deterministic mixed fixture. |
| `npm run typecheck` | Passed after reviewer nit fix (`ExportBundle.meta.pathname`). |
| `npm run build` | Passed after reviewer nit fix. |

### TDD Cycle Evidence

Strict TDD is not active for this repository (`openspec/config.yaml` has `strict_tdd: false` and no detected runner), so no RED/GREEN/REFACTOR cycles were required for PR 2.

### Deviations from design

- To keep PR 2 reviewable, committed one compact mixed golden prompt instead of three large per-fixture goldens. `docs/byte-stability.md` documents larger per-page golden refresh as a PR 7/manual-verification follow-up once live picker flows exist.
- No prompt fixture generator script was committed; the one-time fixture was generated through a temporary `vite-node` script and the manual diff procedure is documented instead.

### Reviewer-requested fixes applied

- Unified `PromptMeta.pathname` and `ExportBundle.meta.pathname` naming in `src/shared/types.ts`; removed the inconsistent `meta.path` field before PR 3.

### Remaining tasks

- Manual browser-console inspection of `getElInfo()` on all three fixtures remains for a future wired/dev-harness pass.
- PR 3 should add messaging, `captureVisibleTab` cropper, downloads, and clipboard handoff.

### Workload / PR boundary

- Delivery path: stacked chain, PR 2 only.
- Hand-written PR 2 line estimate from `wc -l` over shared modules, docs, fixtures, and golden prompt: 501 lines total. Shared TypeScript modules are 335 lines; the remaining 166 lines are docs/fixture/golden review support. This slightly exceeds the 400-line preference because the user explicitly assigned the PR 2 work unit and requested fixtures/goldens; no picker/capture/UI scope was added.

## PR 3 — Messaging, captureVisibleTab cropper, downloads, clipboard handoff

### Completed tasks

- Added `src/shared/messaging.ts` with discriminated `CAPTURE_VISIBLE_TAB_REQUEST` / `DOWNLOAD_PNG_REQUEST` envelopes, request IDs, typed responses, and reusable send helpers.
- Extended `src/entrypoints/background.ts` with stateless background handlers for visible-tab capture and PNG downloads while preserving the PR 1 toolbar toggle and state query messages.
- Added `src/shared/captureCrop.ts` with viewport clipping, DPR-aware crop math, `createImageBitmap`/image decode, `OffscreenCanvas` plus DOM canvas fallback, and recoverable `CAPTURE_FAILED` responses for off-viewport rectangles.
- Added `src/shared/exportBundle.ts` with annotation-to-asset extraction, stable filename reuse from `promptBuilder`, clipboard copy with hidden textarea fallback, and sequential background download requests.
- Added a small active-marker `PR3 stub` control in `src/entrypoints/content.tsx` that copies a fixture prompt and requests a canonical PNG download for manual verification without building picker UI.
- Confirmed no `html2canvas` dependency or invocation was added.
- Updated PR 3 task checkboxes in `tasks.md`.

### Files changed

- `src/shared/messaging.ts`
- `src/shared/captureCrop.ts`
- `src/shared/exportBundle.ts`
- `src/entrypoints/background.ts`
- `src/entrypoints/content.tsx`
- `openspec/changes/extract-copilot-overlay-into-extension/tasks.md`
- `openspec/changes/extract-copilot-overlay-into-extension/apply-progress.md`

### Verification commands run

| Command | Result |
| --- | --- |
| `npm run typecheck` | Passed; `wxt prepare` and `tsc --noEmit` succeeded. |
| `npm run build` | Passed; WXT produced `.output/chrome-mv3/` with background and content bundles. |
| `wc -l src/shared/messaging.ts src/shared/captureCrop.ts src/shared/exportBundle.ts src/entrypoints/background.ts src/entrypoints/content.tsx` | 563 total file lines; estimated PR 3 hand-written delta is ~390 lines because background/content existed before this work unit. |

### TDD Cycle Evidence

Strict TDD is not active for this repository (`openspec/config.yaml` has `strict_tdd: false` and no detected runner), so no RED/GREEN/REFACTOR cycles were required for PR 3.

### Deviations from design

- The temporary manual stub uses a 1×1 PNG fixture annotation and the existing minimal marker rather than real picker state. This keeps PR 3 within the capture/output boundary and avoids overlay UI scope reserved for PR 4.
- Background capture echoes content-provided CSS viewport dimensions and DPR; the service worker does not independently decode the PNG to derive image pixel dimensions.
- Off-viewport crop failures return typed recoverable responses; clipped rectangles are clipped to the visible viewport, matching the v1 viewport-only decision.

### Remaining tasks

- Manual Chrome verification remains: load `.output/chrome-mv3/`, toggle the marker on `fixtures/light.html`, click `PR3 stub`, confirm clipboard prompt text, and confirm `vibecopilot-01-annotate.png` downloads with non-zero size.
- Live capture/crop should be smoke-tested once PR 4 picker wiring calls `captureAndCropRect()` with real element rects.
- PR 4 should replace the minimal marker with the closed Shadow DOM overlay shell, picker engine, storage wrappers, and annotate mode.

### Workload / PR boundary

- Delivery path: stacked chain, PR 3 only.
- PR boundary respected: no picker modes, annotate UI, transform/swap/text-edit UI, side panel, html2canvas, or origin-app removal were implemented.
- Hand-written line estimate for PR 3 is near the 400-line review budget (~390 changed lines) when counting new shared modules plus incremental background/content changes; existing PR 1/2 lines in those files are not part of this work unit.

## PR 4a — Storage wrappers, picker engine, hover highlight, overlay shell wiring

### Completed tasks

- Split PR 4 into PR 4a/PR 4b in `tasks.md` and implemented only the PR 4a boundary requested by the user.
- Added `src/shared/storage.ts` with typed helpers for `chrome.storage.session` overlay active keys, `chrome.storage.local` annotation draft keys, and `chrome.storage.sync` preferences.
- Added `src/shared/pickerEngine.ts` with idle/annotate mode scaffolding, document-level capture-phase `mousemove`/`click` listeners, hover tracking, body/html exclusion via `getElInfo`, and self-avoidance through `composedPath().includes(shadowHostEl)`.
- Replaced the minimal content marker with a minimal closed-Shadow-DOM React overlay shell wired to the picker engine.
- Added hover highlight and selected-element debug text while preserving the Shadow DOM host `pointer-events:none` plus inner control `pointer-events:auto` strategy.
- Kept the PR 3 export stub as a small shell button; did not expand capture/export or wire capture into picker selection.
- Passed the content script tab id from background state response so the shell can read local draft counts through the new storage wrapper.

### Files changed

- `src/shared/storage.ts`
- `src/shared/pickerEngine.ts`
- `src/ui/Overlay.tsx`
- `src/entrypoints/content.tsx`
- `src/entrypoints/background.ts`
- `openspec/changes/extract-copilot-overlay-into-extension/tasks.md`
- `openspec/changes/extract-copilot-overlay-into-extension/apply-progress.md`

### Verification commands run

| Command | Result |
| --- | --- |
| `npm run typecheck` | Passed; `wxt prepare` and `tsc --noEmit` succeeded. |
| `npm run build` | Passed; WXT produced `.output/chrome-mv3/` with updated background/content bundles. |

### TDD Cycle Evidence

Strict TDD is not active for this repository (`openspec/config.yaml` has `strict_tdd: false` and no detected runner), so no RED/GREEN/REFACTOR cycles were required for PR 4a.

### Deviations from design

- PR 4a intentionally does not implement annotate popup/save, annotation persistence mutations, history, keyboard layering, transform, swap, text-edit, full panel, or capture-on-annotate.
- Dedicated `ModeBar`, `HighlightBox`, and `AnnotationPopup` components were not added in PR 4a; the shell uses a compact `Overlay.tsx` with inline highlight/debug UI to stay within the split boundary.
- The existing inline Shadow DOM CSS remains in `content.tsx`; `src/styles/tokens.css` / `overlay.css` are deferred because no full component theme is being introduced in PR 4a.
- Dev-only debug bridge was not added.

### Remaining tasks

- Manual Chrome smoke remains pending: load `.output/chrome-mv3/`, toggle overlay on a fixture, verify hover highlight, click host-page elements for debug selection, and verify overlay button clicks do not select extension UI.
- PR 4b should implement annotate popup/save, local draft mutation, undo/history cap, and annotate keyboard behavior.

### Workload / PR boundary

- Delivery path: stacked chain, PR 4a only.
- PR boundary respected: no full annotate save popup, transform mode, swap mode, text-edit mode, full panel, history stack, capture-on-annotate, html2canvas, or origin-app removal was implemented.
- Hand-written PR 4a line estimate is approximately 360 changed lines: new storage/picker/overlay modules plus replacement shell wiring in `content.tsx` and a tiny background state-response addition. This stays under the requested 400-line budget.

## PR 4b — Annotate popup/save, local draft mutation, undo/history, keyboard behavior

### Completed tasks

- Implemented annotate-mode selection flow in `src/ui/Overlay.tsx`: clicking an eligible host-page element now opens a small Shadow-DOM annotate popup near the selected element.
- Added comment entry with save/cancel actions. Saving creates an `AnnotateRecord` with `id`, `createdAt`, `type: 'annotate'`, `elementInfo`, and trimmed `comment`.
- Persisted annotation drafts through the existing `chrome.storage.local` wrapper using the PR 4a tab+origin key path.
- Added local in-memory undo history for annotation-array mutations, capped at 20 prior states.
- Added annotate keyboard behavior: Escape closes the annotate popup first and then pauses annotate picker; Ctrl/Cmd+Z undoes the last annotation mutation when focus is not in an editable field; Ctrl/Cmd+Enter saves the open annotate popup.
- Updated the overlay shell to show annotation count plus a compact latest-three annotation summary while preserving the PR 3 export stub.
- Added inline Shadow-DOM styles for the selected outline, annotate popup, popup buttons, textarea, and compact summary list.
- Updated PR 4 task checkboxes in `tasks.md` for the PR 4b scope.

### Files changed

- `src/ui/Overlay.tsx`
- `src/entrypoints/content.tsx`
- `openspec/changes/extract-copilot-overlay-into-extension/tasks.md`
- `openspec/changes/extract-copilot-overlay-into-extension/apply-progress.md`

### Verification commands run

| Command | Result |
| --- | --- |
| `npm run typecheck` | Passed; `wxt prepare` and `tsc --noEmit` succeeded. |
| `npm run build` | Passed; WXT produced `.output/chrome-mv3/` with the updated content bundle. |

### TDD Cycle Evidence

Strict TDD is not active for this repository (`openspec/config.yaml` has `strict_tdd: false` and no detected runner), so no RED/GREEN/REFACTOR cycles were required for PR 4b.

### Deviations from design

- Screenshot capture on annotate save was intentionally deferred to keep PR 4b under the 400-line review budget. The saved record remains schema-compatible through the optional `screenshot` field for a PR 4c/PR 5 follow-up.
- Dedicated `ModeBar`, `HighlightBox`, and `AnnotationPopup` component files were not introduced; the PR 4b UI remains inline in `Overlay.tsx` to minimize churn after the PR 4 split.
- Escape pauses annotate picker after popup closure rather than toggling the extension's persisted active flag from content; toolbar/session ownership remains in the background shell path.

### Reviewer-requested fixes applied

- Fixed the tab/session race identified by PR 4b review: toolbar toggle messages now include `tabId`; the content script rejects toggle ACKs until a tab id is available; annotate save refuses to persist before tab id readiness.
- Fixed stale draft overwrite risk: draft loads now capture a mutation version and skip applying loaded storage if a local annotation mutation occurred while the async load was in flight.
- Re-ran `npm run typecheck` and `npm run build`; both passed after the race fix.

### Remaining tasks

- Manual Chrome smoke remains pending: load `.output/chrome-mv3/`, toggle overlay on a fixture, click an element, save/cancel an annotation, reload and inspect `chrome.storage.local` for `annotations:<tabId>:<origin>`, and exercise Escape/Ctrl+Z/Ctrl+Enter.
- PR 5 should add transform mode; a small PR 4c could wire capture-on-annotate if desired before transform.

### Workload / PR boundary

- Delivery path: stacked chain, PR 4b only.
- PR boundary respected: no transform, swap, text-edit, full panel, side panel, html2canvas, pointer-event engine migration, or origin-app removal was implemented.
- Hand-written PR 4b code delta estimate is approximately 160-190 lines across `Overlay.tsx` and `content.tsx`; OpenSpec progress/task updates are documentation artifacts outside the UI code budget.

## PR 5 — Transform mode

### Completed tasks

- Added `src/ui/TransformLayer.tsx` with a selected-element outline, drag affordance, four corner resize handles, save/cancel form, viewport-clipping warning, and Ctrl/Cmd+Enter form save handling.
- Added transform state names to `src/shared/pickerEngine.ts` (`transform.select`, `transform.dragging`, `transform.resizing`, `transform.saveForm`) and kept document-level mouse/click capture listeners consistent with PR 4a.
- Added overlay mode selector buttons for `Anotar` and `Reposicionar`; no swap or text-edit mode was implemented.
- Implemented transform selection flow: click a host-page element in Reposicionar mode, snapshot original element info/rect, capture an optional before screenshot, and show live transform controls.
- Implemented live drag/resize preview by mutating only inline `transform`, `width`, and `height`, with a 20px minimum size and original inline-style restoration on cancel/unmount.
- Implemented transform save records with `dx`, `dy`, `origW`, `origH`, `newW`, `newH`, optional comment, and optional before/after screenshots. Capture failures degrade to records without screenshots.
- Preserved existing transform prompt/download wiring through `assetsFromAnnotations()` and `promptAssetFilename()`; before/after filenames remain `vibecopilot-NN-before.png` and `vibecopilot-NN-after.png`.
- Updated the compact annotation summary to label transform records with movement and size delta.
- Updated PR 5 task and acceptance checkboxes in `tasks.md`.

### Files changed

- `src/ui/TransformLayer.tsx`
- `src/ui/Overlay.tsx`
- `src/shared/pickerEngine.ts`
- `src/entrypoints/content.tsx`
- `openspec/changes/extract-copilot-overlay-into-extension/tasks.md`
- `openspec/changes/extract-copilot-overlay-into-extension/apply-progress.md`

### Verification commands run

| Command | Result |
| --- | --- |
| `npm run typecheck` | Passed; `wxt prepare` and `tsc --noEmit` succeeded. |
| `npm run build` | Passed; WXT produced `.output/chrome-mv3/` with the updated content bundle. |
| `wc -l src/ui/TransformLayer.tsx src/ui/Overlay.tsx src/shared/pickerEngine.ts src/entrypoints/content.tsx` | 760 total current lines; estimated PR 5 hand-written code delta is ~280 lines (new TransformLayer plus localized Overlay/picker/CSS changes). |

### TDD Cycle Evidence

Strict TDD is not active for this repository (`openspec/config.yaml` has `strict_tdd: false` and no detected runner), so no RED/GREEN/REFACTOR cycles were required for PR 5.

### Deviations from design

- Transform UI is implemented as a single `TransformLayer.tsx` component plus inline Shadow-DOM CSS rather than a broader styled component set; this keeps PR 5 under the 400-line review budget.
- The save form is visible immediately after selection and remains available while the user drags/resizes; after a mouseup the layer is internally marked as `saveForm`. This preserves save/cancel behavior without adding another popup transition.
- Screenshot capture uses the PR 3 `captureAndCropRect()` helper for before and after images. If either capture fails, save still persists the transform record without blocking.

### Remaining tasks

- Manual Chrome smoke remains pending: load `.output/chrome-mv3/`, select Reposicionar on `fixtures/dark.html`, drag/resize a button/card, save with optional comment, verify storage draft contains a `transform` record and copy/download emits before/after PNGs when capture succeeds.
- PR 6 should add swap mode and text-edit mode, then complete the broader keyboard layering across all modes.

### Workload / PR boundary

- Delivery path: stacked chain, PR 5 only.
- PR boundary respected: no swap, text-edit, full panel, side panel, html2canvas, Pointer Events migration, broad picker refactor, or origin-app removal was implemented.
- Hand-written PR 5 code delta estimate is approximately 280 lines, under the 400-line review budget.

## PR 6 — Swap mode + text-edit mode + keyboard parity

### Completed tasks

- Added `Intercambiar` and `Editar texto` to the overlay mode selector.
- Implemented swap flow in `Overlay.tsx`: first click records the source snapshot, second click records the destination snapshot and opens a small inline optional-comment form near the destination.
- Saved `SwapRecord` objects with source `elementInfo`, destination `targetInfo`, optional comment, generated id, `createdAt`, and `type: 'swap'`; persisted via the existing storage wrapper.
- Implemented text-edit flow via document-level capture `dblclick` with Shadow-DOM self-avoidance and via explicit `Editar texto` click selection.
- Added a text-edit popup showing original text, editable proposed text, optional comment, Save/Cancel, and optional screenshot capture using `captureAndCropRect()` with graceful failure.
- Saved `TextEditRecord` objects with `elementInfo`, `originalText`, `newText`, optional comment, optional screenshot, generated id, `createdAt`, and `type: 'text-edit'`; persisted via the existing storage wrapper.
- Extended picker state names to include `swap.first`, `swap.second`, `swap.popup`, and `text-edit.popup`.
- Completed ESC priority layering: text-edit popup → annotate popup → swap popup → swap step reset → transform cancel → picker pause.
- Preserved Ctrl/Cmd+Z overlay undo outside editable inputs and Ctrl/Cmd+Enter saves for annotate, swap, text-edit, and the existing transform form.
- Updated compact annotation summaries for annotate comments, transform deltas, swap source→target, and text-edit current→proposed.
- Updated PR 6 task/acceptance checkboxes in `tasks.md`.

### Files changed

- `src/ui/Overlay.tsx`
- `src/shared/pickerEngine.ts`
- `openspec/changes/extract-copilot-overlay-into-extension/tasks.md`
- `openspec/changes/extract-copilot-overlay-into-extension/apply-progress.md`

### Verification commands run

| Command | Result |
| --- | --- |
| `npm run typecheck` | Passed; `wxt prepare` and `tsc --noEmit` succeeded. |
| `npm run build` | Passed; WXT produced `.output/chrome-mv3/` with the updated content bundle. |

### TDD Cycle Evidence

Strict TDD is not active for this repository (`openspec/config.yaml` has `strict_tdd: false` and no detected runner), so no RED/GREEN/REFACTOR cycles were required for PR 6.

### Deviations from design

- `SwapPopup.tsx` and `TextEditPopup.tsx` were not split into standalone component files; both forms are inline in `Overlay.tsx` to keep the PR 6 hand-written delta under the 400-line review budget.
- ESC's final fallback pauses the picker in the current content overlay rather than directly writing the background-owned persisted active flag; this matches the existing PR 4/5 overlay-off behavior boundary.
- Text-edit screenshot capture is best-effort at save time and stores no image when capture/crop fails.

### Remaining tasks

- Manual Chrome smoke remains pending: run swap on `fixtures/nested.html`, double-click a paragraph/text-bearing element, verify stored `swap` and `text-edit` records, exercise the full ESC order, and confirm copy prompt/download behavior for mixed records.
- PR 7 should handle packaging docs, smoke checklist finalization, known limitations, and manual verification notes.

### Workload / PR boundary

- Delivery path: stacked chain, PR 6 only.
- PR boundary respected: no full panel, side panel, html2canvas, Pointer Events migration, packaging docs, or origin-app removal was implemented.
- Hand-written PR 6 code delta estimate is approximately 220 changed lines: localized expansion in `Overlay.tsx` plus a small picker state-name update. OpenSpec progress/task updates are documentation artifacts outside the UI code budget.

## PR 7 — Packaging, smoke docs, manual verification checklist

### Completed tasks

- Added `docs/manual-smoke.md` with a structured Chrome manual smoke checklist covering build/load-unpacked, all four modes, keyboard layering, restricted schemes, per-tab toggle, prompt/golden spot check, PNG filename parity, and storage inspection.
- Added `docs/known-limitations.md` documenting viewport-only capture, partial Tailwind mapping, transform-save inline-style behavior, no `html2canvas` fallback, Chrome-only v1 verification, iframe/cross-frame limitations, no direct LLM, no origin-app migration, and placeholder-quality icons.
- Added `docs/install.md` with install, dev/build, Chrome load-unpacked, `npm run zip`, and deferred Web Store publishing notes.
- Updated `README.md` with status table, dev/typecheck/build/zip commands, fixture serving, links to docs, and an explicit note that manual Chrome smoke is the current verification gate.
- Finalized `docs/byte-stability.md` with a live overlay spot-check command using `git diff --no-index` and `Fecha:` filtering.
- Replaced the 1x1 placeholder PNG icons with simple generated PNG monogram icons at 16/32/48/128 sizes; these remain placeholder-quality, not final brand art.
- Updated PR 7 task and acceptance checkboxes in `tasks.md` for docs/package work completed in this environment.

### Files changed

- `README.md`
- `docs/manual-smoke.md`
- `docs/known-limitations.md`
- `docs/install.md`
- `docs/byte-stability.md`
- `public/icons/icon-16.png`
- `public/icons/icon-32.png`
- `public/icons/icon-48.png`
- `public/icons/icon-128.png`
- `openspec/changes/extract-copilot-overlay-into-extension/tasks.md`
- `openspec/changes/extract-copilot-overlay-into-extension/apply-progress.md`

### Verification commands run

| Command | Result |
| --- | --- |
| `npm run typecheck` | Passed; `wxt prepare` and `tsc --noEmit` succeeded. |
| `npm run build` | Passed; WXT produced `.output/chrome-mv3/` with manifest, background, content bundle, and generated icons. |
| `npm run zip` | Passed; produced `.output/vibecopilot-extension-0.1.0-chrome.zip` (67,614 bytes). |
| `file public/icons/*` | Passed; icons are real PNGs at 16×16, 32×32, 48×48, and 128×128. |

### TDD Cycle Evidence

Strict TDD is not active for this repository (`openspec/config.yaml` has `strict_tdd: false` and no detected runner), so no RED/GREEN/REFACTOR cycles were required for PR 7.

### Deviations from design

- Added `docs/manual-smoke.md` instead of the earlier design placeholder name `docs/smoke-checklist.md`, matching the PR 7 user request.
- Did not execute browser-only manual Chrome smoke in this tool environment; the checklist now documents the required gate without claiming it passed.
- Did not add Web Store assets or publishing metadata; publishing remains deferred.

### Final cross-cutting acceptance checklist status

- Passed by automated/local command: typecheck, production build, ZIP packaging, icon presence and manifest references.
- Documented and ready for manual execution: Chrome load-unpacked, restricted-scheme behavior, per-tab toggle, annotate/transform/swap/text-edit flows, keyboard layering, storage inspection, prompt byte-stability spot check, and PNG filename parity.
- Still pending before completion/verification claims: actual manual Chrome smoke execution, live golden prompt diff with no non-date differences, and confirmation that downloaded PNG filenames match prompt markers in Chrome.
- Deferred/out of scope: Firefox smoke, `html2canvas` fallback, direct LLM integration, Web Store publishing, final icon art, and removing `CopilotOverlay` from the separate Quien-es-quien repository.

### Workload / PR boundary

- Delivery path: stacked chain, PR 7 only.
- PR boundary respected: no runtime code, modes, extension behavior, publishing, or Quien-es-quien changes were made.
- Hand-written PR 7 line estimate is approximately 250-300 markdown lines plus binary icon replacements; runtime code delta is 0 lines and the work remains under the 400-line review budget.

## PR 8 — UX bolita + injection fallback

### Completed tasks

- Added a background `ensureContentScript(tabId)` helper and toolbar-click retry path: initial toggle `sendMessage`, inject `content-scripts/content.js` on failure, wait briefly, then retry once.
- Preserved the existing restricted-scheme guard before injection and changed non-restricted retry failures to write inactive state plus an unknown `?` badge instead of throwing or claiming active.
- Replaced the wide top-right overlay shell with a 40px draggable bottom-right `VC` bolita and a compact anchored panel.
- Moved mode selector buttons, picker on/off, PR3 stub, annotation count/last-3 summary, selected/status text into the panel.
- Added panel collapse on mode selection, picker toggle, outside mousedown using `composedPath()`, hover-driven picking, and top-priority ESC before existing popup/mode ESC behavior.
- Added bolita drag with mouse events and persisted `{ x, y }` to `chrome.storage.sync` under `prefs.bolitaPosition`.
- Added mode-colored bolita badge/ring and dimmed opacity while the picker is in a selecting state, with hover/open returning to full opacity.
- Kept the existing closed Shadow DOM host id/self-avoidance, tabId race fix, persistence/history cap, all four mode flows, and PR3 stub.

### Files changed

- `src/entrypoints/background.ts`
- `src/entrypoints/content.tsx`
- `src/shared/storage.ts`
- `src/ui/Overlay.tsx`
- `openspec/changes/extract-copilot-overlay-into-extension/tasks.md`
- `openspec/changes/extract-copilot-overlay-into-extension/apply-progress.md`

### Verification commands run

| Command | Result |
| --- | --- |
| `npm run typecheck` | Passed; `wxt prepare` and `tsc --noEmit` succeeded. |
| `npm run build` | Passed; WXT produced `.output/chrome-mv3/` including `content-scripts/content.js`. |
| `npm run zip` | Passed; produced `.output/vibecopilot-extension-0.1.0-chrome.zip` (68,714 bytes). |

### Static review checklist

- Bolita default position is bottom-right via fixed coordinates, with a 40px circular button at roughly 24px from viewport edges when no saved preference exists.
- Drag uses established mouse events, clamps to viewport, and persists to `chrome.storage.sync` as `prefs.bolitaPosition`.
- Bolita dims to `0.35` while picker/selecting is active and returns to full opacity on hover/open.
- Panel closes on outside mousedown using `event.composedPath()`, ESC before popup-layer ESC, mode selection, picker toggle, and hover-driven picking.
- Background fallback keeps the restricted URL guard before injection, injects `content-scripts/content.js` on missing/rejected receiver, retries once, and falls back to inactive/`?` badge without throwing.

### TDD Cycle Evidence

Strict TDD is not active for this repository (`openspec/config.yaml` has `strict_tdd: false` and no detected runner), so no RED/GREEN/REFACTOR cycles were required for PR 8.

### Deviations from design

- No new icon dependency was added; the bolita uses a CSS-styled `VC` monogram and CSS badge colors.
- Panel positioning is clamped near the bolita instead of using a larger shell layout, preserving the closed Shadow DOM and existing host id.
- Browser-only manual smoke was not executed in this tool environment; verification is automated build/typecheck/zip plus static review.

### Remaining tasks

- User/manual re-test: reload the unpacked extension with an already-open non-fixture tab, click the toolbar, and verify injection fallback activates the overlay instead of reverting off.
- User/manual re-test: drag the bolita, reload, verify position persistence, and smoke annotate/reposition/swap/text-edit from the panel.

### Workload / PR boundary

- Delivery path: existing stacked change, PR 8 follow-up only.
- PR boundary respected: no new dependencies, no Pointer Events migration, no side panel/direct LLM/Firefox work, and no Quien-es-quien changes.
- Hand-written delta is kept focused to background fallback plus bolita/panel CSS and Overlay wiring; if future manual smoke requires larger UX refinements, split them into PR 8b.
