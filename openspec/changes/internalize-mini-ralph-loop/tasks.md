## 1. Internal Loop Engine Foundation

- [x] 1.1 Create the internal mini Ralph module and private runner structure in the repository and wire `ralph-run` to it
- [x] 1.2 Implement state, history, context, and task-file helpers for `.ralph/` using Node-compatible code
- [x] 1.3 Implement prompt loading and prompt-template rendering for inline prompts, prompt files, and iteration variables

## 2. Core Iteration Behavior

- [x] 2.1 Implement the OpenCode invocation loop with min/max iterations, completion promise handling, and task-promise handling
- [x] 2.2 Implement iteration result capture for duration, tool usage summaries, completion detection, and file-change/no-progress signals
- [x] 2.3 Implement auto-commit behavior plus a supported `--no-commit` path

## 3. Observability and Control Commands

- [x] 3.1 Implement `--status` output for active loop state, prompt summary, task progress, recent history, pending context, and struggle indicators
- [x] 3.2 Implement `--add-context` and `--clear-context` using `.ralph/ralph-context.md`
- [x] 3.3 Surface the supported first-pass loop controls through `ralph-run` help text and documented flags only

## 4. OpenSpec Integration and Dependency Removal

- [x] 4.2 Preserve OpenSpec task-file source-of-truth behavior by keeping `.ralph/ralph-tasks.md` synchronized with change `tasks.md`
- [x] 4.3 Align loop resume behavior with existing completed and in-progress OpenSpec tasks
- [x] 4.4 Remove `@th0rgal/ralph-wiggum` from dependencies and eliminate Bun-specific runtime assumptions from setup/install flows

## 5. Regression Coverage and Documentation

- [x] 5.1 Add JavaScript unit tests for internal loop execution, state/history persistence, status rendering, context controls, and task-progress reporting
- [x] 5.2 Update Bats integration tests to exercise the internal runtime deterministically without invoking the real external Ralph package or live OpenCode
- [x] 5.3 Validate and fix platform-specific behavior on the current OS only (macOS when running on Darwin, Linux when running on Linux), including temp paths, symlinks, hashing/stat helpers, and signal cleanup
- [ ] 5.4 Update `README.md`, `QUICKSTART.md`, `TESTING.md`, and related markdown to document the supported mini Ralph subset, the `ralph-run`-first interface, and migration away from the external dependency
