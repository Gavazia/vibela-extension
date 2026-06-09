# Prompt byte-stability checks

## Baseline change log

| Date | Change | Reason |
|------|--------|--------|
| 2026-06-04 | Rebrand: `== VIBECOPILOT PROMPT ==` → `== VIBELA PROMPT ==`; asset prefix `vibecopilot-NN` → `vibela-NN`; full-page filename updated. Golden regenerated via `scripts/gen-golden.ts`. | Vibela MVP rebrand (intentional) |

PR 2 keeps prompt construction pure in `src/shared/promptBuilder.ts`; live picker and capture flows are added in later PRs.

## Fixture procedure

1. Use `fixtures/light.html`, `fixtures/dark.html`, and `fixtures/nested.html` as manual DOM/style pages.
2. Build canned `Annotation[]` records with metadata from `getElInfo()` or the documented fixture shapes.
3. Call `buildPrompt(records, { date: '1 de enero de 2026', pathname: '/fixtures/<name>.html', viewport: { w: 1280, h: 720 } })`.
4. Compare the result with the matching file in `fixtures/prompts/`:

```bash
git diff --no-index fixtures/prompts/mixed.golden.txt /tmp/vibela-actual.txt
```

If a live date is used instead of the override, filter only the `Fecha:` line before diffing. Any other byte difference is a failure.

## Live overlay spot check

For PR 7, create one mixed session from the overlay that includes annotate, transform, swap, and text-edit. Copy the prompt, paste it to a temporary file, and compare against the compact golden:

```bash
grep -v '^Fecha:' fixtures/prompts/mixed.golden.txt > /tmp/vc-golden.txt
grep -v '^Fecha:' /tmp/vibela-actual.txt > /tmp/vc-actual.txt
git diff --no-index /tmp/vc-golden.txt /tmp/vc-actual.txt
```

Only `Fecha:` may differ. If element metadata differs because the live picks do not match the canned fixture records, record that as a manual-smoke finding instead of editing prompt code in PR 7.

## Review note

The committed `mixed.golden.txt` intentionally covers annotate, transform, swap, and text-edit in one compact prompt to avoid bloating PR 2. Larger per-page goldens remain optional follow-up artifacts after the manual smoke pass is complete.
