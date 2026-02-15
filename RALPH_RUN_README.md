# ralph-run.sh - OpenSpec + open-ralph-wiggum Integration

This script integrates OpenSpec's structured specification workflow with open-ralph-wiggum's iterative development loop.

## Overview

`ralph-run.sh` automates the execution of OpenSpec tasks by:
- Generating a PRD from OpenSpec artifacts
- Executing each task using the `opencode` CLI tool
- Creating git commits after each successful task
- Tracking task completion in both OpenSpec and ralph systems
- Propagating errors to guide subsequent task implementations

## Installation

1. Ensure you have the following prerequisites:
   - Bash 4.0+
   - Git
   - OpenSpec CLI (openspec)
   - opencode CLI (agentic coding assistant)
   - jq (for JSON processing)

2. Make the script executable:
   ```bash
   chmod +x ralph-run.sh
   ```

## Usage

### Basic Usage

```bash
# Auto-detect and execute the most recently modified change
./ralph-run.sh

# Execute a specific change
./ralph-run.sh --change my-feature

# Run with verbose output for debugging
./ralph-run.sh --verbose

# Show help
./ralph-run.sh --help
```

### Command-Line Options

- `--change <name>`: Specify the OpenSpec change to execute (default: auto-detect)
- `--verbose, -v`: Enable verbose mode for debugging
- `--help, -h`: Show help message

## Workflow

1. **Create OpenSpec Change** (using standard OpenSpec workflow)
   ```bash
   openspec new my-feature
   openspec continue
   # ... create all artifacts (proposal, specs, design, tasks)
   ```

2. **Run ralph-run.sh**
   ```bash
   ./ralph-run.sh --change my-feature
   ```

3. **Script Execution**
   - Validates OpenSpec artifacts
   - Generates PRD from artifacts
   - Parses tasks from tasks.md
   - Executes each task in order using opencode
   - Creates git commits after each successful task
   - Updates task checkboxes in tasks.md
   - Updates ralph tracking in .ralph/tracking.json

4. **Completion**
   - All tasks marked complete
   - All commits created
   - Errors cleared from .ralph/errors.md

## Files and Directories

### OpenSpec Artifacts

```
openspec/changes/<change-name>/
├── proposal.md          # Change proposal
├── design.md            # Design decisions
├── tasks.md             # Implementation tasks
└── specs/               # Capability specifications
    ├── capability1/
    │   └── spec.md
    └── capability2/
        └── spec.md
```

### Ralph Working Directory

```
openspec/changes/<change-name>/.ralph/
├── PRD.md                    # Generated PRD from OpenSpec artifacts
├── tracking.json             # Task tracking state
├── errors.md                 # Error history from failed tasks
├── errors_<timestamp>.md      # Archived error history
├── context-injections.md      # Context injection log
└── .context_injection        # Pending context injection
```

## Task Execution Details

### Task Context

Each task is executed with full context:
- Task description
- Proposal summary (Why, What Changes)
- Relevant specifications
- Design decisions
- Git history (recent commits)
- Previous errors (if any)
- Injected context (if provided)

### Error Handling

- Errors are captured from stderr/stdout
- Errors are logged to .ralph/errors.md
- Errors are included in context for subsequent tasks
- On successful completion, errors are cleared

### Git Commits

- Each successful task creates a git commit
- Commit message = task description
- All changes from task execution are included
- Commits provide granular history for debugging

### Task Tracking

Bidirectional tracking between OpenSpec and ralph:
- tasks.md checkboxes updated on completion
- .ralph/tracking.json updated with task status
- Atomic updates (both or neither)

## Script Idempotency

The script is idempotent and can be run multiple times safely:

- Automatically detects incomplete tasks
- Resumes from first unchecked task
- Preserves state across invocations
- No duplicate work on completed tasks

## Context Injection

You can inject additional context during execution:

1. Create context file: `.ralph/.context_injection`
2. Script detects and uses context in next opencode invocation
3. Context is logged to `.ralph/context-injections.md`
4. Context is included in task prompt

Example:
```bash
echo "Please use TypeScript instead of JavaScript" > .ralph/.context_injection
```

## Error Recovery

If the script encounters an error:

1. Check `.ralph/errors.md` for details
2. Fix the issue manually if needed
3. Run script again to resume

The script will:
- Skip completed tasks
- Include error context in prompt
- Continue from where it left off

## Examples

### Example 1: Execute Recent Change

```bash
# Auto-detect and execute
./ralph-run.sh

# Output:
# [INFO] Auto-detected change: add-auth
# [INFO] All OpenSpec artifacts validated
# [INFO] PRD generation complete
# [INFO] Found 10 tasks to execute
# [INFO] Starting task execution loop...
# [INFO] Executing task 1/10: Create user authentication model
# ...
```

### Example 2: Execute Specific Change with Verbose Output

```bash
./ralph-run.sh --change refactor-api --verbose

# Output includes detailed internal state for debugging
```

### Example 3: Resume After Interruption

```bash
# Run script (interrupted at task 5)
./ralph-run.sh --change my-feature
# ...interrupted...

# Resume - picks up at task 6
./ralph-run.sh --change my-feature
# [INFO] Found 5 tasks to execute (skips 1-5)
```

### Example 4: Context Injection

```bash
# Start execution
./ralph-run.sh --change my-feature &

# Inject context
echo "Use PostgreSQL instead of MySQL" > .ralph/.context_injection

# Next opencode invocation will include this context
```

## Troubleshooting

### Script fails: "Not a git repository"

Ensure you're in a git repository:
```bash
git init
```

### Script fails: "Required artifact not found"

Ensure your OpenSpec change has all required artifacts:
```bash
ls openspec/changes/<name>/
# Should have: proposal.md, design.md, tasks.md, specs/
```

### opencode CLI not found

Install opencode:
```bash
# See opencode documentation for installation instructions
```

### Tasks.md modified during execution

Script will warn and offer options:
1. Continue with original state
2. Re-read tasks.md and continue
3. Abort

### No tasks to execute

All tasks are already complete. Check tasks.md:
```bash
grep "^\- \[ \]" openspec/changes/<name>/tasks.md
# Should return nothing if all tasks are complete
```

## Advanced Usage

### Custom Error History Limit

Edit the script to change error limit in read_errors function.

### Skip Git Commits

Comment out `create_git_commit` call in execute_task_loop function.

### Custom Prompt Generation

Modify `generate_opencode_prompt` function to include additional context.

## Integration with CI/CD

```yaml
# Example GitLab CI
test:
  script:
    - ./ralph-run.sh --change $CI_COMMIT_REF_SLUG
  artifacts:
    paths:
      - openspec/changes/.ralph/
```

## Contributing

To extend ralph-run.sh:

1. Add new functions following existing patterns
2. Use log_verbose for debugging output
3. Use log_error for error messages
4. Update this documentation

## License

See OpenSpec project license.

## See Also

- [OpenSpec Documentation](https://openspec.ai)
- [open-ralph-wiggum](https://github.com/Th0rgal/open-ralph-wiggum)
- [opencode CLI](https://opencode.ai)
