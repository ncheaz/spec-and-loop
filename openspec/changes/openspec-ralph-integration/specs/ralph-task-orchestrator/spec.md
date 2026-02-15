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
