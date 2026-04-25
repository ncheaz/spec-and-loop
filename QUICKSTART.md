# Quick Start Guide

Get up and running with **spec-and-loop** in 5 minutes!

> **Compatibility note:** Examples assume recent releases of `spec-and-loop`,
> `@fission-ai/openspec`, and `opencode-ai`. `Node.js >=24` is required. The
> supported OS contract is Linux and macOS.

## Prerequisites

Install these tools (one-time setup):

```bash
# 1. Ensure Node.js >=24
node --version

# 2. Install openspec (OpenSpec CLI)
npm install -g @fission-ai/openspec

# 3. Install opencode (agentic coding assistant)
npm install -g opencode-ai

# 4. Install jq (command-line JSON processor)
# Ubuntu/Debian:
sudo apt install jq

# macOS:
brew install jq

# 5. Git (if not already installed)
git init
```

> **Note:** No external `ralph` CLI is needed - `spec-and-loop` includes its own internal
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

# 3. Ralphify your project (enables Ralph-friendly artifact generation)
ralph-run init

# 4. Create a new change
openspec new change add-hello-world

# 5. Review and complete the OpenSpec artifacts
#    (openspec/changes/add-hello-world/proposal.md)
#    (openspec/changes/add-hello-world/design.md)
#    (openspec/changes/add-hello-world/specs/*/spec.md)
#    (openspec/changes/add-hello-world/tasks.md)

# 6. Run the ralph loop (executes tasks with opencode)
ralph-run --change add-hello-world
```

**That's it!** The script will:
- Read your OpenSpec artifacts (proposal, specs, design, tasks)
- Execute each task with full context using the internal mini Ralph engine
- Create a runner-managed task commit when auto-commit is enabled and task-scoped staging succeeds
- Track progress in tasks.md

## What Just Happened?

1. **Created a spec** with OpenSpec
   - `proposal.md`: Why you're adding this feature
   - `specs/*/spec.md`: Detailed requirements
   - `design.md`: Technical decisions
   - `tasks.md`: Implementation tasks as checkboxes

2. **Executed tasks** with opencode via mini Ralph
   - Each task got full context (loop-start PRD snapshot + fresh task snapshot + recent loop signals)
   - Task completion and full-run completion are signaled with standalone promise lines: `<promise>READY_FOR_NEXT_TASK</promise>` and `<promise>COMPLETE</promise>`
   - Runner-managed commits are created after completed tasks unless `--no-commit` is active
   - Task checkboxes marked as complete

3. **Iterated** until all tasks done
   - Recent failures or no-progress iterations inform subsequent tasks
   - Each task builds on the previous commit
   - Full granular git history

## Verify Your Work

```bash
# Check the git history (runner-managed task commits by default)
git log --oneline

# See the change files
ls -la openspec/changes/add-hello-world/

# View the generated PRD (internal use)
cat openspec/changes/add-hello-world/.ralph/PRD.md

# Check loop status
ralph-run --status
```

`PRD.md` is a loop-start snapshot of `proposal.md`, `design.md`, and
`specs/*/spec.md`. During the run, `ralph-run` keeps refreshing `tasks.md`,
recent loop signals, and pending injected context each iteration, but it does
not regenerate `PRD.md` on every pass.

If you customize the prompt template, keep the promise tags on standalone lines so quoted or explanatory mentions do not advance the loop.

## Common Commands

### OpenSpec Commands

```bash
# Core workflow
openspec init                  # Initialize OpenSpec in current directory
openspec new change <name>      # Create a new change directory
openspec show <item-name>      # Show a change or spec in detail
openspec archive <change-name> # Archive a completed change

# Information and status
openspec list                  # List all active changes (use --specs to list specs)
openspec status --change <name> # Display artifact completion status for a change
openspec validate <item-name> # Validate changes and specs

# View and manage
openspec view                  # Display interactive dashboard of specs and changes
openspec update                # Update OpenSpec instruction files
openspec config                # View and modify global OpenSpec configuration

# Advanced
openspec spec                  # Manage and view OpenSpec specifications
openspec instructions         # Output enriched instructions for creating artifacts
openspec templates             # Show resolved template paths for artifacts
openspec schemas               # List available workflow schemas
```

### Ralph Loop Commands

```bash
ralph-run init                                    # Configure project for Ralph-friendly artifact generation
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

# 2. Ralphify your project
ralph-run init

# 3. Create a feature
openspec new change user-authentication

# 4. Go through the workflow
# - Create proposal: Why add auth?
# - Create specs: Login flow, password reset, OAuth
# - Create design: Use JWT, store hashed passwords
# - Create tasks: 15 checkboxes for implementation

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

### "openspec: command not found"

**Problem:** OpenSpec CLI is not installed or not in PATH

**Solution:**
```bash
# Install OpenSpec
npm install -g @fission-ai/openspec

# Verify installation
openspec --version

# If command still not found, add npm global bin to PATH
export PATH="$PATH:$(npm root -g)/.bin"
```

### "opencode: command not found"

**Problem:** opencode CLI is not installed or not in PATH

**Solution:**
```bash
# Install opencode
npm install -g opencode-ai

# Verify installation
opencode --version

# If command still not found, add npm global bin to PATH
export PATH="$PATH:$(npm root -g)/.bin"
```

### "jq CLI not found"

**Problem:** jq (JSON processor) is not installed

**Solution:**
```bash
# Ubuntu/Debian
sudo apt install jq

# macOS
brew install jq

# Verify installation
jq --version
```

### "Not a git repository"

**Problem:** You're not in a git repository

**Solution:**
```bash
# Initialize git in current directory
git init

# Verify
git status
```

### "command not found: ralph-run"

**Problem:** spec-and-loop npm bin directory not in PATH

**Solution:**
```bash
# Add npm global bin directory to PATH
echo 'export PATH="$PATH:$(npm root -g)/.bin"' >> ~/.bashrc
# Or for zsh:
echo 'export PATH="$PATH:$(npm root -g)/.bin"' >> ~/.zshrc

# Reload shell
source ~/.bashrc
# or
source ~/.zshrc

# Verify
ralph-run --help
```

### "Internal mini Ralph runtime not found"

**Problem:** spec-and-loop installation is incomplete or node is missing

**Solution:**
```bash
# Ensure spec-and-loop is properly installed
npm uninstall -g spec-and-loop
npm install -g spec-and-loop

# Ensure Node.js is installed (version 24.0.0 or higher)
node --version

# If node is not installed, install from https://nodejs.org
```

### "OpenSpec changes directory not found"

**Problem:** OpenSpec has not been initialized or no changes exist

**Solution:**
```bash
# Initialize OpenSpec
openspec init

# Create a new change
openspec new change my-feature

# Verify directory exists
ls -la openspec/changes/
```

### "No changes found with tasks.md"

**Problem:** No OpenSpec changes with tasks files exist

**Solution:**
```bash
# List available changes
openspec list

# Create a new change if needed
openspec new change my-new-feature

# Ensure tasks.md exists in your change directory
ls -la openspec/changes/my-new-feature/tasks.md
```

### "No tasks to execute"

**Problem:** All tasks in tasks.md are already marked complete

**Solution:**
```bash
# Check tasks.md for incomplete tasks
grep "^\- \[ \]" openspec/changes/my-new-feature/tasks.md

# If no incomplete tasks, create a new change
openspec new change another-feature

# Or uncheck a task by editing tasks.md manually:
# Change: - [x] This task is done
# To:     - [ ] This task needs work
```

### "Required artifact not found"

**Problem:** OpenSpec artifacts (proposal.md, design.md, tasks.md) are missing

**Solution:**
```bash
# Check what artifacts exist in your change directory
ls -la openspec/changes/my-new-feature/

# Create missing artifacts manually or use openspec new change
openspec new change my-new-feature

# Or manually create the required files:
# - openspec/changes/my-new-feature/proposal.md
# - openspec/changes/my-new-feature/design.md
# - openspec/changes/my-new-feature/specs/spec-name/spec.md
# - openspec/changes/my-new-feature/tasks.md
```

### "Required directory not found: specs/"

**Problem:** The specs directory is missing from your change

**Solution:**
```bash
# Create the specs directory
mkdir -p openspec/changes/my-new-feature/specs

# Create at least one spec file
mkdir -p openspec/changes/my-new-feature/specs/main-feature
echo "# Main Feature Spec" > openspec/changes/my-new-feature/specs/main-feature/spec.md

# Verify
ls -la openspec/changes/my-new-feature/specs/
```

### "opencode CLI not found"

**Problem:** opencode is not installed globally

**Solution:**
```bash
# Install opencode
npm install -g opencode-ai

# Verify installation
opencode --version

# Add to PATH if needed
export PATH="$PATH:$(npm root -g)/.bin"
```

### "Node.js version too old"

**Problem:** Node.js version is below the required version (24.0.0+)

**Solution:**
```bash
# Check current Node.js version
node --version

# If version is below 24.0.0, upgrade Node.js:
# Using nvm (recommended):
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install 24
nvm use 24

# Or install from https://nodejs.org
```

### "Project not ralphified"

**Problem:** Running `ralph-run --change <name>` shows a warning that the project is not ralphified, or artifacts are missing Ralph-friendly structure.

**Solution:**
```bash
# Run ralphify init to configure the project (run once after openspec init)
ralph-run init

# Verify ralphification succeeded
ralph-run --status
```

This sets up Ralph-friendly rules in `openspec/config.yaml` and `AGENTS.md`. Run it once per project after `openspec init`.

### "npm: command not found"

**Problem:** npm is not installed or not in PATH

**Solution:**
```bash
# npm comes with Node.js. Install Node.js from https://nodejs.org

# After installing Node.js, verify:
npm --version
node --version

# If still not found, restart your terminal or add to PATH
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
- Review [OPENSPEC-RALPH-BP.md](./OPENSPEC-RALPH-BP.md), [OPENSPEC-RALPH-WIGGUM-BOTW.md](./OPENSPEC-RALPH-WIGGUM-BOTW.md), and [RALPH-METHODOLOGY-ASSESSMENT.md](./RALPH-METHODOLOGY-ASSESSMENT.md) for methodology details

Happy coding!
