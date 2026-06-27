<div align="center">

# Vibela

**A browser-to-code feedback loop for AI coding agents.**

Inject an overlay into any running web app, point at the elements that look wrong,
annotate them, and Vibela writes a structured task queue your AI agent
(Claude Code, Cursor, Codex, Windsurf, …) reads and acts on.

[Install](#install) · [How it works](#how-it-works) · [Development](#development) · [Architecture](#architecture)

</div>

---

## What it is

Vibela is a browser extension (Chrome MV3 / Firefox MV2) that turns "this looks
wrong in the browser" into "the agent has the exact diff." You stay in the page
you are building, mark up the UI visually, and Vibela exports the intent — element
selectors, bounding boxes, screenshots, and your notes — into a local `.vibela/`
queue at your repo root. An AI coding agent picks that queue up and turns it into
code changes. No backend, no cloud, no account. **Local-first by default.**

## Features

| Mode | What it captures |
| --- | --- |
| 🟢 **Annotate** | A comment pinned to an element, plus a viewport screenshot with the element highlighted. |
| 🟠 **Transform** | A resize/move gesture — original vs. new bounding box, with before/after screenshots. |
| 🟣 **Swap** | "Replace this element with that one" — source + target selectors and geometry. |
| 🔵 **Text-edit** | An inline text change — original vs. new text. |

Every annotation becomes a task in `.vibela/tasks.json` (mirrored to a human-readable
`tasks.md` and an append-only `stream.jsonl`), with screenshots under
`.vibela/screenshots/`.

## How it works

```
┌─────────────┐   annotate    ┌──────────────┐   sync/export   ┌──────────────┐
│  Your web    │ ───────────▶ │   Vibela      │ ─────────────▶ │  .vibela/     │
│  app (page)  │   the UI      │   overlay     │   to disk       │  task queue   │
└─────────────┘               └──────────────┘                 └──────┬───────┘
                                                                       │ reads
                                                                       ▼
                                                                ┌──────────────┐
                                                                │  AI agent     │
                                                                │ (Claude Code, │
                                                                │  Cursor, …)   │
                                                                └──────────────┘
```

1. **Toggle the overlay** with the toolbar button on any page.
2. **Pick & annotate** elements in one of the four modes.
3. **Connect a project** (Chrome) — pick your repo folder once; Vibela scaffolds
   `.vibela/` and per-agent workflow files, then writes annotations straight to disk.
4. **The agent runs** — it reads `.vibela/tasks.json` and applies the changes.

On connect, Vibela also deploys a discoverable workflow file for each agent it
supports (Claude Code skill, Cursor rule, Windsurf rule, `AGENTS.md`,
GitHub Copilot instructions…), so any connected agent auto-discovers how to
process the queue. The full rules live in `.vibela/vibela-workflow.md`; everything
else is a thin pointer to it.

## Install

### Chrome / Edge / Brave (MV3)

```bash
npm install
npm run build        # writes the unpacked extension to .output/chrome-mv3/
```

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. **Load unpacked** → select `.output/chrome-mv3/`.

### Firefox (MV2)

```bash
npm install
npm run build:firefox   # writes .output/firefox-mv2/   (or: npm run dev:firefox)
```

1. Open `about:debugging#/runtime/this-firefox`.
2. **Load Temporary Add-on…** → select `.output/firefox-mv2/manifest.json`.

> **Firefox note.** Firefox does not implement the File System Access API, so the
> direct `.vibela/`-to-disk sync is Chrome-only. In Firefox the panel offers
> **⬇ Export .vibela (zip)** instead: it packages the same payload — tasks,
> screenshots, and the workflow file — into `vibela-export.zip`. Unzip it at your
> repo root to feed the agent loop.

## Usage

1. Click the Vibela toolbar icon to toggle the overlay on the current tab.
2. Open the panel (the floating bead) and **Activate picker**.
3. Hover to highlight an element, click to annotate; pick a mode and add your note.
4. **Connect project** (Chrome) and **Sync**, or **Export .vibela (zip)** (Firefox).
5. Tell your agent to process `.vibela/` (e.g. run the `/vibela` command in Claude Code).

## Development

```bash
npm run dev            # WXT dev server (Chrome)
npm run dev:firefox    # WXT dev server (Firefox)
npm run typecheck      # wxt prepare && tsc --noEmit
npm run build          # production Chrome build  → .output/chrome-mv3/
npm run build:firefox  # production Firefox build → .output/firefox-mv2/
npm run zip            # packaged .zip under .output/
npm run test:unit      # Vitest unit tests
npm test               # Playwright E2E (builds first)
```

**Stack:** [WXT](https://wxt.dev) 0.20 · React 18 · TypeScript · Vite · Vitest · Playwright.

### Testing

- **Unit (Vitest):** pure modules — serialization (`vibelaWriter`), the project-sync
  write path against a mock FS, and the ZIP export builder.
- **E2E (Playwright):** runs against the real built extension in a non-headless
  Chromium persistent context (the only mode Chrome extensions support). Regression
  tests guard the panel-stays-open behavior, the closed-shadow-DOM outside-click
  handler, and `web_accessible_resources` for icons.

Serve the fixture pages when smoke-testing the picker:

```bash
npx http-server fixtures/   # then open fixtures/{light,dark,nested}.html
```

## Architecture

```
src/
├─ entrypoints/
│  ├─ background.ts     Service worker — overlay toggle, badge, screenshot capture
│  ├─ content.tsx       Injects the Shadow-DOM overlay into the page
│  └─ popup/            Toolbar popup
├─ ui/
│  ├─ Overlay.tsx       The overlay UI — picker, modes, connect/sync/export panel
│  └─ TransformLayer.tsx
├─ shared/
│  ├─ projectSync.ts    File System Access API wiring (.vibela/ scaffold + sync)
│  ├─ downloadExport.ts ZIP fallback for browsers without File System Access
│  ├─ vibelaWriter.ts   Pure serialization: annotations → tasks.json / .md / .jsonl
│  ├─ promptBuilder.ts  Structured prompt synthesis
│  ├─ pickerEngine.ts   Element picking + highlight
│  └─ …
└─ workflow-templates/  Agent-agnostic workflow + per-agent pointers
```

Design notes:

- The overlay lives in a **closed Shadow DOM** so the host page's styles can't leak in.
- `chrome.tabs.captureVisibleTab` is **rate-limited to ~2 calls/sec**; captures are
  serialized and spaced to stay under quota (see `background.ts`).
- Annotation drafts use `unlimitedStorage` (full-viewport PNG data URLs overrun the
  default 10 MB `storage.local` quota) and are garbage-collected on tab close / startup.

## Documentation

- [Local install and packaging](docs/install.md)
- [Manual Chrome smoke checklist](docs/manual-smoke.md)
- [Prompt byte-stability checks](docs/byte-stability.md)
- [Known limitations](docs/known-limitations.md)

## License

MIT
