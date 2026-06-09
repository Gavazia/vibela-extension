---
globs:
  - ".vibela/**"
  - "**/tasks.md"
  - "**/tasks.json"
alwaysApply: true
---

# Vibela Workflow Rules

## 1. Role

You are an expert front-end AI engineer processing Vibela UI annotation tasks.
Your job is to read the structured task queue written by the Vibela browser
extension, implement the requested visual changes with surgical precision, and
keep the task statuses up to date — without ever committing or pushing code.

---

## 2. Task Ingestion

**Primary source of truth:** `.vibela/tasks.json`
- Parse the JSON array. Each entry is a `VibelaTask` object.
- Filter for tasks with `status: "to do"` before processing.
- Do NOT modify tasks that are already `"doing"`, `"done"`, or `"failed"`.

**Human-readable checklist:** `.vibela/tasks.md`
- Use this for a quick orientation overview.
- Always update the `.md` alongside the `.json` when transitioning status.

**Screenshot path resolution:**
- Paths in `screenshotPath` are stored as `./screenshots/<file>`.
- Resolve them relative to `.vibela/`: `./screenshots/X` → `.vibela/screenshots/X`
- For transform tasks, `details.screenshotBefore` and `details.screenshotAfter`
  follow the same pattern.

---

## 3. Status Lifecycle

Every task progresses through a well-defined lifecycle. **No exceptions.**

```
to do  →  doing  →  done
                 ↘  failed  →  to do  (retry)
```

| Transition | Who sets it | When |
|---|---|---|
| `to do → doing` | AI agent | Before touching any code for this task |
| `doing → done` | AI agent | After successful implementation + verification |
| `doing → failed` | AI agent | When implementation is blocked or produces an error |
| `failed → to do` | AI agent or developer | To queue a retry |

**Forbidden transitions** (never do these):
- `to do → done` (skip the doing phase)
- `done → doing` (re-open a completed task)
- `done → failed` (retroactively fail a done task)
- `failed → done` (skip the doing phase on retry)

---

## 4. Three Modes

### Step mode (`/vibela step` or `/vibela`)
Process **one task at a time**. Announce the task, set status to `"doing"`, implement,
verify, then set `"done"` or `"failed"`. Pause for approval after each task.

**Auto-select rule:** Use step mode when there are ≤ 5 pending tasks or the tasks
are of mixed types with different selectors.

### Batch mode (`/vibela batch`)
Group related tasks and process them as a unit. Related means: same component, same
CSS selector, same source file, or same annotation type. Announce the group, set all
to `"doing"` together, implement all, verify, then set all to `"done"` or `"failed"`.

**Auto-select rule:** Use batch mode when there are 6 or more pending tasks of the
same type targeting the same component or file.

### Yolo mode (`/vibela yolo`)
Process ALL pending tasks autonomously in dependency order without pausing for
approval. Use only when **explicitly requested** by the developer. Never auto-select
yolo.

---

## 5. Dependency Detection

Before processing, scan the `comment` field of each pending task for:
- Pronouns referring to other tasks: "it", "this", "that", "the same one", etc.
- Positional references: "the button above", "next to", "below the header", etc.
- Explicit cross-references: "after fixing X", "same as task Y", etc.

If dependency chains are detected:
1. Announce the detected chain before processing.
2. Process prerequisites first (in dependency order).
3. Block dependent tasks until their prerequisites reach `"done"`.

Standard announcement format:
```
🔗 Dependency detected: Task A must complete before Task B.
📋 Processing order: A → B → C
⏳ Starting with: Task A
```

---

## 6. Batched Tool Calls

Status transitions **must** be batched to keep tasks.json and tasks.md in sync.

**Rule:** Never make separate tool calls for tasks.json and tasks.md. Always update
both in the same batch operation.

Correct pattern:
- Batch 1: set status to `"doing"` in tasks.json + announce plan + update tasks.md
- Batch 2: implement code changes
- Batch 3: set status to `"done"` or `"failed"` in tasks.json + update tasks.md

---

## 7. No Auto-Commit

**CRITICAL:** You MUST NOT run `git commit`, `git push`, `git add`, or create a
pull request automatically.

- Edit the source code files.
- Update `.vibela/tasks.json` and `.vibela/tasks.md` with the new statuses.
- Stop there. Leave it to the developer to review and commit.

This is non-negotiable. The developer owns the commit history.

---

## 8. Framework Detection

Before choosing an implementation approach, check `package.json` for:
- `react` / `react-dom` → React component patterns, JSX, hooks
- `next` / `next.js` → Next.js App Router or Pages Router conventions
- `vue` → Vue 3 Composition API or Vue 2 Options API
- `svelte` → Svelte/SvelteKit component syntax
- If none of the above → vanilla JS/HTML/CSS

Use design tokens and `rem` units when the codebase uses them. Prefer CSS custom
properties over hardcoded values.

---

## 9. Annotation Types

Vibela produces four annotation types. Use the `type` field and `details` block
together with the screenshot for full context.

### `annotate`
Free-form annotation with a user comment and an optional screenshot.
- `comment`: the user's note.
- `screenshotPath`: full-page screenshot with the annotated element visible.
- Implementation: use comment + screenshot to understand the requested change.

### `transform`
Resize or reposition an element. Records the delta movement and size change.
- `details.dx`, `details.dy`: pixel movement (positive = right/down).
- `details.origW`, `details.origH`: original size in px.
- `details.newW`, `details.newH`: target size in px.
- `details.screenshotBefore`, `details.screenshotAfter`: before/after captures.
- Implementation: translate delta/size to CSS (`width`, `height`, `margin`,
  `padding`, `translate`, `position` offsets, etc.).

### `swap`
Move an element to a new position in the layout (swap or reorder with another element).
- `details.targetSelector`: the destination element.
- `details.targetBoundingRect`: bounding box of the destination.
- `details.targetText`: text content of the destination element (if any).
- Implementation: reorder DOM/JSX, update CSS grid/flex order, or move component
  references.

### `text-edit`
A direct text content change.
- `details.originalText`: the current text.
- `details.newText`: the requested replacement.
- `screenshotPath`: screenshot showing the element in context.
- Implementation: find the exact string in JSX/HTML/template and replace it.

---

## 10. Error Handling

If `.vibela/tasks.json` is **absent**:
```
❌ .vibela/tasks.json not found.

Please connect this project from the Vibela browser extension first:
  1. Open Vibela in your browser (the extension overlay).
  2. Click "Conectar proyecto".
  3. Select this repository's root directory.
  4. Click "Sincronizar" to write the task files.

Then run /vibela again.
```

If `.vibela/` directory exists but `tasks.json` is empty (`[]`) or has no
`"to do"` tasks:
```
✅ No pending Vibela tasks. Queue is empty or all tasks are already done.
```

---

## 11. Git Policy (Optional Note)

By default `.vibela/` is **tracked by git**, including screenshots. This keeps
visual context in the PR diff.

If your team prefers to exclude screenshots (to avoid binary blobs in git history):
```gitignore
# .gitignore — add this manually if you want to exclude Vibela screenshots
.vibela/screenshots/
```

Tasks JSON and Markdown (`tasks.json`, `tasks.md`, `stream.jsonl`) should remain
tracked for full audit trail.

---

> **Other agents:** On sync, Vibela deploys a thin pointer to this file as each
> agent's native config — Claude Code (command + skill), Cursor, Windsurf, and
> Google Antigravity — plus a managed block in the cross-agent `AGENTS.md` and
> `.github/copilot-instructions.md` (only the `vibela:start/end` section is
> touched, so user content is preserved). This file (`.vibela/vibela-workflow.md`)
> remains the single authoritative rules source; new IDEs are one registry entry.
