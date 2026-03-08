# Spec and Loop

OpenSpec + Ralph Loop integration for iterative development with opencode.

![CI Status](https://img.shields.io/github/actions/workflow/status/ncheaz/spec-and-loop/test.yml)
![Coverage](https://img.shields.io/badge/coverage-0%25-red)
[![npm version](https://badge.fury.io/js/spec-and-loop.svg)](https://badge.fury.io/js/spec-and-loop)

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

### Step 1: Create Spec with OpenSpec

```bash
openspec new change my-feature
```

This creates:
- **proposal.md**: Why you're making this change
- **specs/<capability>/spec.md**: Detailed requirements for each capability
- **design.md**: Technical decisions and architecture
- **tasks.md**: Implementation tasks as checkboxes

After creating the change, manually complete the OpenSpec artifacts or use the `/opsx-continue` workflow with opencode skills to progress through artifact creation.

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
3. **Task Execution**: For each incomplete task:
   - Generates context-rich prompt (full OpenSpec artifacts + a fresh task snapshot + recent loop signals)
   - Runs `opencode` with the prompt via the internal mini Ralph engine
   - Creates git commit with task description (unless `--no-commit`)
   - Marks task complete in tasks.md
4. **Completion**: All tasks done

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

```bash
# 1. Plan feature with OpenSpec
openspec new change user-auth

# 2. Complete OpenSpec artifacts manually or use opencode skills
#    (review and fill in proposal.md, design.md, specs/*/spec.md, tasks.md)

# 3. Execute with Ralph
ralph-run --change user-auth

# Output:
# [INFO] Found 15 tasks to execute
# [INFO] Executing task 1/15: Create User model with password field
# [INFO] Executing task 2/15: Implement password hashing
# ...

# 4. Verify implementation
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
| **No External Ralph** | Self-contained mini Ralph engine — no external `ralph` CLI needed |

## Features

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
- **Task synchronization**: `tasks.md` and the per-change `.ralph/ralph-tasks.md` symlink stay in sync
- **Idempotent**: Run multiple times safely

## Advanced Usage

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

## Architecture

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
    ├── PRD.md
    ├── ralph-tasks.md
    ├── ralph-context.md
    ├── ralph-history.json
    ├── ralph-loop.state.json
    └── prompt-template.md
```

## Troubleshooting

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
