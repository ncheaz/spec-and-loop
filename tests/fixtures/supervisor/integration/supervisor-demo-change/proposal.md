## Why

The supervisor integration fixture exercises the real `ralph-run` self-heal path with a mocked `opencode` binary.

## What Changes

- Add a minimal change that the mocked implementer can block on and the mocked supervisor can rewrite.

## Capabilities

### New Capabilities
- `supervisor-integration-fixture`: Strict-valid OpenSpec change used by the mocked supervisor integration tests.

## Impact

- Test-only fixture for `tests/integration/supervisor-*.bats`.
