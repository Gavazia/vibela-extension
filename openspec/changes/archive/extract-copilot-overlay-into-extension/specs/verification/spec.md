# Delta for Verification

## ADDED Requirements

### Requirement: Required manual fixture pages

The change MUST include fixture pages named `fixtures/light.html`, `fixtures/dark.html`, and `fixtures/nested.html` for manual and byte-stability verification.

#### Scenario: Fixture files are present

- GIVEN the implementation is ready for verification
- WHEN the repository fixtures directory is inspected
- THEN `fixtures/light.html`, `fixtures/dark.html`, and `fixtures/nested.html` MUST exist
- AND each fixture SHOULD exercise a distinct page style or DOM complexity relevant to the overlay.

### Requirement: Manual smoke checklist before completion

A manual smoke checklist MUST exist and MUST be executed before the change is claimed complete.

#### Scenario: Smoke checklist covers core workflow

- GIVEN implementation work for the change is complete
- WHEN verification is performed
- THEN the checklist MUST cover Chrome unpacked loading, toolbar toggle, restricted-scheme behavior, picker modes, keyboard behavior, prompt copy, PNG downloads, and storage inspection.

### Requirement: Byte-stability with frozen prompt fixtures

The verification procedure MUST compare generated prompt output against frozen prompt fixtures and MUST identify any non-date byte differences as failures.

#### Scenario: Frozen prompt diff

- GIVEN a fixture page and its frozen expected prompt output
- WHEN the tester replays the documented annotation data and generates a prompt
- THEN the generated prompt MUST be diffed against the frozen fixture
- AND differences outside an explicitly overridden or filtered date value MUST fail verification.

### Requirement: Chrome unpacked build verification

The change MUST verify that the Chrome MV3 unpacked build loads and runs in Chrome before completion.

#### Scenario: Load built extension

- GIVEN the WXT build command has completed
- WHEN the generated Chrome MV3 output directory is loaded unpacked in Chrome
- THEN the extension MUST install without manifest errors
- AND the toolbar action MUST be usable on an allowed fixture page.

### Requirement: Review workload and chained PR boundary compliance

Implementation planning and delivery MUST respect the configured 400 changed-line review budget, or MUST explicitly ask the user for a delivery decision before exceeding it.

#### Scenario: Forecast exceeds review budget

- GIVEN an implementation task or chained PR is forecast to exceed 400 changed lines of reviewable work
- WHEN work is planned or before apply begins
- THEN the implementer MUST split the work into chained reviewable units or ask the user for approval to exceed the budget
- AND the decision MUST be documented before implementation continues.
