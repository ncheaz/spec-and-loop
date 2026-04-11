## MODIFIED Requirements

### Requirement: Capture errors from failed task executions
The system SHALL capture and store error output (stderr and stdout) from failed opencode executions in `.ralph/errors.md` via the `lib/mini-ralph/errors.js` module, with entries structured as markdown with metadata headers.

#### Scenario: Error capture on task failure
- **WHEN** opencode exits with a non-zero status code
- **THEN** the system captures the full stderr and stdout output
- **AND** the system writes the error output to `.ralph/errors.md` via `errors.append()`
- **AND** each error entry includes a timestamp (ISO 8601 format), iteration number, task description, exit code, stderr, and stdout
- **AND** errors are appended to `.ralph/errors.md` (preserving history)

### Requirement: Include previous errors in task execution context
The system SHALL include errors from `.ralph/errors.md` in the iteration prompt for subsequent task executions, injected via the `## Recent Loop Signals` section enhanced with error output.

#### Scenario: Error context inclusion in prompt
- **WHEN** generating the prompt for a task execution and prior iterations have failed
- **THEN** the system reads `.ralph/errors.md` via `errors.read()` (limited to the last 3 entries)
- **AND** the system includes relevant error entries in the `## Recent Loop Signals` section
- **AND** the system truncates individual stderr entries to 2000 characters and stdout to 500 characters
- **AND** the system structures the error information to guide the AI agent on what to avoid or fix

### Requirement: Maintain error history across script invocations
The system SHALL preserve `.ralph/errors.md` across multiple script invocations to maintain error history for context.

#### Scenario: Error history persistence
- **WHEN** the ralph-run script is run multiple times
- **THEN** the `.ralph/errors.md` file from the previous run is preserved
- **AND** new errors are appended to the existing error log
- **AND** the system can reference historical errors when generating task context
- **AND** the system provides an option to clear error history on successful completion

### Requirement: Clean up error history on successful completion
The system SHALL archive and then clear `.ralph/errors.md` when all tasks complete successfully. On incomplete exit (max_iterations reached or interruption), errors SHALL be preserved for the next run.

#### Scenario: Error cleanup on completion
- **WHEN** all tasks in tasks.md are marked as complete
- **THEN** the system archives `.ralph/errors.md` to a timestamped file via `errors.archive()`
- **AND** the system removes `.ralph/errors.md` via `errors.clear()`
- **AND** the system logs a message indicating that error history has been archived and cleared

#### Scenario: Errors preserved on incomplete exit
- **WHEN** the loop exits without completing all tasks (max_iterations reached or interruption)
- **THEN** `.ralph/errors.md` is NOT archived or cleared
- **AND** error history persists so a resumed run can reference prior failures

### Requirement: Structure error entries for easy parsing
The system SHALL structure error entries in `.ralph/errors.md` using a consistent markdown format that includes metadata for filtering and reference.

#### Scenario: Error entry formatting
- **WHEN** writing an error entry to `.ralph/errors.md`
- **THEN** the entry begins with a `---` delimiter
- **AND** the entry includes a header with timestamp (ISO 8601 format)
- **AND** the entry includes the iteration number
- **AND** the entry includes the task identifier and task description
- **AND** the entry includes the exit code
- **AND** the entry includes the full stderr output (if present) under a `### stderr` heading
- **AND** the entry includes the full stdout output (if present) under a `### stdout` heading
- **AND** entries are separated by a clear delimiter (`---`) for easy parsing
