## Why

The complex-feature fixture is needed for testing ralph-run's ability to handle more sophisticated OpenSpec changes. It provides a realistic change with multiple specifications, more tasks, and varied task states to thoroughly test the integration workflow.

While the simple-feature fixture validates basic functionality, the complex-feature fixture ensures ralph-run can handle real-world scenarios with:
- Multiple spec files requiring aggregation
- Complex task hierarchies with nested sections
- Mixed task states across different phases
- Cross-references between artifacts

## What Changes

- Add complex-feature fixture directory with comprehensive OpenSpec change structure
- Include proposal.md with multi-component feature description
- Include design.md with detailed technical architecture
- Include tasks.md with multiple sections and varied task states
- Include three spec files covering different aspects of the feature

## Capabilities

### New Capabilities
- `complex-feature-fixture`: Multi-spec test fixture for comprehensive integration tests

## Impact

- Adds fixture directory: `tests/fixtures/complex-feature/`
- Provides test data for multi-spec scenarios
- Does not affect runtime behavior or installation
- Test-only addition for quality assurance
