# Spec and Loop

OpenSpec + Ralph Loop integration for iterative development with opencode.

![CI Status](https://img.shields.io/github/actions/workflow/status/ncheaz/spec-and-loop/test.yml)
![Coverage](https://img.shields.io/badge/coverage-0%25-red)
[![npm version](https://badge.fury.io/js/spec-and-loop.svg)](https://badge.fury.io/js/spec-and-loop.svg)

**Version:** spec-and-loop 2.0.0 + OpenSpec 1.2.0

**[Quick Start Guide](./QUICKSTART.md)** - Get up and running in 5 minutes!

## Why This Exists

OpenSpec provides excellent structure for planning (proposal → specs → design → tasks) but leaves execution manual. This package provides an iterative development loop — execute → commit → repeat — driven by an internal mini Ralph implementation that works with OpenCode and eliminates the need for any external Ralph runtime.

The runtime prompt is self-contained: it does not depend on Cursor-only slash commands or editor-local skills.

**Version Requirements:** This documentation applies to OpenSpec 1.2.0 and spec-and-loop 2.0.0.

## Installation

```bash
npm install -g spec-and-loop@2.0.0
```

**Prerequisites:** You need OpenSpec and the OpenCode AI agent installed:

```bash
npm install -g @fission-ai/openspec@1.2.0 opencode-ai
```

Alternative OpenCode install methods:

```bash
# Install script (general use)
curl -fsSL https://opencode.ai/install | bash

# Homebrew (macOS / Linux)
brew install anomalyco/tap/opencode
```

**[Get Started in 5 Minutes](./QUICKSTART.md)**

```bash
# 1. Initialize OpenSpec in your project
openspec init

# 2. Create a new change
openspec new change add-user-auth

# 3. Review and complete the OpenSpec artifacts
#    (openspec/changes/add-user-auth/proposal.md)
#    (openspec/changes/add-user-auth/design.md)
#    (openspec/changes/add-user-auth/specs/*/spec.md)
#    (openspec/changes/add-user-auth/tasks.md)

# 4. Run the ralph loop (executes tasks with opencode)
ralph-run --change add-user-auth
```

For detailed step-by-step instructions, see [QUICKSTART.md](./QUICKSTART.md).

## Testing

*Testing suite for spec-and-loop 2.0.0*

Spec-and-loop includes a comprehensive test suite to ensure reliability and cross-platform compatibility.

**[Testing Guide](./TESTING.md)** - Detailed instructions for running tests

### Quick Test Commands

```bash
# Run all tests
npm test

# Run unit tests only
npm run test:unit

# Run integration tests only
npm run test:integration

# Run tests with coverage
npm run test:coverage

# Run shellcheck linting
npm run lint
```

### CI/CD Status

- **Linux**: Tests run on Ubuntu (latest)
- **macOS**: Tests run on macOS (latest)
- **Node.js**: Tested on Node.js 24

All tests are run automatically via GitHub Actions on every push and pull request.

## Prerequisites

*Required for spec-and-loop 2.0.0 with OpenSpec 1.2.0*

Before using spec-and-loop, ensure you have:

 1. **Node.js** - For package installation (requires >=24.0.0)
    ```bash
    node --version  # Should be >=24.0.0
    ```

 2. **openspec** - OpenSpec CLI for specification workflow (requires 1.2.0)
    ```bash
    npm install -g @fission-ai/openspec@1.2.0
    ```

3. **opencode** - Agentic coding assistant
   ```bash
   npm install -g opencode-ai
   ```

4. **jq** - Command-line JSON processor
   ```bash
   # Ubuntu/Debian
   sudo apt install jq

   # macOS
   brew install jq
   ```

5. **git** - Version control (for commits per task)
   ```bash
   git init
   ```

For complete installation instructions, see [QUICKSTART.md](./QUICKSTART.md).

## Commands

*Documentation applies to OpenSpec 1.2.0 and spec-and-loop 2.0.0*

### OpenSpec Commands

- `openspec init` - Initialize OpenSpec in current directory
- `openspec new change <name>` - Create a new change with artifact templates
- `openspec --help` - View all available commands and their syntax

### Ralph Loop Commands

```
ralph-run [OPTIONS]

OPTIONS:
    --change <name>          Specify the OpenSpec change to execute (default: auto-detect)
    --max-iterations <n>     Maximum iterations for Ralph loop (default: 50)
    --no-commit              Suppress automatic git commits during the loop
    --verbose, -v            Enable verbose mode for debugging
    --help, -h               Show this help message

OBSERVABILITY AND CONTROL:
    --status                 Print the current loop status dashboard and exit
    --add-context <text>     Add pending context to inject into the next iteration and exit
    --clear-context          Clear any pending context and exit
```

## How It Works

*Workflow for OpenSpec 1.2.0 + spec-and-loop 2.0.0*

### Step 1: Create Spec with OpenSpec

```bash
openspec new change my-feature
```

This creates:
- **proposal.md**: Why you're making this change
- **specs/<capability>/spec.md**: Detailed requirements for each capability
- **design.md**: Technical decisions and architecture
- **tasks.md**: Implementation tasks as checkboxes

After creating the change, manually complete the OpenSpec artifacts by filling in proposal.md, design.md, specs/*/spec.md, and tasks.md.

**Example tasks.md:**
```markdown
## Implementation

- [ ] Create database schema
- [ ] Implement API endpoints
- [ ] Write unit tests
- [ ] Add documentation
```

### Step 2: Run Ralph Loop

```bash
ralph-run --change my-feature
```

**What happens:**

1. **Validation**: Checks for required OpenSpec artifacts and git repository
2. **PRD Generation**: Converts proposal + specs + design → PRD format for internal use
3. **Setup**: Creates .ralph directory, syncs tasks symlink, and sets up output capture
4. **Task Execution**: For each incomplete task:
   - Generates context-rich prompt (full OpenSpec artifacts + a fresh task snapshot + recent loop signals)
   - Runs `opencode` with the prompt via the internal mini Ralph engine
   - Captures output to temp directory for review and debugging
   - Logs any errors to `.ralph/errors.md` with timestamps
   - Creates git commit with task description (unless `--no-commit`)
   - Marks task complete in tasks.md
5. **Cleanup**: Automatically removes old output directories (older than 7 days)
6. **Completion**: All tasks done

### Step 3: Monitor Progress

```bash
# Check loop status
ralph-run --status

# Check remaining tasks
grep "^- \[ \]" openspec/changes/my-feature/tasks.md

# View git commits
git log --oneline

# Inject context into next iteration
ralph-run --add-context "Prefer async/await over callbacks"
```

## Example Workflow

*Example workflow for OpenSpec 1.2.0 and spec-and-loop 2.0.0*

```bash
# 1. Initialize OpenSpec in your project
cd my-web-app
git init
openspec init

# 2. Create a new change
openspec new change user-auth

# 3. Complete OpenSpec artifacts manually or use opencode skills
#    (review and fill in proposal.md, design.md, specs/*/spec.md, tasks.md)

# 4. Execute with Ralph
ralph-run --change user-auth

# Output:
# [INFO] Found 15 tasks to execute
# [INFO] Executing task 1/15: Create User model with password field
# [INFO] Executing task 2/15: Implement password hashing
# ...

# 5. Verify implementation
git log --oneline  # 15 commits, one per task
git diff HEAD~15   # See full implementation
```

## Features at a Glance

| Feature | Description |
|---------|-------------|
| **Structured Planning** | OpenSpec workflow: proposal → specs → design → tasks |
| **Agentic Execution** | opencode executes tasks with full context |
| **Iterative Loop** | Each task builds on previous commits |
| **Iteration Feedback** | Recent failures and no-progress iterations inform the next pass |
| **Granular History** | One git commit per task |
| **Auto-Resume** | Interrupted? Run again — picks up where left off |
| **Context Injection** | `--add-context` injects guidance into the next iteration |
| **Loop Status** | `--status` shows active state, history, and struggle indicators |
| **Error Tracking** | Automatic error logging and archiving for debugging |
| **Output Capture** | Loop output captured to temp directories for review |
| **Cross-Platform** | Full support for Linux and macOS with portable operations |
| **No External Ralph** | Self-contained mini Ralph engine — no external `ralph` CLI needed |

## Features

*Features available in spec-and-loop 2.0.0 with OpenSpec 1.2.0*

### Mini Ralph Loop Engine

`spec-and-loop` includes a first-party mini Ralph implementation (`lib/mini-ralph/`) that
provides the core iterative loop without any external Ralph dependency:

- **Iterative execution**: Each task builds on previous commits with full context
- **State and history**: Loop state, iteration history, and struggle indicators stored in each change's `.ralph/`
- **Prompt templates**: Context-aware prompts generated from OpenSpec artifacts
- **Completion promises**: Loop exits when a completion signal is detected
- **Task progression**: Synchronized with `tasks.md` checkboxes as the source of truth

The supported subset intentionally excludes upstream features that are out of scope for
this repository's OpenSpec-first workflow (multi-agent rotation, plugin toggles, etc.).

### OpenSpec + opencode Synergy

| OpenSpec | opencode | Together |
|----------|----------|----------|
| Structured planning | Agentic execution | Plan → Execute loop |
| Human-readable specs | AI-understandable context | Full context propagation |
| Task breakdown | Task implementation | Automatable workflow |

### Script Features

- **Auto-resume**: Interrupted? Run again — picks up where left off
- **Context injection**: `--add-context` / `--clear-context` via each change's `.ralph/ralph-context.md`
- **Error recovery**: Recent loop signals help guide subsequent tasks
- **Error tracking**: Automatic error logging to `.ralph/errors.md` with timestamps and archiving
- **Task synchronization**: `tasks.md` and the per-change `.ralph/ralph-tasks.md` symlink stay in sync
- **Output capture**: Loop output captured to temp directories for review and debugging
- **Cross-platform**: Portable operations for Linux and macOS (stat, md5sum, realpath)
- **Cleanup**: Automatic cleanup of old output directories (older than 7 days)
- **Idempotent**: Run multiple times safely

## Advanced Usage

*Advanced features for spec-and-loop 2.0.0*

### Context Injection

Inject custom instructions into the next iteration:

```bash
ralph-run --add-context "Use Redis instead of Memcached"

# Check current pending context
ralph-run --status

# Clear pending context
ralph-run --clear-context
```

### Loop Status Dashboard

```bash
ralph-run --status
```

Shows: active loop state, current task, prompt summary, pending context, iteration history,
and struggle indicators if the loop appears stuck.

### No-Commit Mode

Run without automatic git commits (useful for reviewing changes before committing):

```bash
ralph-run --change my-feature --no-commit
```

### Verbose Mode

For debugging:

```bash
ralph-run --verbose --change my-feature
```

### View Generated PRD

```bash
cat openspec/changes/my-feature/.ralph/PRD.md
```

### Review Loop Output

```bash
# Find the latest output directory path
cat openspec/changes/my-feature/.ralph/.output_dir

# View stdout and stderr logs
cat openspec/changes/my-feature/.ralph/.output_dir/ralph-stdout.log
cat openspec/changes/my-feature/.ralph/.output_dir/ralph-stderr.log
```

Output is captured to temporary directories for debugging. Old output directories are automatically cleaned up after 7 days.

### View Error Logs

```bash
# View recent errors
cat openspec/changes/my-feature/.ralph/errors.md

# Archived errors are saved with timestamps
ls openspec/changes/my-feature/.ralph/errors_*.md
```

## Architecture

*Architecture for spec-and-loop 2.0.0 with OpenSpec 1.2.0*

This package integrates:
- **OpenSpec**: Structured specification workflow
- **opencode**: Agentic coding assistant for task execution
- **Mini Ralph** (`lib/mini-ralph/`): Internal iterative loop engine

### Context Propagation

Each task execution includes:
- **OpenSpec artifacts**: Proposal, design, and spec content from the generated PRD
- **Fresh task snapshot**: Raw `tasks.md` content plus the current task and completed-task summary rendered each iteration
- **Recent loop signals**: Compact reminders about prior failed or no-progress iterations
- **Pending context**: Any `--add-context` injection

### Task Tracking

Synchronized tracking:
- **tasks.md**: Human-readable checkboxes `[ ]` → `[x]` (source of truth)
- **.ralph/ralph-tasks.md**: Symlink to `tasks.md` for the loop engine
- **Atomic updates**: Checkboxes updated after each completed task

### File Structure

```
openspec/changes/<name>/
├── proposal.md          # Your "why"
├── design.md            # Your "how"
├── tasks.md             # Your "what" (checkboxes, source of truth)
├── specs/               # Your requirements
│   ├── auth/
│   │   └── spec.md
│   └── api/
│       └── spec.md
└── .ralph/              # Internal loop state (auto-generated, per change)
    ├── PRD.md                    # Generated product requirements document
    ├── ralph-tasks.md           # Symlink to ../tasks.md (syncs task state)
    ├── ralph-context.md         # Pending context for next iteration
    ├── ralph-history.json       # Iteration history and state
    ├── ralph-loop.state.json    # Current loop state and iteration count
    ├── prompt-template.md       # Template used for generating prompts
    ├── errors.md                # Error logs with timestamps
    ├── errors_*.md              # Archived error logs
    └── .output_dir             # Path to latest output capture directory
```

### Cross-Platform Support

*Cross-platform support verified for spec-and-loop 2.0.0*

`spec-and-loop` is designed to work seamlessly on both Linux and macOS. The script includes portable implementations for:

- **File modification times**: Uses `stat -f %m` on macOS and `stat -c %Y` on Linux
- **MD5 hashing**: Supports both `md5sum` (Linux) and `md5 -q` (macOS)
- **Path resolution**: Falls back from `realpath` to `readlink -f` to manual path construction
- **Temp directories**: Uses `TMPDIR` environment variable or `/tmp` as fallback
- **Cleanup**: Portable `find` and `rm` operations for old output directories

All features work identically on both platforms without requiring platform-specific configuration.

## Troubleshooting

*Troubleshooting guide for spec-and-loop 2.0.0 with OpenSpec 1.2.0*

For common issues and solutions, see [QUICKSTART.md#troubleshooting](./QUICKSTART.md#troubleshooting).

**Quick fixes:**

```bash
# opencode not found?
npm install -g opencode-ai

# jq not found?
sudo apt install jq  # or: brew install jq

# Not a git repository?
git init

# command not found: ralph-run?
export PATH="$PATH:$(npm root -g)/.bin"
```

## Resources

- [OpenSpec](https://openspec.ai) - Structured specification workflow
- [opencode](https://opencode.ai) - Agentic coding assistant

## License

GPL-3.0
