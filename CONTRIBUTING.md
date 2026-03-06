# Contributing to Spec and Loop

Thank you for your interest in contributing to spec-and-loop! This document provides guidelines and instructions for contributing to the project.

## Code of Conduct

Please be respectful and constructive in all interactions. We aim to maintain a welcoming and inclusive community.

## Getting Started

### Prerequisites

Before contributing, ensure you have:
- Node.js >= 24.0.0
- Git
- openspec CLI: `npm install -g @fission-ai/openspec`
- ralph CLI: `npm install -g @th0rgal/ralph-wiggum`
- opencode CLI: `npm install -g opencode-ai`
- jq: `sudo apt-get install jq` or `brew install jq`

### Setting Up Development Environment

1. Fork the repository
2. Clone your fork:
   ```bash
   git clone https://github.com/your-username/spec-and-loop.git
   cd spec-and-loop
   ```

3. Install dependencies:
   ```bash
   npm install
   ```

4. Verify tests pass:
   ```bash
   npm test
   ```

## Development Workflow

### 1. Create a Branch

Create a new branch for your contribution:
```bash
git checkout -b feature/your-feature-name
# or
git checkout -b fix/your-fix-name
```

### 2. Make Changes

- Follow the existing code style and conventions
- Write clear, descriptive commit messages
- Include tests for new functionality
- Ensure all tests pass

### 3. Run Tests

Before pushing:
```bash
# Run all tests
npm test

# Run linting
npm run lint

# Run with coverage
npm run test:coverage
```

### 4. Commit Changes

Use clear, descriptive commit messages:
```bash
git add .
git commit -m "feat: add new feature for X"
# or
git commit -m "fix: resolve issue with Y"
```

### 5. Push and Create Pull Request

```bash
git push origin feature/your-feature-name
```

Then create a pull request on GitHub with:
- Clear description of changes
- Reference related issues
- Screenshots if applicable (for UI changes)

## Testing Guidelines

### Test Requirements

All contributions must include tests:
- **New features**: Include both unit and integration tests
- **Bug fixes**: Include tests that verify the fix
- **Critical functions**: Must have >80% test coverage

### Test Organization

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

### Naming Conventions

#### Test Files

- **Bats tests**: `test-<feature-name>.bats`
  - Example: `test-symlink-linux.bats`, `test-file-stat-operations.bats`

- **Jest tests**: `<feature-name>.test.js`
  - Example: `bin-wrapper.test.js`, `setup.test.js`

#### Test Functions

- **Bats tests**: Use descriptive names with @test decorator
  ```bash
  @test "symlink on Linux: creates symlink from .ralph/ralph-tasks.md to tasks.md" {
    # test implementation
  }
  ```

- **Jest tests**: Use `describe` and `it` with clear descriptions
  ```javascript
  describe('bin-wrapper', () => {
    it('should spawn bash script correctly', () => {
      // test implementation
    });
  });
  ```

### Coverage Requirements

Critical functions in `scripts/ralph-run.sh` must have >80% test coverage:

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
open coverage/index.html
```

### Writing Good Tests

#### Unit Tests

- Test one function at a time
- Use descriptive test names
- Mock external dependencies
- Cover happy path and edge cases
- Test error conditions

Example (Bats):
```bash
@test "get_file_mtime: returns valid timestamp on Linux" {
  setup_linux_environment
  
  # Create test file
  echo "test content" > /tmp/test-file.txt
  
  # Source the script
  source "$SCRIPT_PATH"
  
  # Get mtime
  local mtime
  mtime=$(get_file_mtime /tmp/test-file.txt)
  
  # Assert
  [[ "$mtime" =~ ^[0-9]+$ ]]
  [ "$mtime" -gt 0 ]
  
  # Cleanup
  rm /tmp/test-file.txt
}
```

Example (Jest):
```javascript
describe('bin-wrapper', () => {
  it('should forward arguments to bash script', () => {
    const mockSpawn = jest.fn().mockReturnValue({
      on: jest.fn().mockImplementation((event, callback) => {
        if (event === 'close') callback(0);
      }),
      stdout: { pipe: jest.fn() },
      stderr: { pipe: jest.fn() }
    });
    
    require('child_process').spawn = mockSpawn;
    
    const wrapper = require('../../bin/ralph-run');
    wrapper(['--change', 'test', '--max-iterations', '1']);
    
    expect(mockSpawn).toHaveBeenCalledWith(
      'bash',
      [expect.stringContaining('ralph-run.sh'), '--change', 'test', '--max-iterations', '1'],
      expect.any(Object)
    );
  });
});
```

#### Integration Tests

- Test complete workflows
- Use real tools (not mocks)
- Include error scenarios
- Test cross-platform compatibility

Example (Bats):
```bash
@test "integration: full workflow with simple change" {
  create_git_repo
  
  mkdir -p openspec/changes
  cp -r "$FIXTURES_DIR/simple-feature" openspec/changes/
  
  run bash "$SCRIPT_PATH" --change simple-feature --max-iterations 1
  
  # Assert
  [ "$status" -eq 0 ]
  [ -f "openspec/changes/simple-feature/.ralph/ralph-tasks.md" ]
}
```

### Cross-Platform Testing

Tests must run on both Linux and macOS:

- Use platform-specific commands correctly (stat, md5sum/md5, etc.)
- Mark platform-specific tests with conditional skips
- Test both GNU and BSD tool variants
- Use POSIX-compliant commands when possible

Example:
```bash
@test "get_file_mtime: works on both Linux and macOS" {
  local os
  os=$(detect_os)
  
  if [[ "$os" != "Linux" ]]; then
    skip "Test is Linux-specific, running on $os"
  fi
  
  # Linux-specific test
  # ...
}
```

## Code Style Guidelines

### Bash Scripts

- Use 2-space indentation
- Quote all variables: `"$VAR"`
- Use `[[ ]]` for conditions
- Add function comments for complex logic
- Follow shellcheck recommendations

Example:
```bash
get_file_mtime() {
  local file_path="$1"
  
  if [[ ! -f "$file_path" ]]; then
    echo "Error: File not found: $file_path" >&2
    return 1
  fi
  
  local mtime
  mtime=$(stat -c %Y "$file_path" 2>/dev/null || stat -f %m "$file_path")
  
  echo "$mtime"
}
```

### JavaScript

- Use 2-space indentation
- Use ES6+ syntax
- Add JSDoc comments for exports
- Follow ESLint rules

Example:
```javascript
/**
 * Spawns the bash script with given arguments
 * @param {string[]} args - Command-line arguments to pass to bash
 */
function spawnRalphRun(args) {
  const scriptPath = path.join(__dirname, '..', 'scripts', 'ralph-run.sh');
  const child = spawn('bash', [scriptPath, ...args]);
  
  child.stdout.pipe(process.stdout);
  child.stderr.pipe(process.stderr);
  
  return child;
}
```

## Commit Message Conventions

Use conventional commits format:

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

### Examples

```
feat(bash): add support for custom error messages

Implement handle_error function to format error entries
with timestamps and stack traces.

Closes #123
```

```
fix(integration): resolve symlink creation on macOS

Use readlink instead of realpath for symlink detection
on macOS due to BSD tool differences.

Fixes #456
```

## Pull Request Guidelines

### PR Description

Include:
- Clear description of changes
- Motivation and context
- Related issues
- Testing done
- Screenshots (if applicable)
- Breaking changes (if any)

### PR Checklist

Before submitting:
- [ ] Tests pass locally
- [ ] Linting passes
- [ ] Coverage maintained (>80% for critical functions)
- [ ] Documentation updated
- [ ] Commit messages follow conventions
- [ ] PR description is complete

### Review Process

1. Automated checks (CI/CD) must pass
2. At least one maintainer review
3. All feedback addressed
4. PR approved and merged

## Reporting Issues

### Bug Reports

Include:
- Clear description of the bug
- Steps to reproduce
- Expected behavior
- Actual behavior
- Environment (OS, Node.js version)
- Logs/error messages

### Feature Requests

Include:
- Clear description of the feature
- Use case/motivation
- Proposed solution
- Alternatives considered

## Getting Help

- **Documentation**: [README.md](./README.md), [TESTING.md](./TESTING.md), [QUICKSTART.md](./QUICKSTART.md)
- **Issues**: [GitHub Issues](https://github.com/ncheaz/spec-and-loop/issues)
- **Discussions**: [GitHub Discussions](https://github.com/ncheaz/spec-and-loop/discussions)

## License

By contributing, you agree that your contributions will be licensed under the GPL-3.0 license.

## Acknowledgments

Thank you to all contributors who help make spec-and-loop better!
