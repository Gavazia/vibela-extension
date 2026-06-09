# Proposal: Fix panel not opening when clicking bolita

## Summary

The VibeCopilot overlay panel never appears when clicking the floating bolita button. The root cause is a React `useEffect` in `Overlay.tsx` that immediately closes the panel when both `panelOpen` and `hover` are truthy. Since the picker engine continuously tracks hover state via `mousemove`, `hover` is almost always set to a page element when the user clicks the bolita. The effect triggers and closes the panel within the same render cycle.

A secondary bug makes the panel unusable even after fixing the primary issue: the outside-click handler uses `event.composedPath().includes(ref.current)` to detect clicks on bolita/panel elements inside the closed Shadow DOM, which always returns `false`.

## Motivation

- The overlay panel is completely non-functional — users cannot access mode selection, picker controls, export, or annotation list.
- This blocks all four workflows (annotate, transform, swap, text-edit) that were implemented across PRs 4–8.
- The fix is small (~10 lines changed) with no new dependencies or architectural changes.

## Bugs Identified

### Bug 1 — Hover-closing effect (root cause)

**Location**: `src/ui/Overlay.tsx`, lines 143–145

```typescript
useEffect(() => {
  if (panelOpen && hover) setPanelOpen(false);
}, [hover, panelOpen]);
```

**Why**: When the user clicks the bolita, `togglePanel` calls `setPanelOpen(true)`. The picker engine (active by default) already has `hover` set to a page element from the user's mouse position. When React commits the state change, this effect fires with both `panelOpen=true` and `hover=<snapshot>`, immediately calling `setPanelOpen(false)`.

**Why always**: The picker engine (`src/shared/pickerEngine.ts`) registers a global `mousemove` listener on `document` and is always active when the extension is toggled on. Hover is debounced via `requestAnimationFrame`, but the RAF callback may fire before or after the click event — in either case, hover is set to some element before the panel opens, or cleared (by the RAF detecting the bolita is self-UI) too late to prevent the close.

### Bug 2 — Closed Shadow DOM composedPath (follow-on)

**Location**: `src/ui/Overlay.tsx`, lines 125–139

```typescript
useEffect(() => {
  if (!active || !panelOpen) return;
  const onOutsideMouseDown = (event: MouseEvent) => {
    const path = event.composedPath();
    if (bolitaRef.current && path.includes(bolitaRef.current)) return;
    if (panelRef.current && path.includes(panelRef.current)) return;
    setPanelOpen(false);
  };
  document.addEventListener('mousedown', onOutsideMouseDown, true);
  ...
}, [active, panelOpen]);
```

**Why**: For a closed Shadow DOM (`mode: 'closed'`), `event.composedPath()` called from outside the shadow does NOT include elements inside the shadow tree. Both `bolitaRef.current` and `panelRef.current` are inside the closed Shadow DOM. The `includes()` checks always return `false`, causing the handler to close the panel on ANY mousedown — including clicks on the panel's own buttons. This makes the panel UI unusable.

## Fix Design

### Fix 1 — Clear hover before opening panel

In `togglePanel` (`Overlay.tsx`, line 511), call `setHover(null)` before `setPanelOpen(true)`. Both state updates are batched by React 18, so when the commit happens, `hover` is already `null` and the closing effect (Bug 1) doesn't fire.

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

### Fix 2 — Deactivate picker while panel is open

In the `canPick` effect (`Overlay.tsx`, line 348), add `!panelOpen` to the condition and add `panelOpen` to the dependency array. This prevents the picker engine from re-establishing hover while the panel is open, ensuring the closing effect doesn't re-trigger when the user moves the mouse.

```diff
 useEffect(() => {
   const engine = engineRef.current;
-  const canPick = active && pickerOn && !popup && !transformSelected && !swapPopup && !textEditPopup;
+  const canPick = active && pickerOn && !panelOpen && !popup && !transformSelected && !swapPopup && !textEditPopup;
   engine?.setActive(canPick);
   // ...
-}, [active, pickerOn, popup, tool, transformSelected, transformState, swapSource, swapPopup, textEditPopup]);
+}, [active, pickerOn, panelOpen, popup, tool, transformSelected, transformState, swapSource, swapPopup, textEditPopup]);
```

### Fix 3 — Use Shadow DOM event.target for outside-click detection

Replace `event.composedPath().includes(ref)` with a check against `event.target` and the shadow host owner. Since Shadow DOM events are retargeted to the host, we can use an explicit contains check inside the shadow root instead.

```diff
 useEffect(() => {
   if (!active || !panelOpen) return;
   const onOutsideMouseDown = (event: MouseEvent) => {
-    const path = event.composedPath();
-    if (bolitaRef.current && path.includes(bolitaRef.current)) return;
-    if (panelRef.current && path.includes(panelRef.current)) return;
+    // Check if click target is inside our Shadow DOM (retargeted to host)
+    if (event.target instanceof Node && shadowHostEl.contains(event.target)) {
+      // Click is on shadow host or inside it — check if it's on bolita or panel
+      if (bolitaRef.current?.contains(event.target as Node)) return;
+      if (panelRef.current?.contains(event.target as Node)) return;
+    }
     setPanelOpen(false);
   };
   document.addEventListener('mousedown', onOutsideMouseDown, true);
   ...
-}, [active, panelOpen]);
+}, [active, panelOpen, shadowHostEl]);
```

Wait — actually, for closed Shadow DOM, `event.target` is retargeted to the shadow host. So `event.target` is the host element, not internal elements. We can't use `bolitaRef.current.contains(event.target)` because `event.target` is the host, not the button.

A better approach: since the listener is on `document` and the event target is retargeted to the host, we can check if `event.target === shadowHostEl` or if the host contains the event target (for light DOM children of the host, which don't exist). If the target is the shadow host, the click was inside our UI — we should NOT close.

Actually, the simplest approach: `event.target` will be the closest non-shadow element in the light DOM. For a click inside the closed shadow, `event.target` IS the shadow host. For a click outside, `event.target` is some other element. So we just need to check if the click target is our shadow host or inside it:

```typescript
const onOutsideMouseDown = (event: MouseEvent) => {
  const target = event.target as Node;
  // If the click is on our shadow host (which means it was inside our UI),
  // or if the shadow host contains the click target, don't close
  if (target === shadowHostEl || shadowHostEl.contains(target)) return;
  setPanelOpen(false);
};
```

But wait — `shadowHostEl.contains(event.target)`: for a click inside the closed shadow, `event.target` IS `shadowHostEl`. So `shadowHostEl.contains(shadowHostEl)` is `true` (a node contains itself). So this check works: clicks inside our UI → target is host → contains returns true → don't close. Clicks outside → target is some other element → contains returns false → close.

Actually, `Node.contains()` returns true for the node itself:
> "The contains() method returns true if a node is a descendant of a specified node. The specified node itself is also considered a descendant."

So `shadowHostEl.contains(shadowHostEl)` is true. And `shadowHostEl.contains(someOtherElement)` is false. This is exactly what we need.

So the fix for Bug 2 is much simpler:

```diff
 useEffect(() => {
   if (!active || !panelOpen) return;
   const onOutsideMouseDown = (event: MouseEvent) => {
-    const path = event.composedPath();
-    if (bolitaRef.current && path.includes(bolitaRef.current)) return;
-    if (panelRef.current && path.includes(panelRef.current)) return;
+    // Closed Shadow DOM retargets internal events to the host.
+    // If the click target is our shadow host, it was inside our UI — don't close.
+    if (event.target === shadowHostEl || shadowHostEl.contains(event.target as Node)) return;
     setPanelOpen(false);
   };
   document.addEventListener('mousedown', onOutsideMouseDown, true);
   ...
-}, [active, panelOpen]);
+}, [active, panelOpen, shadowHostEl]);
```

This is cleaner and correctly handles the closed Shadow DOM case.

## In Scope

- Fix Bug 1: clear hover in `togglePanel` before opening the panel
- Fix Bug 1: add `!panelOpen` to the picker `canPick` condition
- Fix Bug 2: replace `composedPath().includes()` with `shadowHostEl.contains(event.target)` in the outside-click handler
- Run typecheck and build to verify no regressions

## Out of Scope

- No new features or mode changes
- No test runner setup (strict TDD is not active)
- No CSS/styling changes
- No population of the `docs/manual-smoke.md` with new tests

## Risks

- The fix for Bug 2 replaces `composedPath()` with a Node.contains check. Since Shadow DOM event retargeting is well-specified and consistent across Chrome MV3, this is low risk. Firefox (if supported later) has the same behavior.
- The picker deactivation when panel is open (Fix 2) means the picker stops tracking hover while the panel is showing. This is intentional and matches user expectation: the panel is for UI interaction, not element picking. When a mode is selected, `setMode` already calls `setPanelOpen(false)`, restoring picker activity.

## Acceptance Criteria

- [ ] Panel opens and stays visible when clicking the bolita on any allowed page
- [ ] Mode buttons inside the panel are clickable and switch tools
- [ ] Picker on/off button inside the panel toggles correctly
- [ ] Export button works (copies prompt, downloads PNG)
- [ ] Annotation count and summary display correctly
- [ ] Clicking outside the panel (on page content) closes it
- [ ] Clicking the bolita while panel is open closes it (toggle)
- [ ] Typecheck and build pass with zero errors

## Review Workload Forecast

| Change | Est. lines | Notes |
| --- | ---: | --- |
| Fix 1: clear hover in togglePanel | +1 | One line |
| Fix 2: add !panelOpen to canPick | ~3 | Condition + dependency |
| Fix 3: outside-click contains check | ~5 | Replace 6 lines with 3 |
| **Total** | **~9** | Single PR, well under 250-line budget |
