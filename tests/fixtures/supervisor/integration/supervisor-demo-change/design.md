## Context

This fixture keeps the change surface minimal while remaining strict-valid under the real OpenSpec validator.

## Goals / Non-Goals

**Goals:**
1. Give the mocked implementer one pending task it can block on.
2. Let the mocked supervisor replace that task body with a strict-valid patch.
3. Keep the fixture small enough for the bats tests to reason about directly.

**Non-Goals:**
1. Cover application code edits.
2. Model complex multi-task planning.

## Decisions

### 1. Single pending task

The fixture uses one pending task so the second implementer iteration can mark it complete and emit `COMPLETE`.
