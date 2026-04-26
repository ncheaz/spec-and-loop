# Spec and Loop

OpenSpec + Ralph Loop integration for iterative development with opencode.

![CI Status](https://img.shields.io/github/actions/workflow/status/ncheaz/spec-and-loop/test.yml)
![Coverage](https://img.shields.io/badge/coverage-0%25-red)
[![npm version](https://badge.fury.io/js/spec-and-loop.svg)](https://badge.fury.io/js/spec-and-loop.svg)

**[Quick Start Guide](./QUICKSTART.md)** - Get up and running in 5 minutes!

## Why This Exists

OpenSpec provides excellent structure for planning (proposal → specs → design → tasks) but leaves execution manual. This package provides an iterative development loop driven by an internal mini Ralph implementation that works with OpenCode and eliminates the need for any external Ralph runtime. When auto-commit is enabled, the runner owns task commits; when `--no-commit` is enabled, the prompt contract and runtime both leave changes uncommitted.

The runtime prompt is self-contained: it does not depend on Cursor-only slash
commands or editor-local skills.

Examples below assume current published releases of `spec-and-loop`,
`@fission-ai/openspec`, and `opencode-ai`. `Node.js >=24` is required.
The supported OS contract is Linux and macOS.

## Installation

```bash
npm install -g spec-and-loop
```

**Prerequisites:** You need OpenSpec and the OpenCode AI agent installed:

```bash
npm install -g @fission-ai/openspec opencode-ai
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

# 2. Ralphify your project (enables Ralph-friendly artifact generation)
ralph-run init

# 3. Create a new change
openspec new change add-user-auth

# 4. Review and complete the OpenSpec artifacts
#    (openspec/changes/add-user-auth/proposal.md)
#    (openspec/changes/add-user-auth/design.md)
#    (openspec/changes/add-user-auth/specs/*/spec.md)
#    (openspec/changes/add-user-auth/tasks.md)

# 5. Run the ralph loop (executes tasks with opencode)
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

 2. **openspec** - OpenSpec CLI for specification workflow
    ```bash
    npm install -g @fission-ai/openspec
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
- `openspec list` - List active changes
- `openspec status --change <name>` - Show artifact completion status for a change
- `openspec show <item-name>` - Display a change or spec in detail
- `openspec validate <item-name>` - Validate a change or spec
- `openspec archive <change-name>` - Archive a completed change

### Ralph Loop Commands

- `ralph-run init` - Configure project for Ralph-friendly artifact generation (run once after `openspec init`)

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

SUBCOMMANDS:
    init                     Configure project for Ralph-friendly artifact generation
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
   - Generates a context-rich prompt from the invocation-time PRD snapshot plus a fresh task snapshot and recent loop signals
   - Runs `opencode` with the prompt via the internal mini Ralph engine
   - Captures output to temp directory for review and debugging
   - Logs any errors to `.ralph/errors.md` with timestamps
   - Expects standalone control lines: `<promise>READY_FOR_NEXT_TASK</promise>` for task completion and `<promise>COMPLETE</promise>` when all tasks are done
   - Creates a runner-managed git commit for task-scoped changes when auto-commit is enabled; if the commit is blocked or fails, the anomaly is recorded in history and surfaced by `--status`
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

```bash
# 1. Initialize OpenSpec in your project
cd my-web-app
git init
openspec init

# 2. Ralphify your project
ralph-run init

# 3. Create a new change
openspec new change user-auth

# 4. Complete OpenSpec artifacts manually or use opencode skills
#    (review and fill in proposal.md, design.md, specs/*/spec.md, tasks.md)

# 5. Execute with Ralph
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
| **Granular History** | Runner-managed commit per completed task when auto-commit succeeds |
| **Auto-Resume** | Interrupted? Run again — picks up where left off |
| **Context Injection** | `--add-context` injects guidance into the next iteration |
| **Loop Status** | `--status` shows active state, history, and struggle indicators |
| **Error Tracking** | Automatic error logging and archiving for debugging |
| **Output Capture** | Loop output captured to temp directories for review |
| **Cross-Platform** | Full support for Linux and macOS with portable operations |
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
- **Error tracking**: Automatic error logging to `.ralph/errors.md` with timestamps and archiving
- **Task synchronization**: `tasks.md` and the per-change `.ralph/ralph-tasks.md` symlink stay in sync
- **Output capture**: Loop output captured to temp directories for review and debugging
- **Cross-platform**: Portable operations for Linux and macOS (stat, md5sum, realpath)
- **Cleanup**: Automatic cleanup of old output directories (older than 7 days)
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
and struggle indicators if the loop appears stuck. Inactive runs are distinguished as completed or stopped-incomplete, and the latest unresolved auto-commit anomaly is shown when present.

### No-Commit Mode

Run without automatic git commits (useful for reviewing changes before committing):

```bash
ralph-run --change my-feature --no-commit
```

In this mode the runner does not create commits, and the rendered prompt explicitly forbids the agent from running `git add` or `git commit`.

### Verbose Mode

For debugging:

```bash
ralph-run --verbose --change my-feature
```

### View Generated PRD

```bash
cat openspec/changes/my-feature/.ralph/PRD.md
```

`PRD.md` is generated once when `ralph-run` starts and reused for the rest of
that run. Per-iteration freshness comes from re-reading `tasks.md`, recent loop
signals, and any pending `--add-context` injection.

If you customize the prompt template, preserve the standalone promise-line contract so only literal control lines advance the loop:

```text
<promise>READY_FOR_NEXT_TASK</promise>
<promise>COMPLETE</promise>
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

This package integrates:
- **OpenSpec**: Structured specification workflow
- **opencode**: Agentic coding assistant for task execution
- **Mini Ralph** (`lib/mini-ralph/`): Internal iterative loop engine

### Context Propagation

Each task execution includes:
- **Invocation-time PRD snapshot**: Proposal, design, and spec content captured in `.ralph/PRD.md` when the current `ralph-run` invocation starts
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
    ├── PRD.md                    # Generated prompt snapshot from loop start
    ├── prompt-template.md       # Template used for generating prompts
    ├── ralph-history.json       # Iteration history and state
    ├── ralph-loop.state.json    # Current loop state and iteration count
    ├── ralph-tasks.md           # Symlink to ../tasks.md (syncs task state)
    ├── .output_dir              # Path to latest output capture directory
    ├── ralph-context.md         # (Optional) Pending context for next iteration
    ├── errors.md                # (Optional) Error logs with timestamps
    ├── errors_*.md              # (Optional) Archived error logs
    └── *.md                     # (Optional) Research artifacts created during task execution
```

**Note:** Files marked as (Optional) are created only when needed:
- `ralph-context.md`: Created when you use `--add-context`
- `errors.md` and `errors_*.md`: Created when errors occur during loop execution
- Additional `*.md` files: Research artifacts created by opencode during task execution (e.g., verification outputs, analysis documents)

### Cross-Platform Support

`spec-and-loop` is designed to work on both Linux and macOS. The script includes portable implementations for:

- **File modification times**: Uses `stat -f %m` on macOS and `stat -c %Y` on Linux
- **MD5 hashing**: Supports both `md5sum` (Linux) and `md5 -q` (macOS)
- **Path resolution**: Falls back from `realpath` to `readlink -f` to manual path construction
- **Temp directories**: Uses `TMPDIR` environment variable or `/tmp` as fallback
- **Cleanup**: Portable `find` and `rm` operations for old output directories

Windows is not currently part of the supported runtime contract.

## Troubleshooting

For common issues and solutions, see [QUICKSTART.md#troubleshooting](./QUICKSTART.md#troubleshooting).

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `RALPH_BASE_PROMPT_WARN_BYTES` | `4096` | Byte threshold above which `render()` emits a one-line warning to stderr when `{{base_prompt}}` resolves to a large file. Set to `0` to silence warnings entirely. Invalid values fall back to `4096` with a one-time notice per process. |
| `RALPH_ITERATION_IDLE_TIMEOUT_MS` | `300000` | Milliseconds of silence on stdout+stderr before the per-iteration idle watchdog fires. Set to `0` to disable the watchdog entirely and restore pre-change behavior (no timeout). |
| `RALPH_ITERATION_KILL_GRACE_MS` | `10000` | Milliseconds the runner waits after sending `SIGTERM` to a timed-out iteration child before escalating to `SIGKILL`. |

### Auto-commit ignore-filter surfacing and iteration watchdog

This section covers two surfacing improvements added on top of the `harden-auto-commit-against-ignored-paths` change, which is the underlying mechanism that _detects_ when `.gitignore` rules filter out loop-managed paths.

**No new CLI flags are introduced by this change. No startup behavior changes. Every existing `ralph-run` invocation continues to work unchanged.**

#### Loud stderr block

When `_autoCommit` detects that one or more paths were filtered by `.gitignore` (anomaly types `paths_ignored_filtered` or `all_paths_ignored`), the runner emits the following block directly to `process.stderr` on **every** iteration where the anomaly fires — independently of any reporter buffering or deduplication:

```
================================================================================
⚠ AUTO-COMMIT IGNORE FILTER FIRED  (iteration 7, type: paths_ignored_filtered)
Paths filtered because .gitignore matches:
  - openspec/changes/my-change/tasks.md
  - openspec/changes/my-change/proposal.md
Consequence: these paths are NOT in the latest commit.
Remediation (pick one):
  1. git add -f <path>   # one-time unblock, if you want it tracked
  2. edit .gitignore     # narrow or remove the matching rule
  3. pass --no-auto-commit on the ralph-run invocation
================================================================================
```

The three remediation options mean:

1. **`git add -f <path>`** — force-stage a specific file for the next commit. One-time unblock; the path stays gitignored and will be filtered again on the next auto-commit unless you also do option 2.
2. **edit `.gitignore`** — narrow or remove the matching rule so the path is no longer excluded. The safest long-term fix when the rule is too broad.
3. **`--no-auto-commit`** — disable auto-commit for this run entirely. Use when you want to manage commits yourself and don't want the runner touching git.

#### Iteration watchdog

The runner enforces a per-iteration idle timeout: if the `opencode run` subprocess produces no new bytes on stdout **or** stderr for `RALPH_ITERATION_IDLE_TIMEOUT_MS` milliseconds, the watchdog fires. It sends `SIGTERM`, waits up to `RALPH_ITERATION_KILL_GRACE_MS` for a graceful exit, then sends `SIGKILL`.

The timed-out iteration is recorded in history with `failureReason: 'iteration_timeout_idle'` and three diagnostic fields: `idleMs` (how long the process was silent), `lastStdoutBytes` (last ≤200 bytes of stdout), and `lastStderrBytes` (last ≤200 bytes of stderr). These fields are absent on entries where the watchdog did not fire.

The `iteration_timeout_idle` reason also appears in the `## Recent Loop Signals` block injected into each iteration's prompt, giving the agent visibility into prior timeout events.

Set `RALPH_ITERATION_IDLE_TIMEOUT_MS=0` to disable the watchdog if your agent workflow runs legitimately long silent tools (e.g., large integration test suites). Example:

```bash
RALPH_ITERATION_IDLE_TIMEOUT_MS=900000 ralph-run --change my-feature   # 15-minute idle threshold
RALPH_ITERATION_IDLE_TIMEOUT_MS=0 ralph-run --change my-feature        # watchdog disabled
```

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
- [Ralph-Friendly OpenSpec Best Practices](./OPENSPEC-RALPH-BP.md) - How to author loop-safe artifacts and tasks
- [OpenSpec + Ralph Wiggum BOTW](./OPENSPEC-RALPH-WIGGUM-BOTW.md) - Strengths, tradeoffs, and best-fit guidance
- [Ralph Methodology Assessment](./RALPH-METHODOLOGY-ASSESSMENT.md) - Repository-specific methodology review

## License

GPL-3.0
