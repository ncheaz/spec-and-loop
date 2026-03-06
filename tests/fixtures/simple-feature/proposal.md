## Why

The simple-feature fixture is needed for integration testing of the ralph-run script. It provides a minimal but complete OpenSpec change structure that can be used to validate the full workflow from initialization through Ralph loop execution.

Without a test fixture, integration tests would need to create OpenSpec changes dynamically, which adds complexity and potential for errors. Having a pre-configured fixture ensures consistent, reliable testing.

## What Changes

- Add simple-feature fixture directory with complete OpenSpec change structure
- Include proposal.md with clear purpose and requirements
- Include design.md with basic technical approach
- Include tasks.md with a few representative tasks
- Include single spec file with testable requirements

## Capabilities

### New Capabilities
- `simple-feature-fixture`: Minimal test fixture for integration tests

## Impact

- Adds fixture directory: `tests/fixtures/simple-feature/`
- Provides reusable test data for integration tests
- Does not affect runtime behavior or installation
- Test-only addition for quality assurance
