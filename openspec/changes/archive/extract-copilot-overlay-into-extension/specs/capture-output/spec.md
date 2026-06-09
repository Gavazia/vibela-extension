# Delta for Capture Output

## ADDED Requirements

### Requirement: Background visible-tab capture

The background service worker MUST handle visible-tab capture requests and return a PNG data URL plus viewport metadata for the active tab.

#### Scenario: Capture current viewport

- GIVEN the overlay requests a screenshot for an allowed active tab
- WHEN the background service worker handles the capture request
- THEN it MUST call the browser visible-tab capture capability for that tab
- AND it MUST return an image/png data URL with viewport width, height, DPR, and capture timestamp metadata.

### Requirement: DPR-aware content cropper

The content script cropper MUST crop the selected element or area from the visible viewport capture using DOMRect coordinates, device pixel ratio, and viewport clipping constraints.

#### Scenario: Crop selected element inside viewport

- GIVEN a selected element is fully visible in the viewport
- WHEN the content cropper receives the viewport PNG and the element DOMRect
- THEN it MUST produce a PNG data URL cropped to that element area
- AND the crop MUST account for the current device pixel ratio.

#### Scenario: Element outside visible viewport

- GIVEN the selected element rectangle is fully outside the visible viewport
- WHEN the content cropper attempts to crop it
- THEN the cropper MUST return a recoverable failure
- AND the annotation workflow MUST continue without a screenshot.

### Requirement: Screenshot failure graceful degradation

Screenshot capture or crop failures MUST NOT block prompt copying or annotation saving.

#### Scenario: Save without screenshot after capture failure

- GIVEN a user saves an annotation while screenshot capture fails
- WHEN the annotation is added to the list
- THEN the record MUST be saved without an image field
- AND the prompt MUST omit the missing image marker
- AND the user MUST NOT lose the annotation text or metadata.

### Requirement: User-gesture prompt copy and PNG downloads

`copyPrompt` MUST run from a user gesture, write prompt text to the clipboard, and request PNG downloads through `chrome.downloads` using stable filenames.

#### Scenario: Copy prompt and download assets

- GIVEN the annotation list contains records with image data
- WHEN the user clicks `Copiar Prompt`
- THEN the extension MUST write the prompt text to the clipboard within the user gesture flow
- AND it MUST request downloads through the background service worker using `chrome.downloads`
- AND filenames MUST use the stable VibeCopilot naming convention.

### Requirement: Viewport-only capture in v1

The v1 capture pipeline MUST NOT depend on `html2canvas`; clipped or off-screen content SHALL be documented as viewport-only clipping behavior.

#### Scenario: Clipped element limitation

- GIVEN an element extends beyond the current visible viewport
- WHEN the user attempts to capture it in v1
- THEN the extension MUST use visible-viewport clipping only
- AND it MUST NOT invoke `html2canvas`
- AND the limitation SHOULD be documented or surfaced to the user.
