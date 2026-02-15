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
