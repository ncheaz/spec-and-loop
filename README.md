# Spec and Loop

OpenSpec + Ralph Loop integration for iterative development with opencode.

**[🚀 Quick Start Guide](./QUICKSTART.md)** - Get up and running in 5 minutes!

## Why This Exists

OpenSpec provides excellent structure for planning (proposal → specs → design → tasks) but leaves execution manual. Ralph Wiggum's iterative development loop (execute → commit → repeat) is powerful but requires PRD format instead of OpenSpec specs.

**This utility bridges the gap**: use OpenSpec for planning, then automatically execute tasks with full context using opencode agentic coding assistant.

## Installation

```bash
npm install -g spec-and-loop
```

**Prerequisites:** You need openspec and opencode installed:

```bash
npm install -g openspec opencode
```

## Quick Start

**[🚀 Get Started in 5 Minutes](./QUICKSTART.md)**

```bash
# 1. Initialize OpenSpec in your project
openspec init

# 2. Create a new change
openspec new add-user-auth

# 3. Fast-forward through artifact creation
openspec ff add-user-auth

# 4. Run the ralph loop (executes tasks with opencode)
ralph-run --change add-user-auth
```

For detailed step-by-step instructions, see [QUICKSTART.md](./QUICKSTART.md).

## Quick Start

```bash
# 1. Initialize OpenSpec in your project
openspec init

# 2. Create a new change
openspec new add-user-auth

# 3. Fast-forward through artifact creation
openspec ff add-user-auth

# 4. Run the ralph loop (executes tasks with opencode)
ralph-run --change add-user-auth
```

Or auto-detect the most recent change:

```bash
ralph-run
```

## Prerequisites

Before using spec-and-loop, ensure you have:

1. **Node.js & npm** - For package installation
   ```bash
   node --version  # Should be 14+
   npm --version   # Should be 6+
   ```

2. **openspec** - OpenSpec CLI for specification workflow
   ```bash
   npm install -g openspec
   ```

3. **opencode** - Agentic coding assistant
   ```bash
   npm install -g opencode
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
- `openspec new <name>` - Start a new change
- `openspec ff <name>` - Fast-forward artifact creation
- `openspec continue <name>` - Continue working on change
- `openspec apply <name>` - Apply change (implementation)
- `openspec archive <name>` - Archive a completed change

### Ralph Loop Commands

- `ralph-run --change <name>` - Run the ralph loop for a specific change
- `ralph-run` - Auto-detect most recent change and run

## How It Works

### Step 1: Create Spec with OpenSpec

```bash
openspec new my-feature
openspec ff my-feature
```

This creates:
- **proposal.md**: Why you're making this change
- **specs/<capability>/spec.md**: Detailed requirements for each capability
- **design.md**: Technical decisions and architecture
- **tasks.md**: Implementation tasks as checkboxes

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

1. **Validation**: Checks for required OpenSpec artifacts
2. **PRD Generation**: Converts proposal + specs + design → PRD format (for internal use)
3. **Task Execution**: For each incomplete task:
   - Generates context-rich prompt (task + specs + design + git history + errors)
   - Runs `opencode` with the prompt
   - Creates git commit with task description
   - Marks task complete in tasks.md
4. **Completion**: All tasks done, errors cleared

### Step 3: Monitor Progress

```bash
# Check remaining tasks
grep "^- \[ \]" openspec/changes/my-feature/tasks.md

# View git commits
git log --oneline

# See errors (if any failed)
cat openspec/changes/my-feature/.ralph/errors.md
```

## Example Workflow

```bash
# 1. Plan feature with OpenSpec
openspec new user-auth
openspec ff user-auth

# 2. Execute with Ralph
ralph-run --change user-auth

# Output:
# [INFO] Found 15 tasks to execute
# [INFO] Executing task 1/15: Create User model with password field
# ✓ Complete
# [INFO] Executing task 2/15: Implement password hashing
# ✓ Complete
# ...

# 3. Verify implementation
git log --oneline  # 15 commits, one per task
git diff HEAD~15   # See full implementation
```

## Features at a Glance

| Feature | Description |
|---------|-------------|
| **Structured Planning** | OpenSpec workflow: proposal → specs → design → tasks |
| **Agentic Execution** | opencode executes tasks with full context |
| **Iterative Loop** | Each task builds on previous commits |
| **Error Propagation** | Failures inform subsequent tasks |
| **Granular History** | One git commit per task |
| **Auto-Resume** | Interrupted? Run again—picks up where left off |
| **Context Injection** | Inject custom instructions during execution |

For detailed feature descriptions, see below.

## Features

### Ralph Wiggum + Agentic Coding

- **Iterative refinement**: Each task builds on previous commits with full context
- **Error propagation**: Failures inform subsequent iterations—don't repeat mistakes
- **Granular history**: Commit per task makes debugging and rollback easy
- **Context awareness**: AI sees proposal, specs, design, git history, and errors

### OpenSpec + opencode Synergy

| OpenSpec | opencode | Together |
|----------|----------|----------|
| Structured planning | Agentic execution | Plan → Execute loop |
| Human-readable specs | AI-understandable context | Full context propagation |
| Task breakdown | Task implementation | Automatable workflow |

### Script Features

- **Auto-resume**: Interrupted? Run again—picks up where left off
- **Context injection**: Inject custom instructions during execution
- **Error recovery**: Errors propagate to guide subsequent tasks
- **Bidirectional tracking**: Tasks.md and .ralph/tracking.json stay synced
- **Idempotent**: Run multiple times safely

## Advanced Usage

### Context Injection

Inject custom instructions during execution:

```bash
# Create injection file
echo "Use Redis instead of Memcached" > openspec/changes/my-feature/.ralph/.context_injection

# Next opencode invocation includes:
## Injected Context
Use Redis instead of Memcached
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

### Manually Inject Context

```bash
echo "Consider performance implications" > openspec/changes/my-feature/.ralph/.context_injection
```

## Architecture

This package integrates:
- **OpenSpec**: Structured specification workflow
- **opencode**: Agentic coding assistant for task execution
- **Ralph Loop**: Iterative development with commits per task, error tracking

### Context Propagation

Each task execution includes:
- **Task description**: What to implement
- **Proposal summary**: Why this change matters
- **Relevant specs**: Requirements to satisfy
- **Design decisions**: Architectural constraints
- **Git history**: Last 10 commits (what's already done)
- **Previous errors**: What failed before (to avoid repeating)

### Task Tracking

Bidirectional synchronization:
- **tasks.md**: Human-readable checkboxes `[ ]` → `[x]`
- **.ralph/tracking.json**: Machine-readable state
- **Atomic updates**: Both succeed or both fail
- **Stable IDs**: Line numbers persist across script runs

### File Structure

```
openspec/changes/<name>/
├── proposal.md          # Your "why"
├── design.md            # Your "how"
├── tasks.md             # Your "what" (checkboxes)
└── specs/               # Your requirements
    ├── auth/
    │   └── spec.md
    └── api/
        └── spec.md
└── .ralph/             # Internal state (auto-generated)
    ├── PRD.md                    # Generated from artifacts
    ├── tracking.json             # Task completion state
    ├── errors.md                 # Failure history
    ├── context-injections.md      # Manual injections log
    └── .context_injection        # Pending injection
```

## Troubleshooting

For common issues and solutions, see [QUICKSTART.md#troubleshooting](./QUICKSTART.md#troubleshooting).

**Quick fixes:**

```bash
# opencode not found?
npm install -g opencode

# jq not found?
sudo apt install jq  # or: brew install jq

# Not a git repository?
git init

# command not found: ralph-run?
export PATH="$PATH:$(npm root -g)/.bin"
```

## Resources

- [OpenSpec](https://openspec.ai) - Structured specification workflow
- [open-ralph-wiggum](https://github.com/Th0rgal/open-ralph-wiggum) - Iterative execution loop
- [opencode](https://opencode.ai) - Agentic coding assistant

## License

MIT
