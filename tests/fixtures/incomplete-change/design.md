## Why

The incomplete-change fixture is needed for testing ralph-run's error handling and validation. It provides an OpenSpec change that is intentionally missing required artifacts, allowing tests to verify that:

- Missing artifacts are properly detected
- Appropriate error messages are displayed
- The script exits with correct error codes
- Validation logic works as expected

Without a fixture with missing artifacts, integration tests would need to create invalid changes dynamically, which is more complex and less maintainable.

## What Changes

- Add incomplete-change fixture directory with partial OpenSpec change structure
- Intentionally omit proposal.md (or tasks.md)
- Include design.md (present but incomplete without proposal)
- Include tasks.md (present but validation should fail without proposal)
- Include spec files (present but validation should fail without proposal)

## Capabilities

### New Capabilities
- `incomplete-change-fixture`: Test fixture for error handling and validation

## Impact

- Adds fixture directory: `tests/fixtures/incomplete-change/`
- Provides test data for missing artifact scenarios
- Does not affect runtime behavior or installation
- Test-only addition for quality assurance
