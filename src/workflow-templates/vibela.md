---
description: Process Vibela UI annotation tasks from the .vibela/ task queue
---

# /vibela — Process Vibela UI Annotation Tasks

## Task File Location

The task queue lives at `.vibela/tasks.json` — the extension always scaffolds
this directory on connect. Do not pick up `tasks.json` files found elsewhere in
the tree; they belong to other tools.

If it does not exist, see **Error: No .vibela/ directory** below.

## Full Workflow Rules

The complete workflow (status lifecycle, modes, dependency detection, batching,
framework detection, annotation type semantics) is defined in:

```
.vibela/vibela-workflow.md
```

Read that file before processing tasks. It is the authoritative rules document.

## Critical Instructions (inline summary)

### Status Lifecycle
Every task MUST follow this lifecycle — no shortcuts:

```
to do  →  doing  →  done
                 ↘  failed  →  to do  (retry)
```

- Set `"doing"` **before** making any code changes for a task.
- Set `"done"` or `"failed"` **after** the change is complete.
- Update **both** `tasks.json` and `tasks.md` in the same batch operation.
- Forbidden: `to do → done`, `done → doing`, `done → failed`, `failed → done`.

### Mode Selection
- `/vibela` or `/vibela step` — one task at a time, pause for approval (default)
- `/vibela batch` — group related tasks (same component / selector / type)
- `/vibela yolo` — all pending tasks autonomously, no pausing (explicit only)

Auto-select: step for ≤ 5 mixed tasks; batch for 6+ same-type tasks targeting
the same component or file; never auto-select yolo.

### No Auto-Commit
**NEVER** run `git commit`, `git push`, or create a PR.
Edit code → update task statuses → stop. The developer reviews and commits.

---

## Error Messages

### No .vibela/ directory
```
❌ No .vibela/ directory found in this project.

Please connect this project from the Vibela browser extension:
  1. Open Vibela in your browser (the extension overlay).
  2. Click "Conectar proyecto".
  3. Select this repository's root directory.
  4. Click "Sincronizar" to write the task files.

Then run /vibela again.
```

### No pending tasks
```
✅ No pending Vibela tasks. Queue is empty or all tasks are already done.
```

---

## Slash Command Variants

| Command | Behavior |
|---|---|
| `/vibela` | Step mode (default) — one task at a time |
| `/vibela step` | Explicit step mode |
| `/vibela batch` | Batch mode — group related tasks |
| `/vibela yolo` | Yolo mode — all tasks, no approval pauses |

---

> **Other agents:** On sync, Vibela deploys a thin pointer as each agent's native
> config — Claude skill (`.claude/skills/vibela/SKILL.md`), Cursor
> (`.cursor/rules/vibela.mdc`), Windsurf (`.windsurf/rules/vibela.md`), Google
> Antigravity (`.agent/rules/vibela.md`), plus a managed block in the cross-agent
> `AGENTS.md` and `.github/copilot-instructions.md` (only our `vibela:start/end`
> section is touched). All point here / at `.vibela/vibela-workflow.md` — the
> single authoritative rules source. New IDEs are one registry entry.
