# Known limitations

Vibela v1 is intentionally small and Chrome-first.

- **Viewport-only capture.** Screenshots use `chrome.tabs.captureVisibleTab` plus content-side cropping. Off-screen or heavily clipped elements may need scrolling before capture.
- **Partial Tailwind mapping.** Tailwind hints mirror the v1 parity dictionaries only; unmapped computed styles are preserved as raw CSS fields rather than widened automatically.
- **Transform save does not auto-restore inline styles.** Saved transform previews leave the user's accepted inline `transform`, `width`, and `height` changes in place. Cancel restores the original inline values.
- **No html2canvas fallback in v1.** This avoids CORS, tainted-canvas, font, and bundle-size issues.
- **Chrome-only v1 verification.** Firefox/WebExtensions support is deferred; Chrome MV3 unpacked is the only smoke target for this change.
- **No iframe/cross-frame support.** The v1 picker is scoped to the current top-frame document.
- **No direct LLM submission.** The extension copies a prompt and downloads PNGs for manual handoff.
- **No origin-app migration.** Existing in-app annotations from Quien-es-quien are not migrated into extension storage.
- **Manual icons are still placeholder quality.** The current PNGs are simple generated monogram icons, not final brand or Web Store artwork.
