# Test Suite Setup Guide

This guide explains how to set up the development environment to run tests for the spec-and-loop project.

## Prerequisites

Before running tests, ensure you have the following installed:

### System Dependencies

**Bats (Bash Automated Testing System)**

Bats is required for running bash script tests.

**On Linux (Ubuntu/Debian):**
```bash
sudo apt install bats-core
```

**On macOS:**
```bash
brew install bats-core
```

**Verify installation:**
```bash
bats --version
```

**jq (JSON processor)**

Used by ralph-run.sh script.

**On Linux:**
```bash
sudo apt install jq
```

**On macOS:**
```bash
brew install jq
```

**shellcheck (Bash linter)**

Used for linting bash scripts.

**On Linux:**
```bash
sudo apt install shellcheck
```

**On macOS:**
```bash
brew install shellcheck
```

### Node.js Dependencies

Install npm packages (includes Jest for JavaScript tests):

```bash
npm install
```

## Running Tests

### Run all tests:
```bash
npm test
```

### Run only unit tests:
```bash
npm run test:unit
```

### Run only JavaScript tests:
```bash
npm run test:js
```

### Run only integration tests:
```bash
npm run test:integration
```

### Run tests in watch mode (JavaScript only):
```bash
npm run test:watch
```

### Run tests with coverage:
```bash
npm run test:coverage
```

### Lint bash scripts:
```bash
npm run lint
```

## Test Organization

```
tests/
├── unit/
│   ├── bash/           # Bats tests for bash functions
│   └── javascript/     # Jest tests for Node.js wrapper
├── integration/        # End-to-end workflow tests
├── fixtures/           # Sample OpenSpec changes and git repos
└── helpers/            # Reusable test utilities
```

## Troubleshooting

### Bats not found

If you get `bats: command not found`:

1. Ensure Bats is installed using the commands above
2. On Linux, verify the installation path: `which bats`
3. On macOS with Homebrew, try: `brew link bats-core`

### Permission denied on test files

If you get permission errors:

```bash
chmod +x tests/integration/*.bats
chmod +x tests/unit/bash/*.bats
```

### Tests fail on one platform but not the other

Some tests have platform-specific behavior:
- File modification time retrieval: `stat -c %Y` (Linux) vs `stat -f %m` (macOS)
- MD5 hashing: `md5sum` (Linux) vs `md5 -q` (macOS)
- Path resolution: May use different fallback mechanisms

Report platform-specific issues in GitHub Issues.

## CI/CD

Tests run automatically on GitHub Actions for:
- Push to `main` branch
- Push to `develop` branch
- Pull requests

CI runs on both Linux (Ubuntu) and macOS in parallel.
