# Tasks: Fix panel not opening when clicking bolita

## Task Breakdown

### Task 1 — Clear hover in togglePanel

**File**: `src/ui/Overlay.tsx`
**Lines**: ~517

Add `setHover(null)` before `setPanelOpen((open) => !open)` in the `togglePanel` function.

```diff
 const togglePanel = () => {
   if (dragRef.current?.moved) {
     dragRef.current = null;
     return;
   }
   dragRef.current = null;
+  setHover(null);
   setPanelOpen((open) => !open);
 };
```

**Rationale**: By clearing hover synchronously (batched in the same React update as panelOpen), the closing effect at line 143-145 won't find `hover` truthy when the panel opens. Both updates commit together: panelOpen=true, hover=null.

### Task 2 — Deactivate picker when panel is open

**File**: `src/ui/Overlay.tsx`
**Lines**: ~386, ~394

Add `!panelOpen` to the `canPick` condition and add `panelOpen` to the effect's dependency array.

```diff
 useEffect(() => {
   const engine = engineRef.current;
-  const canPick = active && pickerOn && !popup && !transformSelected && !swapPopup && !textEditPopup;
+  const canPick = active && pickerOn && !panelOpen && !popup && !transformSelected && !swapPopup && !textEditPopup;
   engine?.setActive(canPick);
   let mode: PickerMode = 'idle';
   if (canPick) {
     if (tool === 'transform') mode = 'transform.select';
     else if (tool === 'swap') mode = swapSource ? 'swap.second' : 'swap.first';
     else if (tool === 'text-edit') mode = 'text-edit';
     else mode = 'annotate';
   } else if (transformSelected) mode = transformState;
   else if (swapPopup) mode = 'swap.popup';
   else if (textEditPopup) mode = 'text-edit.popup';
   engine?.setMode(mode);
   if (!active) { setHover(null); setSelected(null); resetTransient(); }
-}, [active, pickerOn, popup, tool, transformSelected, transformState, swapSource, swapPopup, textEditPopup]);
+}, [active, pickerOn, panelOpen, popup, tool, transformSelected, transformState, swapSource, swapPopup, textEditPopup]);
```

**Rationale**: After Task 1 clears hover, the picker engine would otherwise re-establish hover on the next mousemove (via its RAF loop), re-triggering the closing effect. By deactivating the picker when the panel is open, no hover events are emitted. The picker reactivates when a mode is selected (setMode calls setPanelOpen(false)).

### Task 3 — Fix outside-click detection for closed Shadow DOM

**File**: `src/ui/Overlay.tsx`
**Lines**: ~130–137

Replace `event.composedPath().includes(ref)` with a `shadowHostEl.contains(event.target)` check.

```diff
 useEffect(() => {
   if (!active || !panelOpen) return;
   const onOutsideMouseDown = (event: MouseEvent) => {
-    const path = event.composedPath();
-    if (bolitaRef.current && path.includes(bolitaRef.current)) return;
-    if (panelRef.current && path.includes(panelRef.current)) return;
+    // Closed Shadow DOM retargets internal events to the host.
+    // If the click landed inside our shadow host, it was on our UI — don't close.
+    if (event.target instanceof Node && shadowHostEl.contains(event.target)) return;
     setPanelOpen(false);
   };
   document.addEventListener('mousedown', onOutsideMouseDown, true);
   return () => document.removeEventListener('mousedown', onOutsideMouseDown, true);
-}, [active, panelOpen]);
+}, [active, panelOpen, shadowHostEl]);
```

**Rationale**: In a closed Shadow DOM, events from inside the shadow are retargeted so `event.target` === the shadow host. `Node.contains()` returns true for the node itself. So `shadowHostEl.contains(event.target)` correctly detects any click inside our UI (bolita or panel). Clicks on page content have a different target and will close the panel.

### Task 4 — Verify (typecheck + build)

```bash
npm run typecheck
npm run build
```

Must pass with zero errors.

## Acceptance Checklist

- [ ] Task 1: hover cleared in togglePanel
- [ ] Task 2: picker deactivated when panel is open
- [ ] Task 3: outside-click detection uses contains() instead of composedPath()
- [ ] Panel opens and stays visible when clicking the bolita
- [ ] Mode buttons inside the panel are clickable
- [ ] Picker on/off button works
- [ ] Export button works
- [ ] Clicking outside the panel closes it
- [ ] Clicking bolita while panel is open toggles it closed
- [ ] `npm run typecheck` passes
- [ ] `npm run build` passes

## PR Boundary

Single PR: ~9 lines changed across one file (`src/ui/Overlay.tsx`). Well under the 250-line review budget.
