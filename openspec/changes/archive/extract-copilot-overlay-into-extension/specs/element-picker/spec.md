# Delta for Element Picker

## ADDED Requirements

### Requirement: Host-page hover highlight

When a picker mode is active, the system MUST show a hover highlight that follows eligible host-page elements under the pointer.

#### Scenario: Highlight follows the current element

- GIVEN the overlay is active in annotate mode on an allowed page
- WHEN the user moves the pointer from one host-page element to another
- THEN the highlight MUST move to the currently hovered host-page element
- AND the highlight geometry MUST match the element viewport rectangle closely enough for manual verification.

### Requirement: Extension UI self-avoidance

The picker MUST NOT select or highlight extension UI, and self-avoidance MUST be based on event `composedPath()` plus the extension host identity rather than host-page selectors.

#### Scenario: Click inside overlay controls

- GIVEN the overlay mode bar or an annotation popup is visible
- WHEN the user clicks an overlay control
- THEN the click MUST NOT create or update a host-page annotation selection
- AND the intended overlay control action MUST still run.

### Requirement: Annotate mode record creation

Annotate mode MUST create an annotation popup for the selected host-page element and MUST save an annotation record containing element metadata, comment text, and an optional screenshot.

#### Scenario: Save annotate record

- GIVEN annotate mode is active and the user clicks an eligible host-page element
- WHEN the user enters a comment and saves the popup
- THEN the system MUST add an `annotate` record to the annotation list
- AND the record MUST include the selected element metadata and comment.

### Requirement: Transform mode selection and live editing

Transform mode MUST support element selection, live drag, resize handles, before/after geometry capture, save, and cancel.

#### Scenario: Save transform with geometry delta

- GIVEN transform mode is active
- WHEN the user selects a host-page element, drags it, resizes it, and saves
- THEN the system MUST add a `transform` record
- AND the record MUST include original width and height, new width and height, and X/Y movement.

#### Scenario: Cancel transform restores preview

- GIVEN a selected element has been moved or resized in transform mode
- WHEN the user cancels the transform
- THEN the element MUST return to its original inline transform, width, and height values
- AND no transform annotation record MUST be added.

### Requirement: Swap mode source and destination capture

Swap mode MUST capture a source element first and a destination element second before saving a swap annotation.

#### Scenario: Save swap record

- GIVEN swap mode is active
- WHEN the user clicks a source element, clicks a destination element, and saves the swap popup
- THEN the system MUST add a `swap` record
- AND the record MUST include metadata for both the source and destination elements.

### Requirement: Text-edit mode current and proposed text capture

Text-edit mode MUST capture the current text from a selected element and MUST allow the user to save proposed replacement text through the double-click or edit-popup flow.

#### Scenario: Save text-edit record

- GIVEN annotate mode is active on an element containing text
- WHEN the user opens text edit by double-clicking the element or using the popup edit action, changes the proposed text, and saves
- THEN the system MUST add a `text-edit` record
- AND the record MUST include the original text and the proposed text.

### Requirement: Picker keyboard layering

The picker MUST implement keyboard behavior for Escape cancellation, Ctrl/Cmd+Z undo, and Ctrl/Cmd+Enter save.

#### Scenario: Escape cancels the topmost picker layer first

- GIVEN multiple picker layers could be active, such as text edit, annotation popup, swap popup, swap step, or transform selection
- WHEN the user presses Escape
- THEN the system MUST cancel only the topmost active layer according to that order
- AND pressing Escape with no active picker layer MUST turn the overlay off.

#### Scenario: Undo and save shortcuts

- GIVEN the overlay is active
- WHEN the user presses Ctrl/Cmd+Z outside editable text input
- THEN the system MUST undo the latest annotation-list mutation and prevent the host page undo action
- WHEN the user presses Ctrl/Cmd+Enter inside an open save form
- THEN the system MUST save that form if it is valid.

### Requirement: Capped annotation history

The undo history stack MUST retain at most 20 prior annotation-list states.

#### Scenario: History cap after many mutations

- GIVEN the overlay is active
- WHEN the user performs more than 20 annotation-list mutations
- THEN the history stack MUST discard the oldest entries
- AND only the latest 20 undo states MUST remain available.
