# Manual Chrome smoke checklist

Manual Chrome smoke is the current verification gate for Vibela. Run this after `npm run build`, then load `.output/chrome-mv3/` from `chrome://extensions` with Developer Mode enabled.

Record the Chrome version, OS, extension build date, and ZIP filename from `npm run zip` in the PR notes.

## 1. Build, package, and load unpacked

- [ ] `npm run typecheck` passes.
- [ ] `npm run build` passes and creates `.output/chrome-mv3/`.
- [ ] `npm run zip` passes and creates a Chrome MV3 ZIP under `.output/`.
- [ ] Chrome loads `.output/chrome-mv3/` via **Load unpacked** without manifest errors.
- [ ] The toolbar shows the Vibela icon/title.

## 2. Fixture setup

Serve fixtures from the repo root, for example:

```bash
npx http-server fixtures/
```

Open these pages in Chrome:

- [ ] `fixtures/light.html`
- [ ] `fixtures/dark.html`
- [ ] `fixtures/nested.html`

## 3. Restricted schemes and per-tab toggle

- [ ] On `chrome://extensions`, toggling Vibela fails quietly: no host-page UI is injected and no unhandled console errors appear.
- [ ] On an allowed fixture page, toolbar toggle turns the overlay on and off.
- [ ] With two allowed tabs open, toggling one tab does not toggle the other.
- [ ] Reloading a toggled tab keeps behavior consistent with the per-tab `chrome.storage.session` flag.

## 4. Mode coverage

### Annotate

- [ ] Select **Anotar**, click a visible element, enter a comment, and save.
- [ ] A persisted `annotate` record appears in `chrome.storage.local`.

### Transform

- [ ] On `fixtures/dark.html`, select **Reposicionar**, choose a card/button, drag and resize it, then save.
- [ ] Save creates a `transform` record with movement and size deltas.
- [ ] Cancel restores inline styles and creates no record.

### Swap

- [ ] On `fixtures/nested.html`, select **Intercambiar**, choose source and destination elements, add a comment, and save.
- [ ] Save creates a `swap` record with both source and destination metadata.

### Text-edit

- [ ] Select **Editar texto** or double-click a text-bearing element.
- [ ] Enter proposed text and save.
- [ ] Save creates a `text-edit` record containing original and proposed text.

## 5. Keyboard layering

- [ ] `Esc` closes the text-edit popup first.
- [ ] `Esc` closes an annotate popup before pausing the picker.
- [ ] `Esc` closes a swap popup, then resets swap second-step, then falls back to picker pause.
- [ ] `Esc` cancels transform preview and restores original inline styles.
- [ ] `Ctrl/Cmd+Z` undoes overlay annotation mutations when focus is not inside an editable field.
- [ ] `Ctrl/Cmd+Enter` saves valid annotate, transform, swap, and text-edit forms.

## 6. Prompt, PNG, and byte-stability spot check

- [ ] Create a mixed set containing annotate, transform, swap, and text-edit records.
- [ ] Use the overlay copy/export action.
- [ ] Clipboard prompt contains all four mode sections.
- [ ] Downloaded PNG filenames match prompt markers exactly, including transform `before`/`after` names.
- [ ] Spot check the prompt against `fixtures/prompts/mixed.golden.txt` using `docs/byte-stability.md`; only the live `Fecha:` line may differ.

## 7. Storage inspection

Inspect extension storage from DevTools/background or content context:

- [ ] `chrome.storage.session` contains per-tab keys named `overlayActive:<tabId>`.
- [ ] `chrome.storage.local` contains annotation draft keys named `annotations:<tabId>:<origin>`.
- [ ] `chrome.storage.sync` contains the `prefs` object when preferences have been touched.

## 8. Result

- [ ] PASS: all required checks above were completed successfully.
- [ ] PARTIAL: note failed or unrun checks in `openspec/changes/extract-copilot-overlay-into-extension/apply-progress.md`.
