## ADDED Requirements

### Requirement: Capture stderr and stdout from failed opencode executions
The invoker SHALL return `stderr` as a field in its result object alongside `stdout`, `exitCode`, `toolUsage`, and `filesChanged`, so that callers have access to the full process output.

#### Scenario: stderr returned from successful invocation
- **WHEN** opencode exits with code 0
- **THEN** the result object includes a `stderr` field containing any stderr output from the process
- **AND** the `stdout` field contains the standard output as before
- **AND** all other fields (`exitCode`, `toolUsage`, `filesChanged`) remain unchanged

#### Scenario: stderr returned from failed invocation
- **WHEN** opencode exits with a non-zero code
- **THEN** the result object includes a `stderr` field containing the stderr output
- **AND** the `stdout` field contains the standard output
- **AND** the `exitCode` field reflects the non-zero exit code

### Requirement: Persist error entries to errors.md on non-zero exit
The runner SHALL capture the full stderr and stdout from failed opencode executions and persist structured error entries to `.ralph/errors.md` via the errors module.

#### Scenario: Error entry written on non-zero exit code
- **WHEN** an opencode invocation completes with exit code !== 0
- **THEN** the runner calls `errors.append()` with an entry containing: timestamp (ISO 8601), iteration number, current task description, exit code, stderr content, and stdout content
- **AND** the entry is appended to `.ralph/errors.md` (preserving any existing entries)

#### Scenario: No error entry written on successful exit
- **WHEN** an opencode invocation completes with exit code 0
- **THEN** the runner does NOT write an error entry to `.ralph/errors.md`

### Requirement: Append structured error entries with metadata
The errors module SHALL append error entries to `.ralph/errors.md` using a consistent markdown format that includes metadata for filtering and reference.

#### Scenario: Error entry formatting
- **WHEN** writing an error entry to `.ralph/errors.md`
- **THEN** the entry begins with a `---` delimiter
- **AND** includes a `Timestamp:` line in ISO 8601 format
- **AND** includes an `Iteration:` line with the iteration number
- **AND** includes a `Task:` line with the current task description (or "N/A" if no task)
- **AND** includes an `Exit Code:` line
- **AND** includes a `### stderr` section with the stderr output
- **AND** includes a `### stdout` section with the stdout output

#### Scenario: Multiple errors accumulate
- **WHEN** multiple iterations fail
- **THEN** each error entry is appended sequentially to `.ralph/errors.md`
- **AND** earlier entries are preserved (not overwritten)

### Requirement: Read recent error entries with configurable limit
The errors module SHALL provide a `read()` function that returns the N most recent error entries from `.ralph/errors.md`.

#### Scenario: Read with limit
- **WHEN** `errors.read(ralphDir, 3)` is called and there are 5 error entries
- **THEN** the function returns the text of the 3 most recent entries
- **AND** entries are returned in chronological order (oldest first)

#### Scenario: Read when no errors file exists
- **WHEN** `errors.read(ralphDir)` is called and `.ralph/errors.md` does not exist
- **THEN** the function returns an empty string

### Requirement: Clear error history
The errors module SHALL provide a `clear()` function that removes `.ralph/errors.md`.

#### Scenario: Clear existing errors
- **WHEN** `errors.clear(ralphDir)` is called and `.ralph/errors.md` exists
- **THEN** the file is deleted

#### Scenario: Clear when no errors file exists
- **WHEN** `errors.clear(ralphDir)` is called and `.ralph/errors.md` does not exist
- **THEN** no error is raised (no-op)

### Requirement: Archive error history before clearing
The errors module SHALL provide an `archive()` function that copies `.ralph/errors.md` to a timestamped archive file before clearing.

#### Scenario: Archive and clear
- **WHEN** `errors.archive(ralphDir)` is called and `.ralph/errors.md` exists
- **THEN** the file is copied to `.ralph/errors_<timestamp>.md` with an ISO-derived timestamp
- **AND** the original `.ralph/errors.md` is NOT deleted (caller must call `clear()` separately)

#### Scenario: Archive when no errors file exists
- **WHEN** `errors.archive(ralphDir)` is called and `.ralph/errors.md` does not exist
- **THEN** the function returns without error (no-op)

### Requirement: Enhance iteration feedback with error content
The runner's `_buildIterationFeedback()` SHALL include actual error output from `.ralph/errors.md` in the feedback section, not just numeric exit codes. Error entries are matched to history entries by iteration number (substring match on `Iteration: <number>` in the error content).

#### Scenario: Feedback includes error output for failed iterations
- **WHEN** recent history contains an iteration with exit code 1
- **AND** `.ralph/errors.md` has a matching error entry (by iteration number) with stderr content
- **THEN** the feedback section includes the stderr content (truncated to 2000 characters) alongside the exit code signal

#### Scenario: Feedback works without error file (backward compatible)
- **WHEN** recent history contains an iteration with exit code 1
- **AND** `.ralph/errors.md` does not exist (e.g., errors module not yet used)
- **THEN** the feedback section falls back to the current behavior (numeric exit code only)

#### Scenario: Error content is truncated
- **WHEN** an error entry has stderr longer than 2000 characters
- **THEN** the feedback section includes only the first 2000 characters with a truncation marker

### Requirement: Clear errors on successful loop completion
The runner SHALL archive and clear `.ralph/errors.md` when all tasks complete successfully.

#### Scenario: Errors archived and cleared on completion
- **WHEN** the loop exits with `completed === true` (all tasks done)
- **AND** `.ralph/errors.md` exists
- **THEN** the runner calls `errors.archive()` to create a timestamped archive
- **AND** the runner calls `errors.clear()` to remove the active error file

#### Scenario: No action when no errors exist on completion
- **WHEN** the loop exits with `completed === true`
- **AND** `.ralph/errors.md` does not exist
- **THEN** no archive or clear operations are performed

#### Scenario: Errors preserved on incomplete loop exit
- **WHEN** the loop exits with `completed === false` (e.g. max_iterations reached)
- **AND** `.ralph/errors.md` exists
- **THEN** the runner does NOT call `errors.archive()` or `errors.clear()`
- **AND** `.ralph/errors.md` persists so the next run can reference prior failures

### Requirement: Error summary in status dashboard
The status dashboard SHALL display an error summary when `.ralph/errors.md` contains entries.

#### Scenario: Error summary displayed
- **WHEN** `ralph-run --status` is called and `.ralph/errors.md` has 2 error entries
- **THEN** the status output includes an `--- Error History ---` section
- **AND** the section shows the count of errors and a preview of the most recent error (first 200 characters)

#### Scenario: No error summary when no errors exist
- **WHEN** `ralph-run --status` is called and `.ralph/errors.md` does not exist
- **THEN** no error summary section is shown
