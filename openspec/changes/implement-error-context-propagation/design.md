## Context

The spec-and-loop project implements the Ralph Wiggum iterative AI development methodology via an internal mini-Ralph runtime. The runtime loop (`lib/mini-ralph/runner.js`) repeatedly invokes `opencode`, records results in history, and feeds signals back to the next iteration. Two existing specs — `error-context-propagation` and `ralph-task-orchestrator` — describe how error output from failed opencode invocations should be captured, persisted, and injected into subsequent prompts. However, this feature is unimplemented:

- `invoker.js:_spawnOpenCode()` captures `stderr` in a local variable but the `invoke()` function discards it before returning.
- `runner.js:_buildIterationFeedback()` only reports numeric exit codes (e.g., "opencode exited with code 1") without any error content.
- `scripts/ralph-run.sh` defines `append_error()`, `read_errors()`, `clear_errors()`, and `archive_errors()` at lines 499–572, but these functions are dead code — never called from `execute_ralph_loop()` or `main()`.
- History entries store `exitCode` but not stderr/stdout content.

The established module pattern in `lib/mini-ralph/` is file-based persistence under `.ralph/` with no caching, using only Node.js built-in `fs`/`path` modules for cross-platform compatibility. The `context.js` module is the closest precedent: it manages `.ralph/ralph-context.md` with `add()`, `clear()`, `consume()`, and `read()` operations.

## Goals / Non-Goals

**Goals:**

- Capture full stderr (and stdout when relevant) from failed opencode invocations and persist structured error entries to `.ralph/errors.md`.
- Inject error content from recent failures into subsequent iteration prompts so the AI agent can avoid repeating the same failed approach.
- Preserve error history across script restarts so resumed runs benefit from prior failure context.
- Clear error history when all tasks complete successfully.
- Expose error history in the `--status` dashboard for human operators.
- Maintain full backward compatibility — no breaking changes to existing APIs, function signatures, or behaviors.

**Non-Goals:**

- Modifying the bash error functions in `ralph-run.sh` to be the primary error propagation path. The JS mini-ralph runner is the canonical execution path; the bash wrapper delegates to it.
- Adding a `--clear-errors` CLI flag. Error clearing happens automatically on successful completion.
- Storing error content in the JSON history file (`ralph-history.json`). Error output can be large and would bloat the history. A separate `.ralph/errors.md` file is the right granularity.
- Changing how the invoker spawns or manages the opencode process.
- Adding retry logic or exponential backoff for failed invocations (out of scope).

## Decisions

### D1: Add `stderr` to invoker return value

**Decision**: Modify `invoker.invoke()` to include `stderr` in its return object.

**Rationale**: `_spawnOpenCode()` already captures stderr in a local variable and streams it to `process.stderr`. The `invoke()` function resolves with `{ stdout, stderr, exitCode }` internally but strips `stderr` from the returned object. Adding it back is a one-line change with no impact on existing consumers that don't read the field.

**Alternative considered**: Write stderr directly to `.ralph/errors.md` inside the invoker. Rejected because the invoker should remain a thin process wrapper — error persistence is a runner-level concern.

### D2: New `lib/mini-ralph/errors.js` module following `context.js` pattern

**Decision**: Create a dedicated `errors.js` module with `append(ralphDir, entry)`, `read(ralphDir, limit)`, `clear(ralphDir)`, and `archive(ralphDir)` functions. Entries are appended to `.ralph/errors.md` in a structured markdown format.

**Rationale**: This matches the established pattern. `context.js` manages `.ralph/ralph-context.md` with add/clear/consume. An `errors.js` module managing `.ralph/errors.md` with append/read/clear/archive follows the same convention. Using markdown format (rather than JSON) keeps error entries human-readable when inspecting `.ralph/` directly and matches the spec's description of the file format.

**Entry format**:
```
---
Timestamp: 2026-04-11T16:30:00Z
Iteration: 3
Task: 2.1 Implement the streaming handler
Exit Code: 1

### stderr
<error output>

### stdout
<standard output>
```

**Alternative considered**: Store errors as JSON entries alongside history in `ralph-history.json`. Rejected because error output (especially stack traces) can be very large and would bloat the history file. A separate file allows independent cleanup and inspection.

**Parsing approach for `read()`**: The `read()` function reads the full `.ralph/errors.md` file and splits it on the `---` delimiter (lines matching exactly `---` at the start of a line). Each chunk between delimiters is one error entry. To return the N most recent entries, the function splits all entries, takes the last N, and joins them back with `---` delimiters in chronological order (oldest first). If the file doesn't exist, returns an empty string. This is a simple text-splitting approach — no regex or complex parsing required.

### D3: Wire error capture into runner loop

**Decision**: In `runner.js`, after each iteration:
1. If `result.exitCode !== 0`, call `errors.append(ralphDir, { ... })` with the full stderr, stdout, iteration number, and current task description.
2. Enhance `_buildIterationFeedback()` to accept an optional `errorContent` string parameter containing the last few error entries from `errors.read()`. When errors exist, the feedback section will include the actual error output under a `### Error Output` subsection.
3. On successful loop completion (all tasks done, `completed === true`), call `errors.archive(ralphDir)` then `errors.clear(ralphDir)`. Log the archive path via `process.stderr.write` when `verbose` is true.
4. On incomplete loop exit (`completed === false`, e.g. max_iterations reached or interruption), do NOT clear errors — they persist across restarts so the resumed run benefits from prior failure context.

**Rationale**: Keeping error capture in the runner (not the invoker) preserves separation of concerns. The runner has access to iteration context (task description, iteration number) that the invoker doesn't.

**Error-to-history matching**: Error entries are matched to history entries by iteration number. The `_buildIterationFeedback()` function iterates over `recentHistory` as before; for each entry with `exitCode !== 0`, it looks for a matching error entry in the `errorContent` string by checking if the error text contains `Iteration: <number>`. This is a simple substring match — no complex parsing needed since iteration numbers are unique within a run.

**Enhanced feedback format**:
```
Use these signals to avoid repeating the same failed approach:
- Iteration 2: opencode exited with code 1.
  Error output:
  <relevant stderr excerpt>

- Iteration 3: no files changed; no loop promise emitted.
```

### D4: Keep bash error functions as-is with deprecation comment

**Decision**: Leave `format_error_entry()`, `append_error()`, `read_errors()`, `clear_errors()`, and `archive_errors()` in `ralph-run.sh` but add a comment noting they are superseded by the JS implementation in `lib/mini-ralph/errors.js`.

**Rationale**: The bash wrapper delegates loop execution to the JS mini-ralph CLI (`mini-ralph-cli.js`) at `ralph-run.sh:1026`. The bash functions were written speculatively but were never wired in because the JS path became canonical. Removing them would be a no-op cleanup that adds risk for no benefit. A deprecation comment documents the current state.

**Alternative considered**: Wire the bash functions into the bash loop path. Rejected because the bash path is thin orchestration that delegates to the JS runner — duplicating error logic in both layers would violate DRY and create divergence risk.

### D5: Error content truncation for prompt injection

**Decision**: When injecting error content into the prompt via `_buildIterationFeedback()`, truncate individual error entries to 2000 characters of stderr and 500 characters of stdout. Include at most the last 3 error entries.

**Rationale**: Opencode error output can include full stack traces, build logs, or other verbose content. Injecting unlimited error text into the prompt would consume too much of the context window and could degrade AI performance. The 2000/500 character limits capture the most relevant portions (typically the actual error message and last few lines of a trace) while keeping the prompt manageable.

### D6: Status dashboard error summary

**Decision**: Add an error summary section to `status.js render()` between the recent history and struggle indicators sections. Show the count of errors and a preview of the most recent error.

**Rationale**: Operators running `ralph-run --status` should see at a glance whether there are unresolved errors. This complements the existing struggle indicators (which show counts) with actual error content.

## Risks / Trade-offs

**[Prompt size increase]** → Error content added to the prompt increases token usage per iteration. Mitigated by truncation limits (D5) and only including errors from failed iterations.

**[stderr may not contain useful diagnostic info]** → Some opencode failures produce exit code 1 with empty stderr, with the actual error in stdout or in the process's own output. Mitigated by capturing both stderr and stdout in the error entry, and by including the numeric exit code in the feedback alongside the error content.

**[Stale error history across runs]** → If a run is interrupted and restarted, old errors persist and could mislead the AI into avoiding approaches that are no longer problematic. Mitigated by including timestamps and iteration numbers in error entries, so the AI (and the prompt feedback) can filter by recency. The `errors.read()` function accepts a `limit` parameter to control how many entries are included.

**[File I/O overhead]** → Appending to `.ralph/errors.md` on every failed iteration adds a file write. This is negligible compared to the cost of invoking opencode (which takes seconds to minutes per iteration) and is consistent with the existing pattern of writing to `.ralph/` on every iteration (history, state).

**[No breaking changes guarantee]** → All changes are additive. The `stderr` field added to the invoker return value is a new key that existing consumers ignore. The `errors.js` module is entirely new. The `_buildIterationFeedback()` function gets a second optional parameter with a default value, preserving the existing call signature.
