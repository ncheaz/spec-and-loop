## MODIFIED Requirements

### Requirement: Execute incomplete tasks via opencode CLI tool
The system SHALL execute each incomplete task from tasks.md using the `opencode` CLI tool (agentic coding assistant), passing the full openspec context including project state, specs, tasks, ralph loop context, and any captured error output from prior failed iterations.

#### Scenario: Task execution with opencode CLI
- **WHEN** the ralph loop encounters an incomplete task
- **THEN** the system runs `opencode` in CLI mode with a prompt containing the task context
- **AND** the system provides all standard openspec context (proposal, specs, design, task description)
- **AND** the system provides ralph loop context (errors from previous iterations, git history summary, task progress)
- **AND** the system captures stdout and stderr from the opencode execution
- **AND** the system waits for the opencode command to complete before proceeding

### Requirement: Generate prompt for opencode with full context
The system SHALL generate a prompt for opencode that includes the task description, relevant specification requirements, proposal summary, design decisions, git history, and any errors from previous iterations (with actual error output, not just exit codes).

#### Scenario: Prompt generation for opencode
- **WHEN** preparing to execute a task
- **THEN** the prompt includes the full text of the task description from tasks.md
- **AND** the prompt includes the relevant requirement sections from the applicable spec files
- **AND** the prompt includes a summary of the proposal's Why and What Changes sections
- **AND** the prompt includes relevant design decisions from design.md
- **AND** the prompt includes a summary of recent git commits (git history)
- **AND** the prompt includes any error output from previous task executions read from `.ralph/errors.md` via `errors.read()`, injected through the `## Recent Loop Signals` section
- **AND** the prompt is structured to guide opencode to implement the task with full context

### Requirement: Handle opencode errors gracefully
The system SHALL capture and handle errors from opencode execution, preserving error output for context propagation to subsequent tasks via the errors module.

#### Scenario: Opencode error handling
- **WHEN** opencode exits with a non-zero status code
- **THEN** the system captures the full stderr and stdout output
- **AND** the system writes the error output to `.ralph/errors.md` via `errors.append()` with a timestamp, iteration number, and task identifier
- **AND** the system does not mark the task as complete in tasks.md
- **AND** the system proceeds to the next iteration where the error content is available in the prompt via `_buildIterationFeedback()`
