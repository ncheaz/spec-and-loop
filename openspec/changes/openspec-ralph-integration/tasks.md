## 1. Setup and Infrastructure

- [x] 1.1 Create ralph-run.sh bash script with command-line argument parsing (--change flag, --help, --verbose flags)
- [x] 1.2 Implement auto-detection of most recently modified change with tasks.md file
- [x] 1.3 Create .ralph/ working directory structure within change directory
- [x] 1.4 Add script validation to check for required openspec artifacts (proposal.md, tasks.md, design.md, specs/)
- [x] 1.5 Implement git repository detection and validation
- [x] 1.6 Add error handling and graceful exit with meaningful error messages
- [x] 1.7 Add verbose mode for debugging (--verbose flag to show internal state)

## 2. OpenSpec PRD Sync

- [x] 2.1 Implement function to read and parse openspec artifacts (proposal.md, specs/*/*.md, design.md)
- [x] 2.2 Implement PRD generation function that concatenates openspec artifacts with proper headers
- [x] 2.3 Generate PRD.md with sections from proposal (Why, What Changes, Capabilities)
- [x] 2.4 Generate PRD.md with sections from specs (all requirements and scenarios)
- [x] 2.5 Generate PRD.md with sections from design (Context, Goals, Decisions)
- [x] 2.6 Write PRD.md to .ralph/PRD.md, creating .ralph/ directory if needed
- [x] 2.7 Test PRD generation with sample openspec artifacts to verify structure

## 3. Ralph Task Orchestrator

- [x] 3.1 Implement function to parse tasks.md and extract incomplete (unchecked) tasks in order
- [x] 3.2 Implement git history summary function (get last N commits with messages, authors, timestamps)
- [x] 3.3 Implement context gathering function for opencode prompt (task description, spec requirements, proposal summary, design decisions)
- [x] 3.4 Implement prompt generation function that combines openspec context + ralph loop context (git history, errors)
- [x] 3.5 Implement opencode CLI execution function with prompt input
- [x] 3.6 Implement stdout/stderr capture from opencode execution
- [x] 3.7 Implement exit code detection and handling
- [x] 3.8 Implement git commit function (commit message = task description)
- [x] 3.9 Implement sequential task loop that processes tasks in order, skipping completed tasks

## 4. Bidirectional Task Tracking

- [x] 4.1 Implement tasks.md reading and parsing at script startup
- [x] 4.2 Implement task identifier assignment (line number based stable identifier)
- [x] 4.3 Create .ralph/tracking.json initialization function (create if not exists)
- [x] 4.4 Implement tracking.json reading and parsing
- [x] 4.5 Implement tasks.md checkbox update function (toggle [ ] to [x])
- [x] 4.6 Implement tracking.json update function (mark task as complete)
- [x] 4.7 Implement atomic update of both tasks.md and tracking.json (update both or rollback)
- [x] 4.8 Implement concurrent modification detection (compare modification time/checksum)
- [x] 4.9 Add warning and user confirmation prompt when tasks.md is modified during execution
- [x] 4.10 Implement re-reading of tasks.md after concurrent modification detection

## 5. Error Context Propagation

- [x] 5.1 Implement error capture function (stderr and stdout from failed opencode execution)
- [x] 5.2 Implement .ralph/errors.md formatting with timestamp, task ID, task description
- [x] 5.3 Implement error append function (append to existing errors.md preserving history)
- [x] 5.4 Implement error reading function for prompt context injection
- [x] 5.5 Implement error filtering (include only current session or recent failures)
- [x] 5.6 Implement error structuring for prompt (format to guide AI agent on what to avoid/fix)
- [x] 5.7 Implement .ralph/errors.md cleanup on successful completion (remove or truncate)
- [x] 5.8 Add option to archive error history to timestamped file for reference
- [x] 5.9 Test error propagation across multiple task iterations

## 6. Context Injection Support

- [x] 6.1 Implement context injection command/signal handling function
- [x] 6.2 Create .ralph/context-injections.md file for tracking injected context
- [x] 6.3 Implement context queuing for current or next opencode invocation
- [x] 6.4 Implement injected context logging for traceability
- [x] 6.5 Implement injected context preservation in .ralph/context-injections.md
- [x] 6.6 Add injected context to opencode prompt when available

## 7. Script Idempotency and Resumption

- [x] 7.1 Implement state persistence tracking (last completed task, incomplete tasks)
- [x] 7.2 Implement resumption logic (detect incomplete tasks and continue from first unchecked)
- [x] 7.3 Add script state validation on startup
- [x] 7.4 Implement completion detection (stop when all tasks are marked complete)
- [x] 7.5 Test script idempotency (run multiple times safely, pick up where left off)

## 8. Integration Testing and Refinement

- [x] 8.1 Create sample openspec change with proposal, specs, design, tasks for testing
- [x] 8.2 Test end-to-end workflow: create openspec change → run ralph-run.sh → execute tasks
- [x] 8.3 Test git commit creation with proper commit messages
- [x] 8.4 Test bidirectional task tracking sync
- [x] 8.5 Test error propagation across task iterations
- [x] 8.6 Test script resumption after interruption
- [x] 8.7 Test context injection during execution
- [x] 8.8 Test PRD generation and regeneration
- [x] 8.9 Add comprehensive error handling for edge cases
- [x] 8.10 Write usage documentation and examples
