# Quick Start Guide

Get up and running with **spec-and-loop** in 5 minutes!

## Prerequisites

Install these tools (one-time setup):

```bash
# 1. Install openspec (OpenSpec CLI)
npm install -g @fission-ai/openspec@latest

# 2. Install opencode (agentic coding assistant)
npm install -g opencode-ai

# 3. Install jq (command-line JSON processor)
# Ubuntu/Debian:
sudo apt install jq

# macOS:
brew install jq

# 4. Git (if not already installed)
git init
```

> **Note:** No external `ralph` CLI needed — `spec-and-loop` includes its own internal
> mini Ralph loop engine. Just install `opencode` and you're ready to go. The
> runtime prompt is self-contained and does not depend on editor-specific slash
> commands or local-only skills.

## Installation

```bash
npm install -g spec-and-loop
```

## Quick Demo (5 Minutes)

```bash
# 1. Create a test project
mkdir demo-project
cd demo-project
git init

# 2. Initialize OpenSpec
openspec init

# 3. Create a new change
openspec new add-hello-world

# 4. Fast-forward through artifact creation
openspec ff

# 5. Run the ralph loop (executes tasks with opencode)
ralph-run --change add-hello-world
```

**That's it!** The script will:
- Read your OpenSpec artifacts (proposal, specs, design, tasks)
- Execute each task with full context using the internal mini Ralph engine
- Create a git commit after each task (unless `--no-commit` is passed)
- Track progress in tasks.md

## What Just Happened?

1. **Created a spec** with OpenSpec
   - `proposal.md`: Why you're adding this feature
   - `specs/*/spec.md`: Detailed requirements
   - `design.md`: Technical decisions
   - `tasks.md`: Implementation tasks as checkboxes

2. **Executed tasks** with opencode via mini Ralph
   - Each task got full context (proposal + specs + design + fresh task snapshot)
   - Git commits created after each task
   - Task checkboxes marked as complete

3. **Iterated** until all tasks done
   - Recent failures or no-progress iterations inform subsequent tasks
   - Each task builds on the previous commit
   - Full granular git history

## Verify Your Work

```bash
# Check the git history (one commit per task!)
git log --oneline

# See the change files
ls -la openspec/changes/add-hello-world/

# View the generated PRD (internal use)
cat openspec/changes/add-hello-world/.ralph/PRD.md

# Check loop status
ralph-run --status
```

## Common Commands

### OpenSpec Commands

```bash
openspec init                  # Initialize in current directory
openspec new <name>             # Start a new change
openspec continue <name>         # Continue working on change
openspec ff <name>              # Fast-forward artifact creation
openspec apply <name>           # Apply change (implementation)
openspec archive <name>          # Archive completed change
```

### Ralph Loop Commands

```bash
ralph-run                                    # Auto-detect most recent change and run
ralph-run --change <name>                    # Run for specific change
ralph-run --verbose                          # Run with debug output
ralph-run --no-commit                        # Run without auto-committing
ralph-run --help                             # Show help message

# Observability and control
ralph-run --status                           # Show loop status dashboard
ralph-run --add-context "guidance text"      # Inject context into next iteration
ralph-run --clear-context                    # Remove pending context
```

## Real-World Example

```bash
# 1. Initialize in your project
cd my-web-app
git init
openspec init

# 2. Create a feature
openspec new user-authentication

# 3. Go through the workflow
# - Create proposal: Why add auth?
# - Create specs: Login flow, password reset, OAuth
# - Create design: Use JWT, store hashed passwords
# - Create tasks: 15 checkboxes for implementation

# 4. Fast-forward to create all artifacts
openspec ff user-authentication

# 5. Execute the implementation
ralph-run --change user-authentication

# 6. Watch the magic happen!
# [INFO] Found 15 tasks to execute
# [INFO] Executing task 1/15: Create User model
# [INFO] Executing task 2/15: Implement password hashing
# ...

# 7. Add context mid-run if needed (from another terminal)
ralph-run --add-context "Prefer bcrypt over argon2 for password hashing"

# 8. Check status
ralph-run --status

# 9. Verify the implementation
git log --oneline      # 15 commits, one per task
git diff HEAD~15        # See full implementation
```

## Troubleshooting

### "openspec CLI not found" or "opencode CLI not found"

```bash
npm install -g @fission-ai/openspec@latest opencode-ai
```

### "jq CLI not found"

```bash
# Ubuntu/Debian
sudo apt install jq

# macOS
brew install jq
```

### "Not a git repository"

```bash
git init
```

### "command not found: ralph-run"

**Problem:** npm bin directory not in PATH

**Solution:**
```bash
# Add to ~/.bashrc or ~/.zshrc
export PATH="$PATH:$(npm root -g)/.bin"

# Reload shell
source ~/.bashrc
```

### "No tasks to execute"

**Problem:** All tasks already complete (or tasks.md has no unchecked items)

**Solution:**
```bash
# Check tasks.md
grep "^\- \[ \]" openspec/changes/my-feature/tasks.md

# Or create a new change
openspec new another-feature
```

## Features at a Glance

| Feature | Description |
|---------|-------------|
| **Structured Planning** | OpenSpec workflow: proposal → specs → design → tasks |
| **Agentic Execution** | opencode executes tasks with full context |
| **Iterative Loop** | Each task builds on previous commits |
| **Error Propagation** | Failures inform subsequent tasks |
| **Granular History** | One git commit per task |
| **Auto-Resume** | Interrupted? Run again — picks up where left off |
| **Context Injection** | `--add-context` injects guidance into the next iteration |
| **No External Ralph** | Self-contained mini Ralph engine — no `ralph` CLI needed |

## Testing

Spec-and-loop includes a comprehensive test suite to ensure reliability and cross-platform compatibility.

### Running Tests

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

### Test Requirements

To run tests, you'll need:
- **Node.js** (>= 24.0.0)
- **Bats** (Bash testing framework): `apt install bats-core` or `brew install bats-core`
- **Shellcheck** (Bash linting): `apt install shellcheck` or `brew install shellcheck`

### CI/CD

Tests run automatically on every push and pull request via GitHub Actions on both Linux and macOS.

**For more details, see [TESTING.md](./TESTING.md)**

## Next Steps

1. **Read the full README.md** for detailed documentation
2. **Try a real feature** in your project
3. **Explore `openspec/changes/<name>/.ralph/`** to see the per-change loop state
4. **Review TESTING.md** for testing guidelines

## Resources

- [Full README](./README.md) - Comprehensive documentation
- [OpenSpec](https://openspec.ai) - Specification workflow
- [opencode](https://opencode.ai) - Agentic coding assistant

## Need Help?

- Check the **Troubleshooting** section above
- Review the **Full README.md** for detailed info

Happy coding!
