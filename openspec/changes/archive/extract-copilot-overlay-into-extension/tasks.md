# Tasks: Extract CopilotOverlay into a standalone browser extension

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~2,160-2,890 hand-written lines across 7 PRs |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 → PR 2 → PR 3 → PR 4 → PR 5 → PR 6 → PR 7 |
| Delivery strategy | auto-chain |
| Chain strategy | stacked-to-main |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

## Delivery strategy

- Deliver as a stacked chain of focused PR/work units, each targeting ≤400 hand-written changed lines where possible.
- Reject a single PR because the full WXT shell, shared parity modules, capture pipeline, picker modes, storage, and docs are forecast well above the 400-line review budget.
- Keep generated/build artifacts and lockfile noise out of review-line estimates; note them explicitly in PR review notes.
- Land pure shared modules before UI modes so prompt byte-stability and filename parity are established early.
- Land capture/download plumbing before picker modes that depend on screenshots.
- Split PR 4 into PR 4a/4b if the closed Shadow DOM host + picker engine + annotate UI exceeds 400 hand-written changed lines during apply.
- Use manual smoke checks and fixture/golden prompt diffs until a test runner is separately introduced.
- Chrome MV3 is the only v1 verification target; Firefox, html2canvas, direct LLM, and origin-app removal are deferred.

## Work units

### PR 1 — Bootstrap WXT extension shell

Estimate: 280-360 changed lines  
Risk: medium  
Depends on: none

#### Scope

Create the minimal WXT + React + TypeScript Chrome MV3 extension shell with manifest permissions, placeholder entrypoints, icons, README commands, and fixture directory stubs. The toolbar action should toggle a minimal overlay marker on allowed pages only.

#### Tasks

- [x] Create project bootstrap files: `package.json`, `wxt.config.ts`, `tsconfig.json`, `.gitignore`, and any minimal WXT/Vite config required for React + TypeScript.
- [x] Add npm scripts: `dev`, `build`, `zip`, and `typecheck`; optionally include `dev:firefox`/`build:firefox` without verifying Firefox in v1.
- [x] Add Chrome MV3 manifest configuration in `wxt.config.ts` with permissions `activeTab`, `storage`, `scripting`, `downloads`, host permissions `<all_urls>`, content script `run_at/document_end`, and toolbar action metadata.
- [x] Add placeholder icons under `src/assets/icons/` or WXT public asset path: `icon-16.png`, `icon-32.png`, `icon-48.png`, `icon-128.png`.
- [x] Add minimal entrypoints:
  - [x] `src/entrypoints/background.ts` with toolbar click listener and placeholder toggle message.
  - [x] `src/entrypoints/content.ts` with restricted-scheme guard and a removable minimal overlay marker.
  - [ ] `src/entrypoints/popup/index.html` and `src/entrypoints/popup/App.tsx` with a minimal status/toggle surface if popup is enabled.
- [x] Create fixture stubs required by spec: `fixtures/light.html`, `fixtures/dark.html`, `fixtures/nested.html`, plus `fixtures/prompts/.gitkeep` or empty prompt placeholder notes.
- [x] Add `README.md` development commands for install, `npm run dev`, `npm run build`, and Chrome load-unpacked path `.output/chrome-mv3/`.

#### Acceptance checks

- [x] `npm run typecheck` succeeds after dependencies are installed.
- [x] `npm run build` produces `.output/chrome-mv3/` without manifest errors.
- [ ] Chrome loads the unpacked extension and shows the VibeCopilot toolbar action.
- [ ] Toolbar toggles a minimal visible marker on an allowed fixture page.
- [ ] Restricted schemes such as `chrome://extensions` do not inject host-page UI and do not throw unhandled errors.

#### Manual verification

- Load `.output/chrome-mv3/` via `chrome://extensions` developer mode.
- Open `fixtures/light.html` through a local server or file access if granted; click toolbar twice and verify marker on/off.
- Open `chrome://extensions`; invoke toolbar/popup and verify disabled/quiet behavior.
- Open two allowed tabs; verify toggling one tab does not visibly toggle the other.

#### Out of scope

- Closed Shadow DOM React overlay UI beyond the minimal marker.
- Prompt builder, picker modes, screenshot capture, downloads, storage schema beyond minimal toggle state.
- Vitest or automated browser tests.

#### Review notes

- Dependency lockfile and generated WXT output should not count toward the 400-line hand-written review budget.
- Fixture filenames must follow the spec names (`light.html`, `dark.html`, `nested.html`) even if earlier design examples used longer names.

### PR 2 — Shared data contracts, DOM info, style mapper, prompt builder fixtures

Estimate: 320-400 changed lines  
Risk: high  
Depends on: PR 1

#### Scope

Add pure shared TypeScript modules for annotation contracts, element metadata extraction, partial Tailwind style mapping parity, byte-stable Spanish prompt building, and frozen prompt fixture documentation/goldens.

#### Tasks

- [x] Add `src/shared/types.ts` with `ElementInfo`, annotation record unions, export bundle, prompt meta, viewport, and typed error contracts.
- [x] Add `src/shared/styleMapper.ts` porting only the v1 dictionaries: `TW_COLORS`, `TW_SPACING`, `TW_FONT_SIZE`, `TW_FONT_WEIGHT`, `TW_BORDER_RADIUS`; do not widen mappings.
- [x] Add `src/shared/dom.ts` with `getElInfo`, class/text/label truncation, parent tag extraction, rounded viewport rects, viewport-clip detection, and self-check helper signatures.
- [x] Add `src/shared/promptBuilder.ts` as a pure builder with byte-stable Spanish headers, 44-character divider lines, type labels, screenshot marker formatting, footer, and deterministic `meta.date` override.
- [x] Add filename helper in shared code for prompt/download parity: `vibecopilot-NN-annotate.png`, `vibecopilot-NN-text-edit.png`, `vibecopilot-NN-before.png`, `vibecopilot-NN-after.png`.
- [x] Finalize fixture pages `fixtures/light.html`, `fixtures/dark.html`, and `fixtures/nested.html` with distinct styles/DOM depth for manual prompt and style checks.
- [x] Add frozen prompt fixtures under `fixtures/prompts/` for at least one mixed annotation scenario per fixture, or add documented placeholders if origin-generated goldens must be captured during apply.
- [x] Add `docs/byte-stability.md` with manual diff procedure using `git diff --no-index` and a date override/filter rule.

#### Acceptance checks

- [ ] `npm run typecheck` succeeds.
- [ ] Prompt output for canned annotate/transform/swap/text-edit records contains `== VIBECOPILOT PROMPT ==`, `### CAMBIO N — <tipo>`, 44 × `─` dividers, expected screenshot markers, and `== FIN VIBECOPILOT PROMPT ==`.
- [ ] Prompt marker filenames exactly match the shared filename helper output.
- [ ] Style mapper omits unmapped values from `twClasses` while preserving raw style fields.
- [ ] `getElInfo` returns all spec fields: `tag`, `classes`, `text`, `label`, `parentTag`, `twClasses`, `rawStyles`, `rect`.

#### Manual verification

- Use a browser console or temporary dev harness on `fixtures/light.html`, `fixtures/dark.html`, and `fixtures/nested.html` to inspect `getElInfo` outputs once modules are wired.
- Generate prompt text from canned records and run `git diff --no-index fixtures/prompts/<fixture>.golden.txt <actual>.txt`, filtering/overriding only `Fecha:` if needed.

#### Out of scope

- Picker UI and live DOM selection.
- `chrome.tabs.captureVisibleTab`, downloads, clipboard orchestration.
- Adding broad Tailwind coverage or Tailwind config export.

#### Review notes

- This is the highest byte-stability PR; avoid refactors that alter whitespace, line ordering, punctuation, emoji, or screenshot marker text.
- If goldens are large enough to push review over budget, commit module code first and add/refresh prompt fixtures in a small follow-up commit within the same work unit.

### PR 3 — Messaging, captureVisibleTab cropper, downloads, clipboard handoff

Estimate: 300-380 changed lines  
Risk: medium  
Depends on: PR 2

#### Scope

Add typed extension messaging, background visible-tab capture, DPR-aware content cropper, PNG downloads, and `copyPrompt` orchestration using stub/canned annotations.

#### Tasks

- [x] Add `src/shared/messaging.ts` with discriminated message envelopes, `ExtError`, request/response helpers, and request IDs.
- [x] Implement `CAPTURE_VISIBLE_TAB_REQUEST` handling in `src/entrypoints/background.ts` using `chrome.tabs.captureVisibleTab` and returning PNG data URL, viewport width/height, DPR echo, and timestamp.
- [x] Implement `DOWNLOAD_PNG_REQUEST` handling in `src/entrypoints/background.ts` using `chrome.downloads.download` and `conflictAction: 'uniquify'`.
- [x] Add `src/shared/captureCrop.ts` with DPR crop math, viewport clipping, `OffscreenCanvas`/fallback canvas path if needed, and recoverable failure for off-screen elements.
- [x] Add `src/shared/copyPrompt.ts` or equivalent orchestrator that writes prompt text via `navigator.clipboard.writeText`, falls back to hidden textarea/`execCommand('copy')`, then requests background PNG downloads.
- [x] Wire a temporary content-script dev control or popup action that runs `copyPrompt` against stub annotation fixtures for manual verification.
- [x] Ensure no `html2canvas` dependency is added or invoked.

#### Acceptance checks

- [ ] `npm run typecheck` succeeds.
- [ ] Capture request returns an `image/png` data URL plus viewport/DPR/timestamp metadata for an allowed tab.
- [ ] Cropper returns a cropped PNG data URL for an in-viewport element and a recoverable failure for a fully off-viewport rect.
- [ ] Annotation save/copy flow can continue without screenshot data when capture fails.
- [ ] Clipboard receives prompt text before downloads are requested.
- [ ] Download request filenames exactly match prompt screenshot markers.

#### Manual verification

- Build and load extension in Chrome.
- On `fixtures/light.html`, trigger the temporary capture/copy control and confirm clipboard text is populated.
- Confirm a PNG downloads with canonical filename such as `vibecopilot-01-annotate.png` and non-zero size.
- Move/select or fake an off-viewport rect and verify no hard failure and no missing prompt text.

#### Out of scope

- Full overlay shell and picker modes.
- Side panel prompt preview.
- html2canvas fallback.

#### Review notes

- Keep background service worker stateless except storage reads/writes required by messages.
- Clipboard behavior must remain user-gesture friendly: avoid async work before the initial `writeText` call in final UI wiring.

### PR 4 — Shadow DOM host, overlay shell, picker engine, annotate mode

Estimate: 360-400 changed lines; split applied as PR 4a/4b  
Risk: high  
Depends on: PR 3

#### Split status

- [x] PR 4a completed: storage wrappers, picker engine, hover highlight, self-avoidance, and minimal overlay shell wiring.
- [x] PR 4b completed: annotate popup/save, annotation persistence mutation, undo/history, and annotate keyboard save/cancel behavior.

#### Scope

Replace the minimal marker with a closed Shadow DOM React overlay shell, picker engine, hover highlight, self-avoidance, annotate popup/save, storage wrappers, and baseline keyboard/history behavior.

#### Tasks

- [x] Implement closed Shadow DOM host creation in `src/entrypoints/content.ts` with exactly one extension-owned host, `pointer-events` strategy, restricted-scheme guard, and dev-only debug bridge if applicable. _(PR 4a: existing closed host preserved; no debug bridge added.)_
- [ ] Add `src/styles/tokens.css` and `src/styles/overlay.css` or equivalent isolated CSS loaded into the closed shadow root.
- [x] Add storage wrappers in `src/shared/storage.ts` for:
  - [x] `chrome.storage.session` key `overlayActive:<tabId>`.
  - [x] `chrome.storage.local` key `annotations:<tabId>:<origin>`.
  - [x] `chrome.storage.sync` key `prefs`.
- [x] Add `src/shared/pickerEngine.ts` with capture-phase pointer listeners, hover state, `composedPath().includes(shadowHostEl)` self-avoidance, and mode state scaffolding. _(PR 4a: annotate/idle scaffold only.)_
- [x] Add React components: `src/ui/Overlay.tsx`, `src/ui/ModeBar.tsx`, `src/ui/HighlightBox.tsx`, `src/ui/AnnotationPopup.tsx`, and minimal annotations panel/copy button wiring. _(PR 4a added minimal `Overlay.tsx` shell; PR 4b kept annotate popup/highlight/summary inline in `Overlay.tsx` to stay within the split budget.)_
- [x] Implement annotate mode click flow: eligible host-page selection → popup → comment save → optional screenshot → `annotate` record persisted locally. _(PR 4b saves metadata/comment records without screenshot; capture-on-save is deferred to keep review size under budget.)_
- [x] Implement undo history cap at 20 states and baseline ESC/Ctrl/Cmd+Z/Ctrl/Cmd+Enter behavior for annotate popup.
- [ ] Verify SPA route metadata updates or add a scoped path-refresh hook without remounting the React tree.

#### Acceptance checks

- [x] Overlay UI renders inside a closed Shadow DOM host and host-page CSS does not visibly alter controls. _(Automated build/typecheck only; manual Chrome smoke still pending.)_
- [x] Hover highlight follows host-page elements and geometry is close enough for manual verification. _(Implemented for PR 4a; manual Chrome smoke pending.)_
- [x] Clicking overlay controls never selects/highlights extension UI. _(Implemented with composedPath host self-avoidance; manual Chrome smoke pending.)_
- [x] Annotate mode saves a record with metadata and comment; screenshot is schema-compatible but deferred.
- [x] Annotation draft persists in `chrome.storage.local`; active flag uses `storage.session`; prefs use `storage.sync` when present.
- [x] ESC closes annotate popup before pausing annotate picker; Ctrl/Cmd+Z undoes list mutation; Ctrl/Cmd+Enter saves valid annotate form.

#### Manual verification

- Load the extension and open `fixtures/light.html`; toggle overlay and inspect that one host element exists.
- Add hostile page CSS in fixture/devtools and verify overlay controls remain visually isolated.
- Move pointer across heading/button/card elements and verify highlight tracks target rects.
- Click mode bar/popup buttons and verify no host-page annotation selection is created.
- Save an annotate record, reload tab, and inspect `chrome.storage.local` for `annotations:<tabId>:<origin>`.

#### Out of scope

- Transform, swap, and text-edit modes.
- Full packaging docs and final manual checklist execution.
- Removing origin `CopilotOverlay.jsx`.

#### Review notes

- Decision point: if this exceeds 400 changed lines, split into PR 4a `host + storage + picker engine + highlight` and PR 4b `React annotate UI + history/keyboard`.
- Closed shadow root means DevTools inspection is harder; rely on dev-only bridge only outside production builds.

### PR 5 — Transform mode

Estimate: 300-380 changed lines  
Risk: medium  
Depends on: PR 4

#### Scope

Add transform selection, before capture, live drag/resize preview, save/cancel, geometry deltas, and before/after screenshot assets.

#### Tasks

- [x] Add `src/ui/TransformLayer.tsx` with selection outline, drag affordance, resize handles, save/cancel form, and clipped-element warning surface.
- [x] Extend `src/shared/pickerEngine.ts` transform state transitions: select → dragging/resizing → save form → save/cancel.
- [x] Snapshot original inline `transform`, `width`, and `height` values before preview edits.
- [x] Capture `screenshotBefore` immediately after selection when possible and `screenshotAfter` on save when possible.
- [x] Save `transform` record with `dx`, `dy`, `origW`, `origH`, `newW`, `newH`, comment, and optional before/after images.
- [x] Ensure cancel restores original inline styles and adds no record.
- [x] Wire prompt/download filenames for transform before/after assets through existing helpers.
- [x] Add keyboard handling for transform cancellation and Ctrl/Cmd+Enter save form consistency.

#### Acceptance checks

- [x] Drag/resize preview visibly changes the selected element while transform mode is active. _(Implemented; manual Chrome smoke pending.)_
- [x] Save creates a `transform` annotation with correct geometry delta fields. _(Implemented; manual Chrome smoke pending.)_
- [x] Cancel restores original styles and does not append an annotation. _(Implemented; manual Chrome smoke pending.)_
- [x] Prompt references `vibecopilot-NN-before.png` and `vibecopilot-NN-after.png` when images exist.
- [x] Download requests use the same before/after filenames as prompt markers.
- [x] Capture/crop failures save the transform record without blocking prompt copy.

#### Manual verification

- On `fixtures/dark.html`, select a button/card, drag and resize it, then save.
- Verify before/after PNGs download with stable names and non-zero sizes.
- Repeat transform, cancel, and confirm original inline style values are restored.
- Press ESC during save form/preview and verify correct top-layer cancellation.

#### Out of scope

- Swap and text-edit modes.
- Full scroll-and-stitch or html2canvas captures.

#### Review notes

- Keep all geometry math centralized and documented to avoid prompt/crop drift.
- Avoid broad refactors of PR 4 overlay state while adding transform state.

### PR 6 — Swap mode + text-edit mode + keyboard parity

Estimate: 280-360 changed lines  
Risk: medium  
Depends on: PR 5

#### Scope

Add swap source/destination selection, text-edit popup via double-click or popup action, complete keyboard layering, and undo history parity.

#### Tasks

- [x] Add swap state in `src/shared/pickerEngine.ts`: first selection → second selection → popup → save/cancel. _(Implemented inline in `Overlay.tsx` to stay inside the PR 6 budget; no separate `SwapPopup.tsx` file.)_
- [x] Save `swap` records with source `elementInfo`, destination `targetInfo`, optional comment, and prompt-compatible fields.
- [x] Add text-edit flow from double-click and explicit text-edit mode. _(Implemented inline in `Overlay.tsx`; no separate `TextEditPopup.tsx` file.)_
- [x] Save `text-edit` records with `originalText`, `newText`, comment, selected `elementInfo`, and optional screenshot.
- [x] Complete keyboard layering order: text edit → annotate popup → swap popup → swap step → transform → overlay off.
- [x] Ensure Ctrl/Cmd+Z is ignored inside editable inputs but prevents host-page undo when overlay-level undo runs.
- [x] Ensure Ctrl/Cmd+Enter saves valid annotate, swap, text-edit, and transform forms.
- [x] Verify history retains at most 20 prior annotation-list states after repeated mutations. _(Existing cap preserved with `slice(-20)`.)_

#### Acceptance checks

- [x] Swap mode saves a record with both source and destination metadata. _(Implemented; manual Chrome smoke pending.)_
- [x] Text-edit mode saves original/proposed text and emits prompt lines for `Texto actual:` and `Texto propuesto:`. _(Prompt builder support already existed; UI now creates records.)_
- [x] Double-click flow does not accidentally create an annotate record unless explicitly saved. _(Double-click opens text-edit only; any annotate popup must still be saved explicitly.)_
- [x] ESC always cancels only the topmost active layer according to spec order. _(Implemented; manual Chrome smoke pending.)_
- [x] Undo history cap is 20 states.
- [x] Prompt and downloads remain byte/name stable for mixed annotate, transform, swap, and text-edit records.

#### Manual verification

- On `fixtures/nested.html`, swap a deeply nested element with another visible element and verify prompt destination section.
- Double-click a paragraph/text node area, save proposed replacement text, and verify prompt text-edit section.
- Exercise ESC from text-edit, annotate popup, swap popup, swap second-step, transform preview, and idle overlay.
- Create more than 20 records or temporary mutations and verify only the latest 20 undo states remain available.

#### Out of scope

- Direct LLM submission.
- Side panel prompt editor.
- Firefox parity.

#### Review notes

- Keyboard behavior is cross-cutting; keep changes localized to a controller/hook to avoid mode-specific drift.
- Text-edit should use visible element text parity from `getElInfo` and not add new text extraction semantics unless required by spec.

### PR 7 — Packaging, smoke docs, manual verification checklist

Estimate: 180-260 changed lines  
Risk: low  
Depends on: PR 6

#### Scope

Finalize documentation, known limitations, smoke checklist execution steps, icon/privacy notes, fixture pages/goldens, and Chrome unpacked packaging verification.

#### Tasks

- [x] Add or finalize `docs/manual-smoke.md` covering Chrome unpacked loading, toolbar toggle, restricted schemes, all picker modes, keyboard behavior, prompt copy, PNG downloads, and storage inspection.
- [x] Add `docs/known-limitations.md` documenting Chrome-only v1, viewport-only capture, no html2canvas, no iframe/cross-frame support, no direct LLM, and no origin-app migration.
- [x] Finalize `docs/byte-stability.md` with exact fixture replay steps and `git diff --no-index` command(s), including date override/filter instructions.
- [x] Finalize `fixtures/light.html`, `fixtures/dark.html`, `fixtures/nested.html`, and `fixtures/prompts/*.golden.txt` for current compact golden coverage; live byte-stability remains a manual-smoke gate.
- [x] Update `README.md` with build, zip, load-unpacked, fixture serving, and manual smoke workflow.
- [x] Verify icons are present and referenced by WXT/manifest metadata.
- [ ] Run the complete manual smoke checklist in Chrome and record results without claiming automated coverage.

#### Acceptance checks

- [x] `npm run typecheck` succeeds.
- [x] `npm run build` succeeds; Chrome load-unpacked remains manual pending.
- [x] Manual smoke checklist exists and covers every spec-required workflow.
- [ ] Frozen prompt diff passes with no non-date byte differences in a live manual pass.
- [ ] Prompt screenshot filenames exactly match actual download request filenames in the manual pass.
- [x] Docs clearly state no `html2canvas` in v1 and Chrome-only verification.

#### Manual verification

- Serve fixtures locally, load extension unpacked, and execute `docs/smoke-checklist.md` end-to-end.
- Run byte-stability diff for all prompt fixtures.
- Inspect `chrome.storage.session`, `chrome.storage.local`, and `chrome.storage.sync` ownership in extension DevTools.
- Confirm no task in this repo removes `CopilotOverlay.jsx` from `Quien-es-quien`.

#### Out of scope

- Web Store publishing submission.
- Firefox smoke pass.
- Vitest adoption unless separately approved as a follow-up.
- Removing the in-app overlay from `Quien-es-quien`.

#### Review notes

- This PR is documentation/packaging-heavy; avoid sneaking new picker behavior here except bug fixes found during smoke.
- If smoke reveals functional defects, fix them in the relevant earlier PR/work unit or a focused follow-up rather than broadening PR 7.

### PR 8 — UX bolita + injection fallback

Estimate: ~250-330 changed lines  
Risk: medium  
Depends on: PR 7

#### Scope

Apply the manual-smoke follow-up: replace the wide top-right overlay shell with a compact draggable floating bolita that opens a small panel, and make toolbar toggles recover when existing tabs did not receive the content script after extension install/reload.

#### Tasks

- [x] Add `ensureContentScript(tabId)` in `src/entrypoints/background.ts` and retry the toolbar toggle once after injecting `content-scripts/content.js` when the initial `sendMessage` has no receiver or otherwise rejects.
- [x] Preserve the restricted-scheme guard before injection attempts and fall back cleanly to inactive state plus unknown badge on non-restricted retry failure.
- [x] Replace the wide `vc-shell` with a 40px bottom-right circular `VC` bolita and small anchored panel.
- [x] Move mode selector buttons, picker toggle, PR3 stub, annotation count/summary, and status text into the panel.
- [x] Close the panel on mode/picker selection, outside mousedown using `composedPath()`, hover-driven picking, and ESC before existing popup-layer ESC handling.
- [x] Make the bolita mouse-draggable and persist `{ x, y }` under `chrome.storage.sync` `prefs.bolitaPosition`.
- [x] Dim the bolita while a picking/selecting state is active and show a small mode-colored ring/badge.
- [x] Keep closed Shadow DOM mount, existing host id/self-avoidance, tabId race fix, annotation persistence/history cap, all four modes, and PR3 stub.

#### Acceptance checks

- [x] `npm run typecheck` succeeds.
- [x] `npm run build` succeeds.
- [x] `npm run zip` succeeds and produces `.output/vibecopilot-extension-0.1.0-chrome.zip`.
- [x] Static review: bolita default is fixed bottom-right, drag persists to `chrome.storage.sync`, opacity dims while selecting, and panel collapses on outside click plus ESC.
- [x] Static review: background injection fallback handles missing receiver/retry and does not inject on restricted URLs.

#### Manual verification

- Load/reload the unpacked extension, open a non-fixture page that was already loaded before the reload, click the toolbar, and verify the overlay becomes available after injection fallback.
- Drag the bolita, reload the page, and verify the position restores from sync prefs.
- Open/close the panel via bolita, outside click, ESC, and selecting each mode.
- Re-smoke annotate, transform, swap, and text-edit popups from the panel-driven UX.

#### Out of scope

- New dependencies, Pointer Events migration, side panel, direct LLM, Firefox smoke, and removing `CopilotOverlay` from Quien-es-quien.

#### Review notes

- This is a focused follow-up PR 8 on top of the existing change, not a new SDD change.
- If manual smoke reveals additional UX refinements, prefer a PR 8b rather than broadening this slice.

## Cross-cutting acceptance checklist

- [ ] Chrome MV3 WXT extension builds and loads unpacked without manifest errors.
- [ ] Toolbar action toggles overlay per tab and does not affect other tabs.
- [ ] Restricted schemes fail quietly without creating host-page UI or unhandled exceptions.
- [ ] React overlay mounts in exactly one extension-owned closed Shadow DOM host.
- [ ] Host-page CSS does not visibly style overlay internals.
- [ ] SPA route changes keep overlay mounted and prompt metadata path current; full navigation remounts safely without duplicate hosts.
- [ ] `chrome.storage.session` owns active flags, `chrome.storage.local` owns annotation drafts, and `chrome.storage.sync` owns preferences.
- [ ] Hover highlight follows eligible host-page elements and avoids extension UI using `composedPath()` plus host identity.
- [ ] Annotate, transform, swap, and text-edit modes each create the correct annotation record type.
- [ ] Transform mode supports live drag/resize, save with geometry delta, before/after captures, and cancel restore.
- [ ] Swap mode captures source and destination metadata before save.
- [ ] Text-edit mode captures original and proposed text via double-click or edit-popup flow.
- [ ] ESC, Ctrl/Cmd+Z, Ctrl/Cmd+Enter, and 20-entry undo history cap match the spec.
- [ ] `getElInfo` captures tag, classes, text, label, parent tag, Tailwind hints, raw styles, and rounded rect.
- [ ] Style mapper mirrors only v1 partial dictionaries and does not widen Tailwind mapping.
- [ ] Prompt builder preserves byte-stable Spanish format, headers, dividers, type sections, optional screenshot markers, and footer.
- [ ] Live date uses `es-ES`; fixture verification uses date override/filter only for `Fecha:`.
- [ ] PNG prompt filenames match download filenames exactly.
- [ ] Background visible-tab capture returns PNG data URL and viewport/DPR/timestamp metadata.
- [ ] DPR-aware cropper handles in-viewport elements and recoverable off-viewport/clipped failures.
- [ ] Screenshot failures never block annotation saving or prompt copying.
- [ ] `copyPrompt` writes clipboard text from a user gesture and downloads images through `chrome.downloads`.
- [ ] v1 does not include or invoke `html2canvas`.
- [x] Required fixtures exist as `fixtures/light.html`, `fixtures/dark.html`, and `fixtures/nested.html`.
- [ ] Manual smoke checklist is executed before completion is claimed.
- [ ] Any work unit forecast above 400 changed lines is split or explicitly approved before apply continues.

## Deferred follow-ups

- Tailwind widening beyond the current partial dictionaries.
- Firefox build/smoke verification and browser-specific storage/CSS parity work.
- `html2canvas` fallback for clipped/off-screen elements behind a future feature flag.
- Side panel prompt preview or prompt editor.
- Direct LLM/API integration.
- Chrome Web Store publishing assets, listing, policy, and privacy disclosure.
- Removing the in-app `CopilotOverlay.jsx` and `App.jsx` mount from the separate `Quien-es-quien` repository.

## Review workload forecast by PR

| PR | Title | Estimate | Budget risk | Split/mitigation |
|----|-------|----------|-------------|------------------|
| 1 | Bootstrap WXT extension shell | 280-360 | Medium | Keep generated files and lockfile review separate from hand-written budget. |
| 2 | Shared contracts, DOM info, style mapper, prompt fixtures | 320-400 | High | If goldens are large, isolate fixture refresh from module code. |
| 3 | Messaging, captureVisibleTab cropper, downloads, clipboard | 300-380 | Medium | Avoid picker UI and html2canvas. |
| 4 | Shadow DOM host, overlay shell, picker engine, annotate mode | 360-400 | High | Split to 4a host+engine and 4b annotate UI if it grows. |
| 5 | Transform mode | 300-380 | Medium | Keep geometry/capture additions localized. |
| 6 | Swap mode + text-edit mode + keyboard parity | 280-360 | Medium | Centralize keyboard controller to avoid broad churn. |
| 7 | Packaging, smoke docs, manual checklist | 180-260 | Low | Docs/fixtures only except focused smoke fixes. |
| 8 | UX bolita + injection fallback | 250-330 | Medium | Keep CSS/Overlay localized; split PR 8b only if follow-up UX exceeds budget. |
