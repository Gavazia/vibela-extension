# Proposal: Extract CopilotOverlay into a standalone browser extension

## Summary

Extract the in-app `CopilotOverlay` developer tool from `Quien-es-quien` into this standalone WXT/React/TypeScript browser extension. The extension will inject a Shadow DOM UI on allowed pages, preserve the current prompt and PNG handoff workflow, and avoid runtime dependency on the origin app. Removal from `Quien-es-quien` is a separate follow-up change in that repository.

## Motivation

- End-user bundle cost: `../Quien-es-quien/src/shared/ui/CopilotOverlay.jsx` is ~1323 LOC and is mounted unconditionally in the production app (`App.jsx` line 423).
- Coupling: a developer-only visual annotation workflow is currently coupled to a game UI and its dependencies.
- Reusability: the same picker, annotation, screenshot, and prompt workflow should run on any allowed web page without modifying the host app.
- License/IP cleanliness: extraction gives this project an explicit ownership boundary and lets us document what is ported from user-owned code versus any external inspiration; Drawbridge / All Rights Reserved material must not be copied.

## In Scope

- Create a WXT-based browser extension project using TypeScript and React 18.
- Inject a Shadow DOM host from a content script on allowed URLs and mount the overlay UI there.
- Port the existing element picker workflow: annotate, transform, swap, and text-edit records.
- Preserve the existing `buildPrompt()` text format byte-for-byte from `../Quien-es-quien/src/shared/ui/CopilotOverlay.jsx` lines 214-301.
- Preserve PNG auto-download naming: `vibecopilot-NN-<type>.png`, `vibecopilot-NN-before.png`, and `vibecopilot-NN-after.png`.
- Capture viewport screenshots through `chrome.tabs.captureVisibleTab` in the background service worker, then crop in the content script using `devicePixelRatio`.
- Keep `html2canvas` only as a fallback path for elements clipped by the viewport, if retained after design review.
- Store annotation drafts in `chrome.storage.local` and user preferences in `chrome.storage.sync`.
- Add a manual smoke checklist; no test runner is required for this inaugural change.

## Out of Scope (Non-Goals)

- Direct LLM API submission from the extension.
- Full-page scroll-and-stitch screenshots; viewport-only capture is enough.
- Cross-frame or iframe element picking.
- Console or network log capture.
- Account, cloud sync, or backend services.
- Tailwind config export; the current overlay does not do this, so the extension should not expand scope upward.
- Removing `CopilotOverlay.jsx` from `Quien-es-quien`; that happens in a separate change in that repository.

## Target user workflow

1. User opens any allowed web page and clicks the VibeCopilot toolbar icon.
2. The extension toggles the injected Shadow DOM overlay for the current tab.
3. User chooses annotate, transform, swap, or text-edit mode and selects page elements without selecting the extension UI itself.
4. User adds comments or proposed text, and the extension records element metadata, computed-style/Tailwind hints, geometry, and screenshots.
5. User reviews the annotation list and clicks `Copiar Prompt`.
6. The extension copies the byte-stable Spanish prompt text to the clipboard and auto-downloads any PNG assets with the existing filenames.
7. User pastes the prompt and attaches the downloaded PNGs into their LLM chat.

## Functional parity matrix

| Capability | Origin file:line in `CopilotOverlay.jsx` | Extension surface | Notes |
| --- | --- | --- | --- |
| Annotate mode | `../Quien-es-quien/src/shared/ui/CopilotOverlay.jsx` lines 318-322, 440-463, 605-617, 954-1018 | Content script React UI in Shadow DOM | Single-click element selection opens comment popup and saves an annotation with optional screenshot. |
| Transform mode (drag+resize live) | lines 328-334, 517-599, 619-648, 851-949 | Content script picker/transform layer | Preserve live `translate(...)`, width/height preview, before/after capture records, save/cancel behavior. |
| Swap mode | lines 336-340, 465-492, 650-662, 1076-1137 | Content script two-step picker | Select source element, then destination element, then save a repositioning annotation. |
| Text-edit mode | lines 324-326, 465-481, 663-679, 1020-1074 | Content script text-edit popup | Double-click or popup action captures current text, proposed text, optional note, and screenshot. |
| Element picker self-avoidance | lines 430, 444, 472, 487, 506, 524 | Picker engine | Replace `[data-copilot]` checks with Shadow DOM host/self-boundary checks so extension UI is never selected. |
| Hover highlight | lines 424-438, 499-510, 813-850 | Content script overlay layer | Preserve color-coded hover boxes for annotate, transform, and swap steps. |
| Computed-style to Tailwind mapping | lines 7-178 | Shared `styleMapper` module | Port current partial dictionaries and raw style extraction without adding Tailwind config export. |
| html2canvas capture | lines 181-191 | `captureCrop` plus optional fallback | Primary path becomes `captureVisibleTab`; `html2canvas` may remain only for viewport-clipped elements and may have CORS limits. |
| Prompt builder | lines 206-301 | Shared `promptBuilder` module | Must be byte-stable for Spanish headers, section order, `### CAMBIO N — ...`, screenshot references, and footer. |
| Clipboard copy | lines 683-685 | Content script output action | Use `navigator.clipboard.writeText`; handle permission/browser quirks in design. |
| PNG auto-download | lines 194-203, 687-702 | Background download handler | Use `chrome.downloads` and preserve exact filenames. |
| Undo history | lines 310, 388-403, 631, 652, 674, 705, 710, 1158-1162 | Content script state/store | Keep max-20 undo stack semantics for annotation list mutations. |
| ESC layering | lines 405-423 | Content script keyboard controller | Preserve layered cancellation order: text edit, annotation popup, swap popup, swap step, transform, then overlay active state. |
| Ctrl/Cmd+Z | lines 419-422, 1159 | Content script keyboard controller | Prevent default when overlay is active and undo annotations. |
| Ctrl/Cmd+Enter save | lines 987, 1051, 1117 | Popup form handlers | Preserve keyboard save for annotate, text-edit, and swap forms; decide whether transform comment form also needs parity. |
| Dark/light theming | lines 813-1321 | Shadow DOM CSS/theme module | Current UI is dark-first; extension should isolate theme tokens in Shadow DOM and can store user preference in `chrome.storage.sync`. |

## Proposed architecture

The extension separates page interaction from privileged browser APIs. The content script owns all DOM picking, overlay UI, element metadata, and viewport crop math. The background service worker owns tab screenshot capture and downloads. Shared modules keep the port testable and prevent prompt or style-mapping drift.

```text
+-------------------+        messages         +-----------------------------+
| Browser action /  | <---------------------> | Background service worker   |
| minimal popup     |                         | - captureVisibleTab handler |
| - on/off toggle   |                         | - downloads handler         |
| - options link    |                         | - message router            |
+---------+---------+                         +--------------+--------------+
          |                                                   ^
          | toggle                                            |
          v                                                   |
+-----------------------------+       capture/download        |
| Content script @ <all_urls> | ------------------------------+
| run_at: document_end        |
| - Shadow DOM host           |
| - React overlay             |
| - picker engine             |
| - capture cropper           |
| - storage adapter           |
+-------------+---------------+
              |
              v
        Host web page DOM
```

### Manifest summary (MV3)

- WXT generates the MV3 manifest for Chrome first, with eventual Firefox build support.
- Permissions: `activeTab`, `storage`, `scripting`, and `downloads`.
- Host permission: `<all_urls>`.
- Content scripts: inject on `<all_urls>` at `document_end`, but runtime guards must exclude restricted schemes: `chrome://`, `chrome-extension://`, `edge://`, `about:`, `moz-extension://`, and `devtools://`.
- Browser action: toolbar icon toggles the overlay for the active tab.

### Content script: shadow-DOM host, React mount, picker engine, capture cropper

- Creates one extension-owned host element and mounts React 18 into a Shadow DOM root.
- Runs picker listeners in capture phase while avoiding both the Shadow DOM host and extension UI descendants.
- Collects element metadata with `getBoundingClientRect()`, `getComputedStyle()`, text/label/class hints, and Tailwind-style hints.
- Requests a visible-tab screenshot from the background worker and crops the returned image by element rect and `devicePixelRatio`.
- Stores annotation drafts in `chrome.storage.local`.

### Background service worker: captureVisibleTab handler, download handler, message router

- Handles `captureVisibleTab` requests for the current active tab.
- Handles PNG downloads through `chrome.downloads.download` using byte-stable filenames.
- Routes messages between popup/action events and content scripts.

### Popup (minimal): on/off toggle, link to options

- Shows current tab overlay state when available.
- Provides an on/off toggle equivalent to the current floating bubble activation.
- Links to options/preferences if those are added during implementation.

### Side panel: deferred to a later change; mention only

- A browser side panel is not required for the inaugural extraction.
- If needed later, it can host richer annotation management without changing the prompt/output contract.

### Shared modules

- `styleMapper`: Tailwind color/spacing/font/radius dictionaries and raw style extraction.
- `promptBuilder`: byte-stable prompt construction and type labels.
- `pickerEngine`: event wiring, self-avoidance, keyboard layering, and mode transitions.
- `captureCrop`: screenshot request, DPR-aware crop, viewport clipping, optional html2canvas fallback.
- `storage`: `chrome.storage.local` drafts and `chrome.storage.sync` preferences.

## Compatibility & migration notes

- Prompt text format must be byte-stable with `CopilotOverlay.buildPrompt()` from `../Quien-es-quien/src/shared/ui/CopilotOverlay.jsx` lines 214-301.
- PNG filenames must be byte-stable: `vibecopilot-NN-<type>.png`, `vibecopilot-NN-before.png`, and `vibecopilot-NN-after.png`.
- The origin app `localStorage` key `vibe-copilot:<hostname>` is not migrated because extension storage uses a different browser-storage model.
- `CopilotOverlay.jsx` removal and `App.jsx` cleanup happen in a separate follow-up change inside the `Quien-es-quien` repository, not here.
- The extension must not depend on files from `Quien-es-quien` at runtime.

## Risks

- Clipboard behavior differs across browsers and page security contexts; `navigator.clipboard.writeText` may require focused user gestures.
- `html2canvas` fallback can be affected by CORS, tainted canvases, web fonts, pseudo-elements, and host page CSS.
- Shadow DOM event retargeting can complicate self-avoidance, keyboard handling, focus, and pointer capture.
- Restricted schemes cannot be injected or captured; the extension must fail quietly on excluded URLs.
- `devicePixelRatio`, zoom level, scrolling, and viewport clipping can produce off-by-one crop errors.
- WXT is new to this repo, so bootstrap conventions and generated manifest behavior need verification.
- License posture must stay clean: user-owned `CopilotOverlay.jsx` may be ported, but Drawbridge / All Rights Reserved material must not be copied.
- The initial diff can become large if WXT bootstrap, picker port, capture pipeline, and prompt builder all land together.

## Acceptance criteria

- [ ] Extension loads unpacked in Chrome from a WXT build output.
- [ ] Toolbar action toggles the overlay on any allowed URL and does not inject on restricted schemes.
- [ ] Overlay UI mounts inside a Shadow DOM host from the content script.
- [ ] Picker selects host page elements without selecting its own extension UI.
- [ ] Annotate, transform, swap, and text-edit modes each produce annotation records.
- [ ] Transform mode records before/after screenshots and geometry deltas.
- [ ] `copyPrompt` produces byte-identical text to the current `buildPrompt()` contract for equivalent annotation data.
- [ ] PNG downloads use exactly the existing naming scheme, including `before` and `after` transform files.
- [ ] Annotation drafts persist in `chrome.storage.local`; user preferences persist in `chrome.storage.sync` when present.
- [ ] ESC, Ctrl/Cmd+Z, and Ctrl/Cmd+Enter keyboard behaviors match the current layering where applicable.
- [ ] No test runner is required for this change, but a manual smoke checklist exists before completion.

## Review workload forecast

| Phase | Estimated changed lines | Review-budget note |
| --- | ---: | --- |
| WXT/TypeScript/React bootstrap and manifest | 250-450 | May exceed the 400-line budget if lockfile/generated config is reviewed in the same PR. |
| Picker UI and mode port | 700-1100 | Exceeds budget; should be split into chained PRs by mode or UI/core separation. |
| Capture pipeline (`captureVisibleTab`, crop, downloads) | 250-450 | Borderline; split if html2canvas fallback is included. |
| Prompt builder and style mapper port | 250-400 | Fits if isolated and reviewed with byte-stability fixtures/manual samples. |
| Packaging, icons, manual smoke docs | 150-300 | Fits if kept separate from picker implementation. |

Forecast: the full extraction exceeds the 400 changed-line review budget. Plan chained PRs after design/tasks, likely bootstrap first, then shared prompt/style modules, then capture/download, then picker modes.

## Open questions

- Should the injected Shadow DOM root use `mode: "open"` for debuggability or `mode: "closed"` for stronger isolation?
- Tailwind mapping fidelity: should we port the current partial dictionaries exactly, widen coverage, or vendor a mapping table?
- Firefox parity timing: should the first implementation verify only Chrome unpacked, or also produce and smoke a Firefox build immediately?
- What is the intended Web Store publishing path, naming, icon policy, and privacy disclosure timing?
- Should `html2canvas` remain as a fallback for clipped elements, or should the inaugural version drop it and document viewport-only clipping?
- How should overlay enabled/disabled state be represented per tab versus globally across tabs?
- What is the minimum manual fixture page set needed to prove byte-stable prompt text and DPR crop correctness?

## Next steps

- Invoke `sdd-design` next to settle architecture details, message contracts, Shadow DOM mode, capture fallback policy, storage schema, and chained PR boundaries.
- Then invoke `sdd-spec` to capture behavioral requirements for picker modes, capture/crop, prompt builder, downloads, storage, and keyboard handling.
- Then invoke `sdd-tasks` to decompose implementation into review-budget-aware tasks and chained PR phases.
