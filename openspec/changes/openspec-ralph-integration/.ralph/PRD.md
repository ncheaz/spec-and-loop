# Product Requirements Document

*Generated from OpenSpec artifacts*

## Proposal

## Why

OpenSpec provides an excellent structured specification workflow for defining what and why to build, but lacks an iterative execution loop. open-ralph-wiggum provides a powerful iterative development loop with commits per task, error tracking, and context injection, but it operates on PRD format instead of OpenSpec specs. We need to combine both systems: use OpenSpec for specification creation and structure, then leverage open-ralph-wiggum's proven execution loop while maintaining OpenSpec as the source of truth.

## What Changes

- Create a bash script that integrates OpenSpec with open-ralph-wiggum from https://github.com/Th0rgal/open-ralph-wiggum
- Implement OpenSpec → PRD sync to generate PRD format from OpenSpec specs for ralph consumption
- Add bidirectional task tracking: task checkboxes updated in both OpenSpec and open-ralph-wiggum systems simultaneously
- Implement automatic `opencode` CLI execution for incomplete tasks within the ralph loop using temporary prompts that bridge ralph loop requests with opencode context
- Add error propagation: problems from prior iterations are fed as context to the next task
- Preserve all open-ralph-wiggum features: commits per task, iteration feedback, task tracking, context injection

## Capabilities

### New Capabilities
- `openspec-prd-sync`: Convert OpenSpec specs to PRD format for consumption by open-ralph-wiggum, maintaining sync between both formats
- `ralph-task-orchestrator`: Orchestrate task execution using `opencode` CLI within the ralph loop, with temporary prompt bridging
- `bidirectional-task-tracking`: Synchronize task checkbox status between OpenSpec tasks and open-ralph-wiggum task tracking
- `error-context-propagation`: Propagate errors and issues from prior iterations as context to subsequent tasks

### Modified Capabilities

## Impact

- New bash script: the main integration tool that drives the OpenSpec-ralph workflow
- Wrapped `opencode` CLI tool: executed automatically within ralph loop context with full openspec context
- New sync utilities for bidirectional OpenSpec ↔ PRD conversion
- External dependency: open-ralph-wiggum from GitHub (will be cloned/fetched by the script)
- OpenSpec tasks.md will be read and updated in sync with ralph execution
- Generated PRD files for ralph consumption (temporary or cached)

## Specifications

bidirectional-task-tracking/spec.md
## ADDED Requirements

### Requirement: Synchronize task status between OpenSpec and ralph tracking
The system SHALL update task checkbox status in both tasks.md and ralph's internal tracking system after each task completes.

#### Scenario: Bidirectional task completion update
- **WHEN** a task completes successfully
- **THEN** the system updates the task checkbox in tasks.md from `[ ]` to `[x]`
- **AND** the system updates the ralph tracking state in .ralph/tracking.json to mark the task as complete
- **AND** both updates are performed atomically (either both succeed or both fail)
- **AND** the system verifies that both files were updated successfully

### Requirement: Read tasks.md to determine task order
The system SHALL read tasks.md at the start of execution to determine the list and order of tasks to execute.

#### Scenario: Task list initialization
- **WHEN** the ralph-run.sh script starts
- **THEN** the system reads tasks.md from the change directory
- **AND** the system parses all task entries to identify incomplete (unchecked) tasks
- **AND** the system determines the execution order based on the order in tasks.md
- **AND** the system uses this task list for tracking throughout execution

### Requirement: Map tasks between OpenSpec and ralph using task identifier
The system SHALL use a stable task identifier (such as task line number or explicit task ID) to map tasks between OpenSpec's tasks.md and ralph's tracking system.

#### Scenario: Task identification and mapping
- **WHEN** tracking task status
- **THEN** the system assigns a stable identifier to each task (e.g., line number from tasks.md)
- **AND** this identifier is used consistently between tasks.md updates and ralph tracking updates
- **AND** the system can reliably map between the two tracking systems using this identifier
- **AND** the mapping remains valid even if tasks.md is modified between runs (for new tasks only)

### Requirement: Detect and handle concurrent modifications to tasks.md
The system SHALL detect if tasks.md has been modified during script execution and warn the user before proceeding.

#### Scenario: Concurrent modification detection
- **WHEN** the system prepares to update tasks.md
- **THEN** the system compares the current modification time or checksum with the state at script start
- **AND** if the file has been modified, the system warns the user
- **AND** the system offers to halt execution or continue with manual confirmation
- **AND** if proceeding with modifications, the system re-reads tasks.md to get the current state

### Requirement: Initialize ralph tracking state if not present
The system SHALL create .ralph/tracking.json with initial state if it does not exist.

#### Scenario: Tracking state initialization
- **WHEN** the ralph-run.sh script starts
- **THEN** the system checks for .ralph/tracking.json
- **AND** if the file does not exist, the system creates it with an empty tracking state
- **AND** the system initializes tracking entries for all tasks from tasks.md with status "pending"

error-context-propagation/spec.md
## ADDED Requirements

### Requirement: Capture errors from failed task executions
The system SHALL capture and store error output (stderr and stdout) from failed opencode executions in .ralph/errors.md.

#### Scenario: Error capture on task failure
- **WHEN** opencode exits with a non-zero status code
- **THEN** the system captures the full stderr and stdout output
- **AND** the system writes the error output to .ralph/errors.md
- **AND** each error entry includes a timestamp, task identifier, and the task description
- **AND** errors are appended to .ralph/errors.md (preserving history)

### Requirement: Include previous errors in task execution context
The system SHALL include errors from .ralph/errors.md in the temporary prompt for subsequent task executions.

#### Scenario: Error context inclusion in prompt
- **WHEN** generating a temporary prompt for task execution
- **THEN** the system reads .ralph/errors.md if it exists
- **AND** the system includes relevant error entries in the temporary prompt
- **AND** the system structures the error information to guide the AI agent on what to avoid or fix
- **AND** the system filters errors to include only those from the current session or recent failures

### Requirement: Include git history in task execution context
The system SHALL include a summary of git commit history in the opencode prompt to provide context about prior work and changes.

#### Scenario: Git history context inclusion in prompt
- **WHEN** generating a temporary prompt for task execution
- **THEN** the system runs `git log` to retrieve recent commit history
- **AND** the system includes a summary of the last N commits (configurable, default 10) in the prompt
- **AND** the summary includes commit messages, authors, and timestamps
- **AND** the git history is structured to help opencode understand what has been implemented
- **AND** the system filters git history to exclude merges if desired

### Requirement: Maintain error history across script invocations
The system SHALL preserve .ralph/errors.md across multiple script invocations to maintain error history for context.

#### Scenario: Error history persistence
- **WHEN** the ralph-run.sh script is run multiple times
- **THEN** the .ralph/errors.md file from the previous run is preserved
- **AND** new errors are appended to the existing error log
- **AND** the system can reference historical errors when generating task context
- **AND** the system provides an option to clear error history on successful completion

### Requirement: Clean up error history on successful completion
The system SHALL clear .ralph/errors.md when all tasks complete successfully.

#### Scenario: Error cleanup on completion
- **WHEN** all tasks in tasks.md are marked as complete
- **THEN** the system verifies that the last task completed successfully
- **AND** the system removes .ralph/errors.md or truncates it to empty
- **AND** the system logs a message indicating that error history has been cleared
- **AND** the system may archive error history to a timestamped file for reference

### Requirement: Structure error entries for easy parsing
The system SHALL structure error entries in .ralph/errors.md using a consistent format that includes metadata for filtering and reference.

#### Scenario: Error entry formatting
- **WHEN** writing an error entry to .ralph/errors.md
- **THEN** the entry includes a header with timestamp (ISO 8601 format)
- **AND** the entry includes the task identifier and task description
- **AND** the entry includes the full stderr output (if present)
- **AND** the entry includes the full stdout output (if present)
- **AND** entries are separated by a clear delimiter for easy parsing

openspec-prd-sync/spec.md
## ADDED Requirements

### Requirement: Convert OpenSpec artifacts to PRD format
The system SHALL convert OpenSpec artifacts (proposal.md, specs/*/*.md, design.md) into a PRD format consumable by open-ralph-wiggum.

#### Scenario: Successful PRD generation
- **WHEN** the ralph-run.sh script is run on a change with all required artifacts
- **THEN** the system generates a PRD.md file containing structured sections from proposal, specs, and design
- **AND** the PRD.md follows a format compatible with open-ralph-wiggum's parsing expectations
- **AND** the generated PRD.md includes the Why, What Changes, Capabilities sections from proposal.md
- **AND** the generated PRD.md includes all requirement details from specs/*/spec.md files
- **AND** the generated PRD.md includes the Context, Goals, Decisions sections from design.md

### Requirement: Store generated PRD in internal directory
The system SHALL store the generated PRD.md file in the .ralph/ subdirectory within the change directory.

#### Scenario: PRD stored in internal directory
- **WHEN** PRD generation completes
- **THEN** the PRD.md file is written to `openspec/changes/<change-name>/.ralph/PRD.md`
- **AND** the .ralph/ directory is created if it does not exist
- **AND** the user is not required to interact with or modify the PRD.md file

### Requirement: Regenerate PRD on each script execution
The system SHALL regenerate the PRD.md file each time the ralph-run.sh script is run to ensure it reflects the latest OpenSpec artifacts.

#### Scenario: PRD regeneration
- **WHEN** the ralph-run.sh script is run multiple times
- **THEN** the PRD.md is regenerated from the current state of proposal.md, specs/*/*.md, and design.md
- **AND** any changes made to OpenSpec artifacts between runs are reflected in the regenerated PRD.md
- **AND** the previous PRD.md is overwritten

### Requirement: Maintain section structure in PRD conversion
The system SHALL preserve the hierarchical structure and headers from OpenSpec artifacts when converting to PRD format.

#### Scenario: Section structure preserved
- **WHEN** converting OpenSpec artifacts to PRD format
- **THEN** top-level headers (##) from proposal, design, and spec files become top-level headers in PRD.md
- **AND** requirement sections (###) become subsection headers in PRD.md
- **AND** scenario sections (####) are included with their WHEN/THEN format preserved
- **AND** the logical flow and organization of content is maintained

ralph-task-orchestrator/spec.md
## ADDED Requirements

### Requirement: Execute incomplete tasks via opencode CLI tool
The system SHALL execute each incomplete task from tasks.md using the `opencode` CLI tool (agentic coding assistant), passing the full openspec context including project state, specs, tasks, and ralph loop context.

#### Scenario: Task execution with opencode CLI
- **WHEN** the ralph loop encounters an incomplete task
- **THEN** the system runs `opencode` in CLI mode with a prompt containing the task context
- **AND** the system provides all standard openspec context (proposal, specs, design, task description)
- **AND** the system provides ralph loop context (errors from previous iterations, git history summary, task progress)
- **AND** the system captures stdout and stderr from the opencode execution
- **AND** the system waits for the opencode command to complete before proceeding

### Requirement: Generate prompt for opencode with full context
The system SHALL generate a prompt for opencode that includes the task description, relevant specification requirements, proposal summary, design decisions, git history, and any errors from previous iterations.

#### Scenario: Prompt generation for opencode
- **WHEN** preparing to execute a task
- **THEN** the prompt includes the full text of the task description from tasks.md
- **AND** the prompt includes the relevant requirement sections from the applicable spec files
- **AND** the prompt includes a summary of the proposal's Why and What Changes sections
- **AND** the prompt includes relevant design decisions from design.md
- **AND** the prompt includes a summary of recent git commits (git history)
- **AND** the prompt includes any error output from previous task executions stored in .ralph/errors.md
- **AND** the prompt is structured to guide opencode to implement the task with full context

### Requirement: Execute tasks in sequential order
The system SHALL execute tasks from tasks.md in the order they appear, skipping tasks that are already marked as complete (checked).

#### Scenario: Sequential task execution
- **WHEN** the ralph loop processes tasks.md
- **THEN** tasks are processed in the order they appear in the file
- **AND** tasks with checked checkboxes are skipped
- **AND** the system proceeds to the next unchecked task after completing the current task
- **AND** the system stops execution when all tasks are complete

### Requirement: Handle opencode errors gracefully
The system SHALL capture and handle errors from opencode execution, preserving error output for context propagation to subsequent tasks.

#### Scenario: Opencode error handling
- **WHEN** opencode exits with a non-zero status code
- **THEN** the system captures the full stderr and stdout output
- **AND** the system writes the error output to .ralph/errors.md with a timestamp and task identifier
- **AND** the system does not mark the task as complete in tasks.md
- **AND** the system proceeds to the next task (or re-queues the task for retry depending on ralph configuration)

### Requirement: Create git commit after successful task completion
The system SHALL create a git commit after each successful task execution, using the task description as the commit message.

#### Scenario: Git commit after task completion
- **WHEN** opencode completes successfully with exit code 0
- **THEN** the system creates a git commit
- **AND** the commit message is the task description from tasks.md
- **AND** the commit includes all changes made during task execution
- **AND** the system marks the task checkbox in tasks.md as checked
- **AND** the system updates the ralph tracking state to mark the task as complete

### Requirement: Support context injection during task execution
The system SHALL support injecting additional context into the opencode prompt during task execution, leveraging open-ralph-wiggum's context injection feature.

#### Scenario: Context injection during execution
- **WHEN** a user wants to inject additional context during a running task execution
- **THEN** the system accepts a context injection command or signal
- **AND** the system pauses or queues the context for the next opencode invocation
- **AND** the injected context is included in the prompt for the current or next opencode execution
- **AND** the system logs the context injection for traceability
- **AND** the injected context is preserved in .ralph/context-injections.md for reference



## Design

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
