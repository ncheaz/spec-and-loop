# OpenSpec + Ralph Wiggum Integration

Automated agentic coding loop for OpenSpec specifications.

## Why This Exists

OpenSpec provides excellent structure for planning (proposal → specs → design → tasks) but leaves execution manual. Ralph Wiggum's iterative development loop (execute → commit → repeat) is powerful but requires PRD format instead of OpenSpec specs.

**This utility bridges the gap**: use OpenSpec for planning, then automatically execute tasks with full context using the opencode agentic coding assistant.

## Benefits

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

## Installation

```bash
# Clone this repo
git clone <repo-url>
cd <repo>

# Prerequisites
- Bash 4.0+
- Git
- OpenSpec CLI: `npm install -g openspec`
- opencode CLI: `npm install -g opencode`
- jq: `apt install jq` (Linux) / `brew install jq` (macOS)

# Make script executable
chmod +x ralph-run.sh
```

## Quick Start

### 1. Create OpenSpec Proposal

```bash
# Start a new change
openspec new my-feature

# Create proposal
openspec continue
# (Select "proposal" and follow prompts)

# Create specs (one per capability)
openspec continue
# (Select "specs" and create spec files)

# Create design
openspec continue
# (Select "design" and document decisions)

# Create tasks
openspec continue
# (Select "tasks" and breakdown into checkboxes)
```

**Example tasks.md:**
```markdown
## Implementation

- [ ] Create database schema
- [ ] Implement API endpoints
- [ ] Write unit tests
- [ ] Add documentation
```

### 2. Run Ralph Loop

```bash
# Auto-detect most recent change and execute
./ralph-run.sh

# Or specify a change
./ralph-run.sh --change my-feature

# Verbose mode for debugging
./ralph-run.sh --verbose
```

### 3. What Happens

1. **Validation**: Checks for required OpenSpec artifacts
2. **PRD Generation**: Converts proposal + specs + design → PRD format
3. **Task Execution**: For each incomplete task:
   - Generates context-rich prompt (task + specs + design + git history + errors)
   - Runs `opencode` with prompt
   - Creates git commit with task description
   - Marks task complete in tasks.md
4. **Completion**: All tasks done, errors cleared

### 4. Monitor Progress

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
openspec continue  # proposal: Why add authentication?
openspec continue  # specs: Login flow, password reset, OAuth
openspec continue  # design: Use JWT, store hashed passwords
openspec continue  # tasks: 15 checkboxes

# 2. Execute with Ralph
./ralph-run.sh --change user-auth

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

## Features

- **Auto-resume**: Interrupted? Run again—picks up where left off
- **Context injection**: `echo "Use TypeScript" > .ralph/.context_injection`
- **Error recovery**: Errors propagate to guide subsequent tasks
- **Bidirectional tracking**: Tasks.md and .ralph/tracking.json stay synced
- **Idempotent**: Run multiple times safely

## Advanced Usage

```bash
# Check if opencode is available
opencode --version

# Test script without executing
./ralph-run.sh --help

# View generated PRD
cat openspec/changes/my-feature/.ralph/PRD.md

# Manually inject context during execution
echo "Consider performance implications" > .ralph/.context_injection
```

## Troubleshooting

**"Not a git repository"**
```bash
git init
```

**"opencode CLI not found"**
```bash
npm install -g opencode
```

**"No tasks to execute"**
All tasks already complete! Check tasks.md:
```bash
grep "^\- \[x\]" openspec/changes/my-feature/tasks.md
```

## File Structure

```
.
├── ralph-run.sh              # Main integration script
├── openspec/
│   └── changes/
│       └── my-feature/
│           ├── proposal.md   # Your "why"
│           ├── design.md     # Your "how"
│           ├── tasks.md      # Your "what"
│           └── specs/       # Your requirements
│               └── capability/
│                   └── spec.md
│           └── .ralph/
│               ├── PRD.md                    # Generated
│               ├── tracking.json             # Task state
│               └── errors.md                # Failures
```

## Resources

- [OpenSpec](https://openspec.ai) - Structured specification workflow
- [open-ralph-wiggum](https://github.com/Th0rgal/open-ralph-wiggum) - Iterative execution loop
- [opencode](https://opencode.ai) - Agentic coding assistant

## License

See project license.
