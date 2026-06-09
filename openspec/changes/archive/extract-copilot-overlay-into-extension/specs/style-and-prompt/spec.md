# Delta for Style and Prompt

## ADDED Requirements

### Requirement: Element information extraction

The system MUST provide a `getElInfo` equivalent that captures tag, classes, text, label, parent tag, Tailwind-style class hints, raw styles, and viewport rectangle for eligible host-page elements.

#### Scenario: Extract element metadata

- GIVEN an eligible host-page element with classes, visible text, an accessible label or title, computed styles, and a parent element
- WHEN the picker records element information
- THEN the result MUST include `tag`, `classes`, `text`, `label`, `parentTag`, `twClasses`, `rawStyles`, and `rect`
- AND `rect` dimensions MUST be rounded viewport measurements.

### Requirement: Partial Tailwind style mapping parity

The style mapper MUST mirror the current partial `TW_COLORS`, `TW_SPACING`, `TW_FONT_SIZE`, `TW_FONT_WEIGHT`, and `TW_BORDER_RADIUS` dictionaries from the reference behavior without expanding them in v1.

#### Scenario: Mapped and unmapped computed styles

- GIVEN an element has computed styles where some values exist in the v1 dictionaries and some do not
- WHEN style mapping runs
- THEN mapped values MUST appear in `twClasses`
- AND unmapped values MUST be omitted from `twClasses`
- AND applicable unmapped raw values MUST remain available in `rawStyles`.

### Requirement: Byte-stable Spanish prompt format

For equivalent annotation data, the prompt builder MUST emit the current byte-stable Spanish prompt format, including headers, divider lines, type-specific sections, optional screenshot markers, and footer instructions.

#### Scenario: Build prompt for mixed annotation types

- GIVEN equivalent annotation data containing annotate, transform, swap, and text-edit records
- WHEN the prompt builder generates prompt text
- THEN the output MUST include `== VIBECOPILOT PROMPT ==`
- AND it MUST include Spanish section headers and 44-character divider lines
- AND each record MUST appear as `### CAMBIO N — <tipo>` in annotation order
- AND type-specific details MUST match the reference format for that record type
- AND the output MUST end with `== FIN VIBECOPILOT PROMPT ==`.

### Requirement: Spanish date locale with deterministic fixture support

The live prompt date MUST use the `es-ES` locale, and verification fixtures MAY override or filter the date to keep byte-stability checks deterministic.

#### Scenario: Date handling in fixture verification

- GIVEN a frozen prompt fixture is used for byte-stability verification
- WHEN the generated prompt is compared with the fixture
- THEN the comparison MAY provide a fixed date or filter the `Fecha:` line
- AND all non-date prompt bytes MUST match exactly.

### Requirement: Prompt screenshot filenames match downloads

Any PNG filename referenced in the prompt MUST exactly match the filename requested for download for the corresponding annotation asset.

#### Scenario: Screenshot marker and download name parity

- GIVEN annotations with annotate, text-edit, and transform screenshots
- WHEN `copyPrompt` prepares prompt text and PNG downloads
- THEN prompt markers MUST use `vibecopilot-NN-annotate.png`, `vibecopilot-NN-text-edit.png`, `vibecopilot-NN-before.png`, and `vibecopilot-NN-after.png` as applicable
- AND each referenced filename MUST exactly match a download request filename.
