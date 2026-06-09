## Vibela — UI annotation workflow

This repo is connected to **Vibela**, a browser extension that turns human UI
annotations into structured tasks under `.vibela/`. When the user runs `/vibela`,
asks to "process Vibela tasks" / "apply the annotations", or mentions
`.vibela/tasks.json`, work the queue.

**Authoritative rules — read this first:** `.vibela/vibela-workflow.md` is the
single source of truth (modes, dependency detection, batching, annotation types,
screenshots). The essentials below are enough to start safely.

- **Queue:** `.vibela/tasks.json` (source of truth) mirrored by `.vibela/tasks.md`
  — keep both in sync. Screenshots live at `.vibela/screenshots/<id>.png` (a
  full-viewport shot with the annotated element highlighted). Only process tasks
  whose `status` is `"to do"`.
- **Lifecycle (no shortcuts):** `to do → doing → done`, or `doing → failed → to do`.
  Set `"doing"` BEFORE editing code, `"done"`/`"failed"` AFTER; update the JSON and
  the MD in the same batch. Forbidden: `to do → done`, `done → doing`, `done → failed`.
- **Mode:** default to step (one task at a time, pause for approval). Use batch for
  6+ same-type tasks; yolo only when explicitly asked.
- **Never auto-commit:** edit code, update statuses, then stop. The developer owns
  the commit history and reviews the diff.
