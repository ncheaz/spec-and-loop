## Context

OpenSpec provides a structured specification workflow (proposal → specs → design → tasks) but lacks an iterative execution loop. open-ralph-wiggum (https://github.com/Th0rgal/open-ralph-wiggum) provides a proven iterative development loop with commits per task, error tracking, and context injection, but operates on PRD format. Users currently have to manually bridge these two systems.

The integration must be seamless: users should follow the standard OpenSpec workflow they already know, then run a single command to execute with full ralph features.

**Constraints:**
- Must preserve all open-ralph-wiggum features (commits per task, iteration feedback, context injection, task tracking)
- OpenSpec remains the source of truth for specification
- Minimal user-facing complexity
- No manual sync steps required

## Goals / Non-Goals

**Goals:**
- Single command execution after completing OpenSpec artifacts
- Automatic bidirectional task tracking between OpenSpec and ralph
- Transparent PRD generation for ralph consumption
- Automatic opencode CLI execution within ralph loop context with full openspec context
- Error propagation to inform subsequent task iterations
- Full compatibility with open-ralph-wiggum's feature set (commits per task, context injection, iteration feedback)

**Non-Goals:**
- Modifying open-ralph-wiggum's core behavior or API
- Replacing ralph's PRD-based approach (we adapt to it)
- Manual task management or sync steps
- User-visible PRD file manipulation

## Decisions

### 1. Single Bash Script Orchestrator
Use a single bash script (`ralph-run.sh`) as the entry point that orchestrates the entire workflow. This provides the simplest user experience: one command after completing openspec artifacts.

**Rationale:**
- Bash is ideal for orchestrating CLI tools, git operations, and file I/O
- Easy to package and distribute
- No runtime dependencies beyond bash + standard CLI tools

### 2. Auto-Detect or Explicit Change Selection
The script accepts an optional `--change` flag. If omitted, it auto-detects the most recently modified change with a `tasks.md` file.

**Rationale:**
- Reduces friction for single-change workflows (most common case)
- Provides explicit control for users with multiple active changes
- Simple heuristic: check `openspec/changes/*/tasks.md` and pick by modification time

### 3. Internal .ralph Working Directory
Store all ralph-specific files (PRD.md, tracking state, error logs) in `.ralph/` subdirectory within the change directory.

**Rationale:**
- Keeps all change-related files together
- Hides ralph internals from users (they don't need to see PRD.md)
- Easy to clean up (just delete .ralph/)
- Prevents conflicts with openspec artifact files

### 4. PRD Generation as Pre-Processing Step
Before starting the ralph loop, generate `PRD.md` from OpenSpec artifacts: concatenate proposal.md, specs/*/*.md, design.md with minimal formatting.

**Rationale:**
- ralph expects PRD format; we generate it automatically
- Simple transformation: combine OpenSpec artifacts with section headers
- Users never need to interact with the generated PRD directly
- Ensures PRD stays in sync with OpenSpec (regenerated each run)

### 5. Task Execution via opencode CLI
For each incomplete task, create a prompt that includes: task description, relevant spec context, proposal summary, design decisions, git history, previous errors, and any injected context. Run `opencode` CLI tool with this prompt.

**Rationale:**
- opencode is the agentic coding tool designed for this type of work
- Full context injection (openspec + ralph loop) provides opencode with everything needed
- Preserves all openspec context (proposal, specs, design, tasks)
- Captures ralph loop features (git history, errors from prior iterations, context injection)
- Temp prompts avoid modifying task descriptions in tasks.md
- Context injection happens at runtime via ralph's mechanism

**Alternatives considered:**
- Direct task description as-is: Doesn't provide enough context
- Modify tasks.md to include context: Breaks openspec's clean task format
- Use openspec apply: Not designed for iterative coding loops

### 6. Bidirectional Task Tracking via Direct File Updates
After each task completes, update both `tasks.md` (checkbox status) and ralph's internal tracking (stored in `.ralph/tracking.json`). Use simple mapping by task index.

**Rationale:**
- Simplest approach: read, update, write both files
- No complex state synchronization logic needed
- Task order is deterministic (from tasks.md)
- Changes are atomic (update both or rollback)

### 7. Error Propagation via .ralph/errors.md
Capture stderr/stdout from failed task executions in `.ralph/errors.md`. Append to prompt context for subsequent tasks.

**Rationale:**
- Simple file-based approach
- Errors persist across script invocations (useful for resuming)
- Easy to read and debug
- Automatic cleanup on successful completion

**Alternatives considered:**
- In-memory error tracking: Lost across invocations
- Git history: Too noisy, harder to query
- Database: Overkill for this use case

### 8. Git Commits Per Task (ralph Feature)
After each successful task completion, create a git commit with the task description as the commit message.

**Rationale:**
- Core ralph feature: commit per task provides granular history
- Matches ralph's expected behavior
- Useful for debugging and rollback
- Uses standard git operations

### 9. Script Idempotency
The script can be run multiple times safely. It picks up where it left off based on unchecked tasks in `tasks.md`.

**Rationale:**
- Users can stop and resume
- Errors don't require manual intervention to retry
- Script checks state before each task

### 10. No Modification to open-ralph-wiggum
The integration adapts to ralph's existing API and behavior without requiring changes to the ralph codebase.

**Rationale:**
- Keeps integration isolated and maintainable
- Can leverage ralph updates without breaking
- No dependency on ralph internals beyond public interface

## Risks / Trade-offs

**Risk: PRD generation may not perfectly match ralph's expectations**
→ Mitigation: Use simple, well-structured format (headers + content). Test with sample changes.

**Risk: Task index mapping between openspec and ralph may drift**
→ Mitigation: Use stable identifier (task line number or ID) instead of index. Re-validate on each run.

**Risk: opencode may fail or behave differently than expected**
→ Mitigation: Capture full output in error log. Provide clear error messages to user. Fallback to manual intervention if needed.

**Risk: Git commits may conflict if user makes manual changes**
→ Mitigation: Check for uncommitted changes before starting. Warn user. Add `--force` flag to override.

**Risk: Bidirectional sync race conditions if user modifies tasks.md during execution**
→ Mitigation: Read tasks.md once at start. Detect modifications and warn user.

**Trade-off: Simplicity vs. Robustness**
We prioritize simplicity (single script, minimal config) over exhaustive edge case handling. The integration assumes users follow the standard openspec workflow.

**Trade-off: Automation vs. Transparency**
We hide ralph internals (PRD, tracking) to simplify user experience, but this may make debugging harder if things go wrong. Mitigation: Provide `--verbose` flag to show internal state.

## Migration Plan

1. Script setup: Clone open-ralph-wiggum to a known location (e.g., `.ralph/ralph/`)
2. User creates openspec change using standard workflow
3. User runs: `./ralph-run.sh [--change <name>]`
4. Script executes the loop until all tasks complete
5. On completion, user can verify implementation and run tests

**Rollback strategy:**
- Delete `.ralph/` directory to reset ralph state
- Git reset to before integration commits
- Re-run script to resume

## Open Questions

None identified. The design leverages existing patterns from both OpenSpec and open-ralph-wiggum, with well-defined integration points.
