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
