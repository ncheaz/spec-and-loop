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

### Optional Tools (for integration tests)

- **openspec** CLI
  ```bash
  npm install -g @fission-ai/openspec
  ```

- **ralph** CLI
  ```bash
  npm install -g @th0rgal/ralph-wiggum
  ```

- **opencode** CLI
  ```bash
  npm install -g opencode-ai
  ```

## Running Tests

### Run All Tests

Execute the complete test suite:

```bash
npm test
```

This runs both unit tests and integration tests.

### Run Unit Tests Only

Run only the unit tests (faster):

```bash
npm run test:unit
```

This includes:
- Bash unit tests (tests/unit/bash/*.bats)
- JavaScript unit tests (tests/unit/javascript/*.test.js)

### Run JavaScript Tests Only

Run only the Jest tests for JavaScript:

```bash
npm run test:js
```

### Run Integration Tests Only

Run only the integration tests (slower, requires all dependencies):

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
│   ├── changes/        # Sample OpenSpec changes
│   └── git-repos/      # Test git repositories
└── helpers/
    └── test-common.sh  # Reusable test helper functions
```

## Test Categories

### Unit Tests

Unit tests test individual functions in isolation:

- **Bash unit tests** (tests/unit/bash/*.bats)
  - File utilities (detect_os, get_file_mtime, get_file_md5, get_realpath)
  - Task management (parse_tasks, get_current_task_context)
  - Validation functions (validate_git_repository, validate_dependencies)
  - PRD generation (read_openspec_artifacts, generate_prd)
  - Ralph integration (sync_tasks_to_ralph, restore_ralph_state_from_tasks)
  - Error handling (cleanup, handle_error, format_error_entry)

- **JavaScript unit tests** (tests/unit/javascript/*.test.js)
  - bin/ralph-run wrapper
  - Argument passing
  - Error handling
  - stdio inheritance
  - setup.js post-install script

### Integration Tests

Integration tests validate the complete ralph-run workflow:

- Full workflow execution (simple and complex changes)
- Auto-detect functionality
- Max-iterations flag
- Verbose mode
- Error handling scenarios
- Cross-platform validation (Linux and macOS)

## Cross-Platform Testing

The test suite is designed to run on both Linux and macOS. Some tests are platform-specific and will be skipped on other platforms.

### Platform-Specific Tests

- **Symlink tests** (`test-symlink-linux.bats`, `test-symlink-macos.bats`)
  - Test symlink creation and behavior on each platform
  - Automatically skipped on non-matching platforms

- **File stat tests** (`test-file-stat-operations.bats`)
  - Test `stat` command variations between Linux (GNU) and macOS (BSD)
  - Tests are platform-specific

- **MD5 hashing tests** (`test-md5-hashing.bats`)
  - Test `md5sum` (Linux) vs `md5 -q` (macOS)
  - Tests are platform-specific

- **Path resolution tests** (`test-path-resolution.bats`)
  - Test `realpath` and fallback mechanisms
  - Tests are platform-specific

## Test Fixtures

Test fixtures provide reusable test data for integration tests:

### Sample OpenSpec Changes

- **simple-feature**: Minimal valid change (proposal, design, tasks, 1 spec)
- **complex-feature**: Multi-spec change (proposal, design, tasks, 3 specs)
- **incomplete-change**: Missing artifacts (for error testing)

### Test Git Repositories

- **git-repo**: Initialized git repository with .git directory
- **invalid-git**: Non-git directory (for validation testing)

### Adding New Fixtures

To add a new test fixture:

1. Create a directory in `tests/fixtures/`
2. Add the necessary OpenSpec artifacts (proposal.md, design.md, tasks.md, specs/)
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

Critical functions in `scripts/ralph-run.sh` must have **>80% test coverage**:

- detect_os()
- get_file_mtime()
- get_file_md5()
- get_realpath()
- parse_tasks()
- get_current_task_context()
- validate_git_repository()
- validate_dependencies()
- validate_openspec_artifacts()
- generate_prd()
- sync_tasks_to_ralph()
- restore_ralph_state_from_tasks()
- cleanup()
- handle_error()

To check coverage:
```bash
npm run test:coverage
```

Then open `coverage/index.html` in your browser to view the detailed report.

## CI/CD

Tests are automatically run on GitHub Actions for:
- Push to `main` or `develop` branches
- Pull requests to `main` or `develop` branches
- Manual workflow triggers

The CI pipeline runs on:
- Ubuntu Linux (latest)
- macOS (latest)
- Node.js versions: 24

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

### Tests Failing with "command not found: shellcheck"

Shellcheck is not installed. Install it:
```bash
# Ubuntu/Debian
sudo apt-get install shellcheck

# macOS
brew install shellcheck
```

### Integration Tests Failing

Integration tests may fail if:
1. openspec, ralph, or opencode CLIs are not installed globally
   ```bash
   npm install -g openspec ralph opencode
   ```
2. Git is not initialized in the test directory (handled by test fixtures)
3. Required dependencies (jq) are missing
   ```bash
   # Ubuntu/Debian
   sudo apt-get install jq
   
   # macOS
   brew install jq
   ```

### Coverage Below Threshold

If coverage is below 80% for critical functions:
1. Review the coverage report: `open coverage/index.html`
2. Identify uncovered lines and branches
3. Add tests to cover the missing code paths
4. Re-run tests to verify improvement

### Platform-Specific Test Failures

Some tests are platform-specific and will be skipped on non-matching platforms. This is expected behavior.

If a platform-specific test is failing on the correct platform:
1. Ensure you're running on the expected platform: `uname -s`
2. Check for platform-specific command differences (GNU vs BSD tools)
3. Verify the test logic is correct for that platform

## Best Practices

1. **Run tests before committing**: Always run the full test suite before pushing
2. **Write tests first**: Follow test-driven development when possible
3. **Keep tests isolated**: Each test should be independent
4. **Use descriptive names**: Test names should clearly describe what they test
5. **Mock external dependencies**: Unit tests should not call external CLIs
6. **Use fixtures**: Reuse test fixtures instead of creating test data inline
7. **Clean up after tests**: Always use teardown functions to clean up test directories

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
