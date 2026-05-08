# Testing Guide

This document provides instructions for running tests locally for the spec-and-loop package.

## Prerequisites

Before running tests, ensure you have the following installed:

### Required Tools

1. **Node.js** (>= 24.0.0)
   ```bash
   node --version
   ```

2. **Bats** (Bash Automated Testing System)
   ```bash
   # Ubuntu/Debian
   sudo apt-get install bats-core
   
   # macOS
   brew install bats-core
   ```

3. **Shellcheck** (Bash linting)
   ```bash
   # Ubuntu/Debian
   sudo apt-get install shellcheck
   
   # macOS
   brew install shellcheck
   ```

4. **Jest** (JavaScript testing - installed via npm)
   ```bash
   npm install
   ```

5. **jq** (JSON processor)
   ```bash
   # Ubuntu/Debian
   sudo apt-get install jq
   
   # macOS
   brew install jq
   ```

### Optional Tools

- **openspec** CLI (used for workflow demos, not required to run tests)
  ```bash
  npm install -g @fission-ai/openspec
  ```

- **opencode** CLI (used for workflow demos, not required to run tests)
  ```bash
  npm install -g opencode-ai
  ```

> **Note:** The integration tests use mock implementations of `mini-ralph-cli.js` and
> inject them via `MINI_RALPH_CLI_OVERRIDE`. No external `ralph` CLI and no live
> `opencode` invocations are required to run the test suite.

## Running Tests

### Run All Tests

Execute the complete test suite:

```bash
npm test
```

This runs unit tests (bash + JavaScript) followed by integration tests.

### Run Unit Tests Only

Run only the unit tests (faster):

```bash
npm run test:unit
```

This includes:
- Bash unit tests (`tests/unit/bash/*.bats`)
- JavaScript unit tests (`tests/unit/javascript/*.test.js`)

### Run JavaScript Tests Only

Run only the Jest tests for JavaScript:

```bash
npm run test:js
```

### Run Integration Tests Only

Run only the integration tests (slower, ~5 minutes):

```bash
npm run test:integration
```

### Run Tests in Watch Mode

Run JavaScript tests in watch mode (automatically re-runs on file changes):

```bash
npm run test:watch
```

### Run Tests with Coverage

Generate coverage reports:

```bash
npm run test:coverage
```

Coverage reports are generated in the `coverage/` directory:
- `coverage/index.html` - Interactive HTML report
- `coverage/coverage.json` - JSON format
- `coverage/lcov-report/` - LCov format

## Linting

Run shellcheck on all bash scripts:

```bash
npm run lint
```

This checks all files in `scripts/*.sh` for common bash errors and best practices.

## Test Organization

```
tests/
├── unit/
│   ├── bash/           # Bash function unit tests (*.bats)
│   └── javascript/     # JavaScript unit tests (*.test.js)
├── integration/        # Full workflow integration tests (*.bats)
├── fixtures/           # Reusable test data
│   ├── simple-feature/       # Minimal valid OpenSpec change
│   ├── complex-feature/      # Multi-spec OpenSpec change
│   └── incomplete-change/    # Missing artifacts (for error testing)
└── helpers/
    ├── test-common.bash       # Reusable Bats helper functions
    └── test-functions.sh      # Additional helper utilities
```

## Test Categories

### Unit Tests — Bash

Unit tests test individual functions from `scripts/ralph-run.sh` in isolation:

- **`test-detect-os.bats`** — `detect_os()` on macOS and Linux
- **`test-get-file-mtime.bats`** — `get_file_mtime()` with `stat -f %m` / `stat -c %Y`
- **`test-get-file-md5.bats`** — `get_file_md5()` with `md5 -q` / `md5sum`
- **`test-get-realpath.bats`** — `get_realpath()` across platforms and symlinks
- **`test-parse-tasks.bats`** — `parse_tasks()` and task checkbox parsing
- **`test-get-current-task-context.bats`** — `get_current_task_context()` context building
- **`test-validate-git-repository.bats`** — `validate_git_repository()` checks
- **`test-validate-dependencies.bats`** — `validate_dependencies()` checks
- **`test-read-openspec-artifacts.bats`** — `read_openspec_artifacts()` and PRD generation
- **`test-execute-ralph-loop.bats`** — `execute_ralph_loop()` invocation behavior
- **`test-cleanup.bats`** — `cleanup()` and `handle_error()` functions
- **`test-signal-handling.bats`** — Signal trap behavior (SIGINT, SIGTERM)
- **`test-symlink-architecture.bats`** — `.ralph/ralph-tasks.md` symlink creation
- **`test-task-state-synchronization.bats`** — Task completion state tracking

### Unit Tests — JavaScript

JavaScript unit tests cover the mini Ralph module and wrapper:

- **`mini-ralph-runner.test.js`** — Internal loop execution and iteration behavior
- **`mini-ralph-state.test.js`** — State and history persistence under `.ralph/`
- **`mini-ralph-status.test.js`** — Status dashboard rendering and struggle indicators
- **`mini-ralph-context.test.js`** — `--add-context` / `--clear-context` operations
- **`mini-ralph-prompt.test.js`** — Prompt template loading and rendering
- **`mini-ralph-supervisor.test.js`** — Supervisor prompt parsing, rule loading, prompt rendering, and patch application helpers
- **`mini-ralph-supervisor-budget.test.js`** — Supervisor try budgets, oscillation detection, and downstream patch outcomes
- **`mini-ralph-supervisor-cli.test.js`** — `--*self-heal*` CLI flags, env-var precedence, and verbose implication behavior
- **`mini-ralph-supervisor-compliance.test.js`** — Structural validation of patched task bodies against Ralph authoring rules
- **`mini-ralph-supervisor-hints.test.js`** — Investigation-hint normalization, dropping, persistence, and prompt injection
- **`mini-ralph-supervisor-logaccess.test.js`** — Run-log path resolution and log-read audit detection
- **`mini-ralph-supervisor-token-budget.test.js`** — UXEP fixture byte-budget regression coverage for supervisor prompts
- **`ralph-run-wrapper.test.js`** — `bin/ralph-run` wrapper behavior
- **`argument-passing.test.js`** — Flag forwarding to the mini Ralph engine
- **`error-handling.test.js`** — Error propagation and exit codes
- **`stdio-inheritance.test.js`** — stdin/stdout/stderr inheritance
- **`setup-script.test.js`** — `scripts/setup.js` post-install script
- **`test-bin-wrapper.test.js`** — `bin/ralph-run` binary path resolution

### Integration Tests

Integration tests validate the complete `ralph-run` workflow using mock
implementations of `mini-ralph-cli.js` injected via `MINI_RALPH_CLI_OVERRIDE`:

- **`test-simple-workflow.bats`** — Full workflow with a minimal single-spec change
- **`test-complex-workflow.bats`** — Multi-spec change with multiple task files
- **`test-auto-detect.bats`** — Auto-detection of the most recent change
- **`test-max-iterations.bats`** — `--max-iterations` flag behavior
- **`test-verbose.bats`** — `--verbose` flag and debug output
- **`test-invalid-git.bats`** — Validation failure when not in a git repo
- **`test-malformed-artifacts.bats`** — Validation failure for missing OpenSpec artifacts
- **`test-missing-opencode.bats`** — Validation failure when opencode is not found
- **`test-missing-ralph.bats`** — Dependency validation behavior
- **`test-interrupted-execution.bats`** — SIGINT/SIGTERM cleanup and restart behavior
- **`test-symlink-macos.bats`** — `.ralph/ralph-tasks.md` symlink on macOS
- **`test-symlink-linux.bats`** — `.ralph/ralph-tasks.md` symlink on Linux
- **`test-path-resolution.bats`** — `get_realpath()` with relative paths, symlinks, and `..`
- **`test-file-stat-operations.bats`** — `get_file_mtime()` on macOS and Linux
- **`test-md5-hashing.bats`** — `get_file_md5()` on macOS and Linux
- **`supervisor-loop.bats`** — Supervisor happy-path recovery and crash-recovery wiring with the mocked OpenCode shim
- **`supervisor-budget-exhaustion.bats`** — Supervisor budget exhaustion writes `### Supervisor attempts` and exits blocked
- **`supervisor-investigation-hints.bats`** — Accepted supervisor hints round-trip into the next implementer prompt
- **`supervisor-log-tail.bats`** — Supervisor log-tail audit fields and `RALPH_SELF_HEAL_LOG_ACCESS=0` opt-out behavior

## Cross-Platform Testing

The test suite runs on both Linux and macOS. Platform-specific tests use `detect_os`
to skip automatically on non-matching platforms.

### Platform-Specific Tests

- **Symlink tests** (`test-symlink-linux.bats`, `test-symlink-macos.bats`)
  - Test symlink creation using platform-specific `ln` behavior
  - Automatically skipped on non-matching platforms

- **File stat tests** (`test-file-stat-operations.bats`)
  - Tests `stat -c %Y` (Linux GNU) and `stat -f %m` (macOS BSD)
  - Each test is skipped on the non-target platform

- **MD5 hashing tests** (`test-md5-hashing.bats`)
  - Tests `md5sum` (Linux) and `md5 -q` (macOS)
  - Each test is skipped on the non-target platform

- **Path resolution tests** (`test-path-resolution.bats`)
  - Tests `realpath` behavior including symlink resolution
  - Uses absolute symlink targets to ensure cross-platform correctness

## How Integration Tests Mock the Loop Engine

Integration tests set `MINI_RALPH_CLI_OVERRIDE` to point to a mock
`mini-ralph-cli.js` script that exits immediately. This prevents tests from
invoking the real mini Ralph engine or a live `opencode` session while still
exercising all of `ralph-run.sh`'s validation, PRD generation, symlink
creation, and argument handling code paths.

```bash
# From test setup:
export MINI_RALPH_CLI_OVERRIDE="$MOCK_BIN_DIR/mini-ralph-cli.js"

# Teardown:
unset MINI_RALPH_CLI_OVERRIDE
```

Tests that need to exercise interruption behavior use a mock that sleeps
indefinitely until a signal is received.

## Test Fixtures

Test fixtures provide reusable OpenSpec change structures for integration tests:

- **`simple-feature`**: Minimal valid change — proposal, design, tasks, 1 spec
- **`complex-feature`**: Multi-spec change — proposal, design, tasks, 3 specs
- **`incomplete-change`**: Missing artifacts (for error path testing)

### Adding New Fixtures

To add a new test fixture:

1. Create a directory in `tests/fixtures/`
2. Add the required OpenSpec artifacts: `proposal.md`, `design.md`, `tasks.md`, `specs/`
3. Reference the fixture in your integration tests

Example:
```bash
FIXTURES_DIR="$PROJECT_ROOT/tests/fixtures/my-new-feature"
cp -r "$FIXTURES_DIR" openspec/changes/
```

## Writing New Tests

### Bash Tests (Bats)

Create a new test file in `tests/unit/bash/` or `tests/integration/`:

```bash
#!/usr/bin/env bats

load '../helpers/test-common'

setup() {
  PROJECT_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"
  local test_dir
  test_dir=$(setup_test_dir)
  export TEST_DIR="$test_dir"
  cd "$test_dir" || return 1
}

teardown() {
  cd / || true
  cleanup_test_dir
}

@test "description of test case" {
  # Arrange - set up test data
  create_git_repo
  
  # Act - execute the code being tested
  source "$PROJECT_ROOT/scripts/ralph-run.sh"
  
  # Assert - verify the result
  [ "$result" = "expected" ]
}
```

### JavaScript Tests (Jest)

Create a new test file in `tests/unit/javascript/`:

```javascript
describe('Feature being tested', () => {
  it('should do something', () => {
    // Arrange
    const input = 'test input';
    
    // Act
    const result = functionToTest(input);
    
    // Assert
    expect(result).toBe('expected output');
  });
});
```

## Coverage Requirements

Critical functions in `scripts/ralph-run.sh` and `lib/mini-ralph/` must maintain
**>80% test coverage**. Supervisor work has a stricter expectation: `lib/mini-ralph/supervisor.js` should stay at **>= 85%** coverage while preserving **>= 80%** global coverage for the repository.

**Bash functions** (`scripts/ralph-run.sh`):
- `detect_os()`, `get_file_mtime()`, `get_file_md5()`, `get_realpath()`
- `parse_tasks()`, `get_current_task_context()`
- `validate_git_repository()`, `validate_dependencies()`, `validate_openspec_artifacts()`
- `generate_prd()`, `sync_tasks_to_ralph()`, `restore_ralph_state_from_tasks()`
- `cleanup()`, `handle_error()`

**JavaScript modules** (`lib/mini-ralph/`):
- `runner.js` — Loop execution and iteration control
- `state.js` — State and history persistence
- `status.js` — Status dashboard rendering
- `context.js` — Context injection management
- `prompt.js` — Prompt template loading and rendering
- `tasks.js` — Task file synchronization
- `supervisor.js` — Supervisor orchestration, patch validation, hint normalization, and prompt token-economy helpers

To check coverage:
```bash
npm run test:coverage
open coverage/index.html
```

## CI/CD

Tests are automatically run on GitHub Actions for:
- Push to `main` or `develop` branches
- Pull requests to `main` or `develop` branches
- Manual workflow triggers

The CI pipeline runs on:
- Ubuntu Linux (latest)
- macOS (latest)
- Node.js version: 24

View test status:
- Check the GitHub Actions tab in the repository
- Look for the green checkmark (✓) on pull requests

## Troubleshooting

### Tests Failing with "command not found: bats"

Bats is not installed. Install it:
```bash
# Ubuntu/Debian
sudo apt-get install bats-core

# macOS
brew install bats-core
```

Note: `bats` is also bundled as a dev dependency — you can use `npx bats` as an
alternative if the system-installed version is not available.

### Tests Failing with "command not found: shellcheck"

Shellcheck is not installed. Install it:
```bash
# Ubuntu/Debian
sudo apt-get install shellcheck

# macOS
brew install shellcheck
```

### Integration Tests Failing

Integration tests are self-contained and use mocks for the loop engine. If they fail:

1. Check that `MINI_RALPH_CLI_OVERRIDE` is not set in your environment before running tests
2. Verify `jq` is installed:
   ```bash
   jq --version
   ```
3. Verify git is available:
   ```bash
   git --version
   ```

### Coverage Below Threshold

If coverage is below 80% for critical functions:
1. Review the coverage report: `open coverage/index.html`
2. Identify uncovered lines and branches
3. Add tests to cover the missing code paths
4. Re-run tests to verify improvement

### Platform-Specific Test Failures

Some tests are platform-specific and will be skipped on non-matching platforms.
This is expected behavior.

If a platform-specific test is failing on the correct platform:
1. Confirm the OS: `uname -s`
2. Check for platform-specific command differences (GNU vs BSD tools)
3. Verify the test logic is correct for that platform

## Best Practices

1. **Run tests before committing**: Always run the full test suite before pushing
2. **Write tests first**: Follow test-driven development when possible
3. **Keep tests isolated**: Each test should be independent
4. **Use descriptive names**: Test names should clearly describe what they test
5. **Mock external dependencies**: Unit and integration tests must not call live CLIs
6. **Use fixtures**: Reuse test fixtures instead of creating test data inline
7. **Clean up after tests**: Always use teardown functions to clean up test directories
8. **Unset MINI_RALPH_CLI_OVERRIDE in teardown**: Every integration test that sets
   this override must unset it in its `teardown()` function

## Contributing

When adding new features or fixing bugs:
1. Add tests for the new functionality
2. Ensure all existing tests pass
3. Maintain coverage above 80% for critical functions
4. Run linting: `npm run lint`
5. Document any new test fixtures or helper functions

## Further Reading

- [Bats Documentation](https://bats-core.readthedocs.io/)
- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Shellcheck Documentation](https://www.shellcheck.net/)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
