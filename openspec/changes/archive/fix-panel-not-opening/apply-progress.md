# Apply Progress: fix-panel-not-opening

## Single PR — All three fixes

### Completed tasks

- Applied **Task 1**: Added `setHover(null)` before `setPanelOpen(...)` in `togglePanel` (`src/ui/Overlay.tsx` line 517). This clears any stale hover state before the panel opens, preventing the closing effect from immediately re-closing it.
- Applied **Task 2**: Added `!panelOpen` to the `canPick` condition (line 388) and `panelOpen` to the dependency array (line 401). This deactivates the picker engine while the panel is open, preventing mousemove from re-establishing hover and re-triggering the close.
- Applied **Task 3**: Replaced `event.composedPath().includes(ref)` with `shadowHostEl.contains(event.target)` in the outside-click handler (lines 134–137). This correctly handles closed Shadow DOM event retargeting — `event.target` is the shadow host for internal clicks, and `Node.contains()` returns true for the node itself.
- Ran `npm run typecheck` — passed with zero errors.
- Ran `npm run build` — passed, produced `.output/chrome-mv3/`.

### Files changed

- `src/ui/Overlay.tsx`

### Line delta

| Change | Lines |
| --- | ---: |
| togglePanel: added `setHover(null)` | +1 |
| canPick condition: added `!panelOpen` | ~1 |
| canPick deps: added `panelOpen` | ~1 |
| outside-click handler: replaced composedPath with contains | −6 +4 |
| outside-click deps: added `shadowHostEl` | ~1 |
| **Total hand-written delta** | **~9 lines** |

### TDD Cycle Evidence

Strict TDD is not active for this repository (`openspec/config.yaml` has `strict_tdd: false` and no detected runner), so no RED/GREEN/REFACTOR cycles were required.

### Deviations from design

None. All three tasks implemented exactly as specified in `tasks.md`.

### Remaining tasks

- Manual Chrome verification: load `.output/chrome-mv3/`, toggle overlay, click bolita, verify panel appears and stays visible, verify mode buttons are clickable, verify outside-click closes the panel, verify bolita toggles correctly.

### Workload / PR boundary

- Delivery path: single PR
- Hand-written delta: 9 lines, well under the 250-line review budget.
