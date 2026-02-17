# OpenSpec + Ralph Wiggum: Best of Both Worlds

## Overview

This document describes the design and expected behavior of the `ralph-run.sh` script, which bridges OpenSpec's spec-driven development with Ralph Wiggum's iterative AI development approach.

## Design Philosophy

### "Best of Both Worlds" Approach

The script achieves a hybrid development workflow:

1. **OpenSpec for Specification**: All technical requirements, designs, and specifications are authored in OpenSpec artifacts (`proposal.md`, `design.md`, `specs/*/spec.md`, `tasks.md`). This serves as the source of truth for what needs to be built.

2. **Ralph Wiggum for Execution**: The actual implementation work is done by Ralph Wiggum (via `ralph` CLI) which reads the specs and uses an AI agent (OpenCode) to write code, test, debug, and iterate.

3. **Task Tracking in tasks.md**: The tasks.md file tracks all work items with checkboxes (`[ ]` incomplete, `[x]` complete, `[/]` in-progress). Ralph automatically updates these as it works.

## Expected Behaviors

### 1. Initialization Flow

When the script starts:

```bash
ralph-run.sh --change <name> --max-iterations <n>
```

**Steps:**
1. Validate git repository exists
2. Validate dependencies (ralph CLI, opencode CLI)
3. Auto-detect or use specified change directory
4. Validate OpenSpec artifacts exist (`proposal.md`, `design.md`, `tasks.md`, `specs/`)
5. Setup `.ralph` directory structure
6. Generate PRD (Product Requirements Document) from all OpenSpec artifacts
7. Restore Ralph state from completed tasks count in tasks.md
8. Start Ralph Wiggum loop

**Key Feature**: The script reads completed task count from `tasks.md` and sets Ralph iteration = completed_tasks + 1. This ensures iteration numbering aligns with task progress.

### 2. Ralph Loop Execution

The Ralph loop runs continuously with the following flow each iteration:

#### Iteration Start:
1. Ralph reads its state file to get current iteration number
2. Ralph reads the PRD.md file which contains:
   - Full OpenSpec proposal content
   - Full OpenSpec design content  
   - All OpenSpec specs from `specs/*/spec.md`
   - **Current Task Context** (the task currently being worked on)
   - **Completed Tasks List** (for proper git commit messages)

#### During Iteration:
3. Ralph uses `/opsx-apply` skill (openspec-apply-change) to:
   - Read current task from tasks.md (first `[ ]` or `[/]`)
   - Mark it as `[/]` (in-progress) before starting
   - Implement the task by reading relevant specs and making code changes
   - Update tasks.md: `[/]` → `[x]` when complete
   - Output `<promise>READY_FOR_NEXT_TASK</promise>` when done

#### Iteration End:
4. Ralph waits for `<promise>READY_FOR_NEXT_TASK</promise>` from the skill
5. Increments iteration counter
6. Loops back to step 1

**Critical Feature**: Each iteration provides **fresh context** to Ralph via PRD regeneration. The PRD is regenerated before each Ralph invocation, so Ralph always has:
- Latest task context from tasks.md
- Latest list of completed tasks for git commits
- All OpenSpec artifacts unchanged (source of truth)

### 3. Task Context Management

The `get_current_task_context()` function:

```bash
get_current_task_context() {
    # Reads tasks.md to find:
    # 1. Current in-progress task (marked as [/])
    # 2. OR first incomplete task (marked as [ ]) if no in-progress task
    # 3. All completed tasks (marked as [x]) with their descriptions
    
    # Returns formatted as:
    # ## Current Task
    # - [task.number] Task description text
    
    # ## Completed Tasks for Git Commit
    # - [x] task.number Task description text
    # - [x] task.number Task description text
    # ...
}
```

**Why This Matters:**
- Ralph can include the actual task number and description in git commit messages
- When a task is completed, Ralph can commit with a message like:
  ```
  Ralph iteration 5: implement streaming features
  
  Tasks completed:
  - [x] 9.4 Implement streaming chunk display (chunks appear in sequence)
  - [x] 9.5 Test streaming chunks maintain correct ordering
  - [x] 9.6 Test streaming visual distinction from completed messages
  ```

### 4. Symlink Architecture

The script creates a symlink:
```
.ralph/ralph-tasks.md -> openspec/changes/<name>/tasks.md
```

**Purpose**: Both Ralph (via `--tasks` flag) and openspec-apply-change skill work on the EXACT SAME FILE. This ensures:
- Ralph sees task state changes immediately
- No file synchronization issues
- Single source of truth for task tracking

### 5. Git Commit Format

Git commits created by Ralph should follow this format:

```
Ralph iteration <N>: <brief description of iteration>

Tasks completed:
- [x] <task.number> <task description>
- [x] <task.number> <task description>
- [x] <task.number> <task description>
...
```

**Benefits**:
- Clear traceability of which iteration did what work
- All task numbers preserved in git history
- Easy to `git log --grep="9.4"` to find when a specific task was done
- Git bisect can locate exact iteration for debugging

### 6. State Synchronization

The `restore_ralph_state_from_tasks()` function:

```bash
restore_ralph_state_from_tasks() {
    # Count completed [x] tasks in tasks.md
    # Set Ralph iteration = completed_count + 1
    # Only updates if within max_iterations limit
}
```

**Behavior**:
- When starting the script, Ralph iteration is recalculated from actual task completion count
- This fixes issues where Ralph's internal iteration got out of sync with actual progress
- If tasks are completed but iteration is still high, iteration resets to continue work

## Integration Points

### OpenSpec → Script

**Flow**:
1. User authors specs in `openspec/changes/<name>/`
2. Script validates these artifacts exist
3. Script reads `proposal.md`, `design.md`, all `specs/*/spec.md`
4. Script generates PRD containing all spec content
5. PRD serves as Ralph's context for implementation

### Script → Ralph Wiggum

**Flow**:
1. Script invokes `ralph --prompt-file .ralph/PRD.md --agent opencode`
2. Ralph reads PRD (all specs + task context + completed tasks)
3. Ralph runs `/opsx-apply` skill (openspec-apply-change)
4. Skill implements tasks by reading specs and updating code
5. Skill updates `tasks.md` checkboxes as work progresses
6. Script regenerates PRD (new task context, new completed tasks list)
7. Ralph starts next iteration with updated context

### Ralph → OpenCode (AI Agent)

**Flow**:
1. Ralph provides OpenCode agent with full context:
   - All OpenSpec artifacts (from PRD)
   - Current task description
   - Completed tasks for git commits
   - Project structure understanding
2. OpenCode uses `/opsx-apply` skill to:
   - Read relevant spec files
   - Implement required changes
   - Update task state
3. OpenCode can read and write to same `tasks.md` file (via symlink)

### Ralph → Git

**Flow**:
1. Ralph creates commits after each task completion
2. Commit format includes iteration number and all completed tasks
3. Git history provides traceability of all work done

## Key Invariants

### What Must Never Change

1. **tasks.md is Source of Truth**
   - All task state comes from `[ ]`, `[x]`, `[/]` checkboxes
   - Ralph reads from and writes to this file
   - No duplicate or separate task state tracking

2. **OpenSpec Artifacts are Immutable During Loop**
   - `proposal.md`, `design.md`, `specs/*/spec.md` are read-only during execution
   - Ralph cannot modify these files (only reads them via `/opsx-apply`)
   - If specs need changes, user must update them manually or use openspec commands

3. **Symlink Must Point to Correct File**
   - `.ralph/ralph-tasks.md` always symlinks to actual `openspec/changes/<name>/tasks.md`
   - Both Ralph and openspec-apply-change work on same file

4. **Iteration Counter Aligns with Task Progress**
   - Iteration N = completed task count + 1
   - This ensures iteration number reflects actual progress

5. **Each Iteration Gets Fresh Context**
   - PRD is regenerated before each Ralph invocation
   - Ralph always sees updated task context and completed tasks list
   - No stale context from previous iterations

## What's NOT Currently Implemented

### Potential Enhancements

1. **Automatic PRD Updates During Skill Execution**
   - Currently: PRD regenerated only at script start, then Ralph runs in a loop
   - Enhancement: Hook into Ralph's skill lifecycle to regenerate PRD after each task completion
   - Benefit: Faster context updates, smaller PRD regeneration overhead

2. **Task Progress Persistence Across Script Restarts**
   - Currently: When script restarts, iteration is recalculated from task completion count
   - Enhancement: Save iteration state to file, restore on restart
   - Benefit: Prevents iteration recalculation, maintains continuity

3. **Incremental PRD Updates**
   - Currently: Full PRD regenerated each iteration (can be slow with large specs)
   - Enhancement: Only update changed sections (task context, completed tasks)
   - Benefit: Faster iteration starts, less I/O overhead

4. **Progress Dashboard**
   - Currently: Script outputs minimal progress information
   - Enhancement: Display progress bar, current task, tasks completed/remaining
   - Benefit: Better visibility into development progress

5. **Error Recovery**
   - Currently: Script handles basic errors (missing files, dependencies)
   - Enhancement: Detect and recover from Ralph crashes, skill failures
   - Benefit: More robust long-running development sessions

6. **Task Dependency Management**
   - Currently: Tasks executed in numerical order (first incomplete task)
   - Enhancement: Parse task dependencies (if specified in specs), execute in dependency order
   - Benefit: Implement tasks in logical order when they depend on each other

## Anti-Patterns (What NOT to Do)

### 1. Don't Maintain Separate Task State

❌ **Wrong**:
```python
# Separate tracking in Ralph state
RALPH_TASKS = [...]
```

✅ **Correct**:
```bash
# Always read from tasks.md source of truth
grep "^- \[x\]" tasks.md
```

### 2. Don't Hardcode Iteration Numbers

❌ **Wrong**:
```bash
COMMIT_MSG="Ralph iteration 3: ..."
```

✅ **Correct**:
```bash
COMMIT_MSG="Ralph iteration $(cat .ralph/ralph-loop.state.json | jq .iteration): ..."
# Or better: Read from Ralph's state during execution
```

### 3. Don't Use Stale Context

❌ **Wrong**:
```bash
# Use old PRD without regenerating
ralph --prompt-file .ralph/PRD.md  # Never regenerated
```

✅ **Correct**:
```bash
# Always regenerate PRD before each Ralph invocation
generate_prd "$change_dir" > "$ralph_dir/PRD.md"
ralph --prompt-file "$ralph_dir/PRD.md
```

### 4. Don't Break the Symlink

❌ **Wrong**:
```bash
# Copy tasks.md to .ralph directory
cp tasks.md .ralph/ralph-tasks.md  # Breaks sync!
```

✅ **Correct**:
```bash
# Always use symlink for shared file
ln -sf "$(realpath tasks.md)" .ralph/ralph-tasks.md
```

### 5. Don't Ignore Task Numbers in Commits

❌ **Wrong**:
```bash
git commit -m "Ralph iteration 5: work in progress"
# No task numbers, no way to track what was done
```

✅ **Correct**:
```bash
git commit -m "Ralph iteration 5: implement streaming features

Tasks completed:
- [x] 9.4 Implement streaming chunk display
- [x] 9.5 Test streaming ordering
- [x] 9.6 Test streaming visual distinction
"
# Full traceability of what was done
```

## Why This Matters

### Benefits for Spec-Driven Development

1. **Single Source of Truth**: All requirements live in OpenSpec artifacts, not scattered across multiple systems
2. **Traceability**: Git commits link to specific tasks via task numbers
3. **Reproducibility**: Anyone can reproduce the workflow by running `ralph-run.sh`
4. **Maintainability**: Changes to requirements are made in spec files, not codebase

### Benefits for AI-Augmented Development

1. **Context Refresh**: Each iteration provides fresh context to the AI agent, including what just changed
2. **Iterative Refinement**: AI can improve approach across iterations while maintaining spec compliance
3. **Automation**: The loop runs automatically, handling task marking, context updates, and git commits
4. **Human-in-the-Loop**: Script can be paused/interrupted, AI asks for clarification when stuck

### Benefits of Combined Approach

1. **Specification First**: What to build is defined in specs, implementation follows
2. **AI-Assisted Implementation**: Writing, testing, debugging done by AI following spec guidance
3. **Automatic Progress Tracking**: No manual task list management - AI updates it as it works
4. **Rich Context**: AI sees full specs, current task, and all completed work in each iteration
5. **Git History**: Clean, traceable commits with task numbers for future reference

## Ideal "Best of Both Worlds" Behavior

### What Should Work Automatically

1. ✅ **Loop Continuously**: Ralph runs iterations until all tasks complete or max iterations reached
2. ✅ **Find Next Task**: Each iteration, Ralph identifies the next `[ ]` or `[/]` task
3. ✅ **Mark In-Progress**: Before starting work, Ralph marks task as `[/]` in tasks.md
4. ✅ **Implement Task**: Ralph uses `/opsx-apply` to implement by reading relevant specs
5. ✅ **Mark Complete**: After implementation, Ralph marks task as `[x]` in tasks.md
6. ✅ **Git Commit**: Ralph creates a git commit with iteration number and all completed tasks
7. ✅ **Context Refresh**: PRD regenerated before each iteration with updated task context and completed tasks
8. ✅ **Signal Next**: Ralph outputs `<promise>READY_FOR_NEXT_TASK</promise>` to continue loop
9. ✅ **Increment Iteration**: Iteration counter increases by 1
10. ✅ **Repeat**: Loop continues until no `[ ]` or `[/]` tasks remain

### What Should Be True At All Times

1. ✅ **tasks.md Never Desynchronized**: All task state comes from file, no in-memory tracking
2. ✅ **OpenSpec Artifacts Read-Only**: Specs are reference material, not modified during execution
3. ✅ **Symlink Maintained**: `.ralph/ralph-tasks.md` always points to actual tasks.md
4. ✅ **Iteration Aligned**: Iteration number always reflects completed task count
5. ✅ **Fresh Context Each Iteration**: PRD regenerated before each Ralph invocation
6. ✅ **Git Commits Include Task Numbers**: Every commit lists what was completed with task IDs

### What Should Happen on Interruption/Restart

1. ✅ **State Restored**: On script restart, iteration recalculated from task completion count
2. ✅ **No Duplicate Tasks**: Ralph doesn't re-mark already completed tasks
3. ✅ **Context Refreshed**: PRD regenerated with latest task state
4. ✅ **Clean Recovery**: Script cleans up Ralph processes on shutdown (no orphaned processes)

## Troubleshooting Guide

### Problem: Git Commits Show "work in progress" Instead of Task Descriptions

**Cause**: `get_current_task_context()` not working or not called in PRD generation

**Solution**:
1. Verify function is called in `generate_prd()` before PRD is written
2. Check regex patterns match task format (`^-\ \[/\]` and `^-\ \[\ \]`)
3. Test function in isolation: `bash -c 'source ralph-run.sh; get_current_task_context "path/to/change"'`

### Problem: Ralph Iteration Number Doesn't Match Actual Progress

**Cause**: `restore_ralph_state_from_tasks()` not called or logic incorrect

**Solution**:
1. Ensure function is called before Ralph starts
2. Check completed task count logic: `grep -c "^- \[x\]" tasks.md`
3. Verify iteration update in Ralph state file: `jq '.iteration = N' .ralph/ralph-loop.state.json`

### Problem: Tasks.md Checkbox State Gets Out of Sync

**Cause**: Multiple processes writing to tasks.md simultaneously without coordination

**Solution**:
1. Only one process should write to tasks.md (Ralph only)
2. Verify symlink is correct: `ls -la .ralph/ralph-tasks.md`
3. Check for lock files or race conditions in skill execution

### Problem: Ralph Gets Stale Context

**Cause**: PRD not regenerated between iterations

**Solution**:
1. Verify `generate_prd()` called before each Ralph iteration
2. Check PRD modification timestamp before Ralph invocation
3. Ensure PRD contains current task context, not old state

### Problem: Git Commits Don't Include Task Numbers

**Cause**: Ralph not using task context from PRD in commit messages

**Solution**:
1. Verify prompt template includes git commit format instructions
2. Check that Ralph is reading "## Completed Tasks for Git Commit" section from PRD
3. Test Ralph creates commits with task list: run one iteration and check git log

## Conclusion

The `ralph-run.sh` script successfully achieves "best of both worlds" by:

1. **Using OpenSpec** for all specification, design, and task tracking
2. **Using Ralph Wiggum** for AI-assisted iterative implementation
3. **Maintaining Single Source of Truth** in tasks.md via symlink
4. **Providing Fresh Context** each iteration via PRD regeneration
5. **Enabling Traceability** through git commits with task numbers
6. **Automating the Loop** for hands-off development workflow

This approach allows users to:
- Define requirements rigorously in OpenSpec
- Let AI do the implementation work following those requirements
- Track progress automatically via task checkboxes
- See traceable git history linked to specific tasks
- Iterate continuously with fresh context each cycle

The key principle: **OpenSpec defines what to build, Ralph builds it, tasks.md tracks the progress, git commits record it.**

## Why "Best of Both Worlds" is Ideal

### The Hybrid Architecture

The `ralph-run.sh` script combines two powerful approaches:

1. **OpenSpec (Specification-Driven Development)**
   - All requirements, designs, and technical specifications authored in OpenSpec artifacts
   - Single source of truth for what to build
   - Formal, reviewable, maintainable specification documents

2. **Ralph Wiggum (AI-Augmented Iterative Development)**
   - AI agent (OpenCode) reads specs and implements actual code
   - Automates iteration loop and task progression
   - Provides debugging, testing, and adaptive problem-solving
   - Fresh context on each iteration enables continuous improvement

3. **tasks.md (Simple, Reliable Task Tracking)**
   - Markdown-based task list with clear checkbox states
   - Human-readable and machine-parsable
   - Single file that both script and Ralph read/write
   - Git commits provide traceable history of all work

### Why Each Component is Essential

#### OpenSpec Without OpenSpec:
- Would need to maintain separate requirements documents
- Specs could get out of sync with implementation
- No clear workflow for systematic task completion
- Difficult to track progress over time
- Hard to reproduce or review what was built

#### Ralph Without OpenSpec:
- No formal requirements or design documentation
- AI lacks context, makes assumptions
- Technical decisions not documented
- Implementation drift from original intent
- Difficult to handoff or maintain codebase

#### Ralph Without tasks.md:
- No centralized task tracking
- Iteration numbers meaningless
- Cannot tell which tasks completed in which iteration
- Git commits lack detail
- Difficult to audit progress or plan future work

#### tasks.md Without Ralph:
- Manual task completion (easy to forget updates)
- No automatic git commits
- No iteration management
- Must manually track what's done
- No workflow automation

### The Synergy: 1+1+1 > 3

When combined, these three systems create a development workflow that is:
- **Spec-driven**: Everything built follows documented requirements
- **AI-augmented**: AI helps implement following spec guidance
- **Tracked**: Progress is visible, measurable, and traceable
- **Automated**: Workflow handles iteration, task marking, git commits
- **Continuous**: Each iteration gets fresh context for adaptive improvement

## Complete Expected Behaviors

### 1. Looping Behavior

#### What Should Happen:
1. **Automatic Loop Start**
   - User runs: `./scripts/ralph-run.sh --change <name> --max-iterations <n>`
   - Script validates environment and dependencies
   - Script auto-detects or uses specified change directory
   - Script generates PRD from all OpenSpec artifacts
   - Script initializes Ralph state from completed task count
   - Script starts Ralph Wiggum loop

2. **Per-Iteration Execution**
   - Ralph reads iteration number from its state file (`.ralph/ralph-loop.state.json`)
   - Ralph reads PRD.md which contains:
     - Full proposal (what and why)
     - Full design (technical approach)
     - All specs (detailed requirements)
     - Current task context (the task being worked on)
     - Completed tasks list (for git commit messages)
   - Ralph starts next incomplete task by reading tasks.md:
     - Finds task marked as `[/]` (in-progress) or first `[ ]` (incomplete)
     - Marks it as `[/]` before starting work
     - Calls `/opsx-apply` skill to implement the task
     - `/opsx-apply` reads relevant specs and makes code changes
     - `/opsx-apply` updates task from `[/]` to `[x]` when complete
     - `/opsx-apply` outputs `<promise>READY_FOR_NEXT_TASK</promise>` when done

3. **Git Commit Creation**
   - After task completion, Ralph reads completed tasks from tasks.md
   - Ralph generates git commit message:
     ```
     Ralph iteration <N>: <brief description>

     Tasks completed:
     - [x] <task.number> <task description>
     - [x] <task.number> <task description>
     ...
     ```
   - This creates a git commit linking iteration number to specific tasks
   - Git history shows traceable path: what task in which iteration

4. **Iteration Progression**
   - Script reads completed task count from tasks.md
   - Sets Ralph iteration = completed_count + 1
   - This ensures iteration number always aligns with task progress
   - If iteration exceeds max, script resets or stops

5. **Context Refresh**
   - Before each iteration, script regenerates PRD
   - PRD includes current task context (the task being worked on)
   - PRD includes all completed tasks (for git commits)
   - This ensures Ralph always has up-to-date context
   - Fresh context prevents stale decisions or repeated work

### 2. Task Tracking Behavior

#### What Should Happen:
1. **Single Source of Truth**
   - `tasks.md` is the ONLY file that tracks task state
   - Three checkbox states: `[ ]` incomplete, `[x]` complete, `[/]` in-progress
   - Symlink `.ralph/ralph-tasks.md` points to actual `openspec/changes/<name>/tasks.md`
   - Both Ralph (via `--tasks` flag) and script read from this same file
   - No duplicate or out-of-sync task state

2. **Task Progression**
   - Tasks executed in numerical order (top to bottom of file)
   - When user starts script, script finds first `[ ]` or `[/]` task
   - Script does NOT read Ralph's iteration number or internal state
   - Script calculates: `current_iteration = completed_count + 1`
   - This ensures iteration number reflects actual task progress, not arbitrary counter

3. **State Transitions**
   - Task transitions through states in this order:
     ```
     [ ] (incomplete) → [/] (in-progress, marked by Ralph) → [x] (complete, marked by Ralph)
     ```
   - User can manually mark `[ ]` → `[x]` if they want to skip a task
   - Ralph marks `[/]` when starting work and `[x]` when complete
   - Multiple tasks can be marked as `[x]` in a single iteration

4. **Task Context for Ralph**
   - `get_current_task_context()` function extracts:
     - Current task being worked on (the `[/]` or first `[ ]` task)
     - All completed tasks with their descriptions and numbers
   - This context is included in PRD before each Ralph invocation
   - Ralph can use completed tasks list for git commit messages
   - Ralph can reference current task number and description in context

### 3. Problem Solving and Error Handling

#### What Should Happen:
1. **Automatic Problem Detection**
   - Ralph reads tasks.md, identifies task, attempts implementation
   - Ralph uses AI reasoning to understand requirements
   - Ralph reads relevant spec files for context
   - If Ralph gets stuck, it can ask clarifying questions
   - If Ralph encounters an error, it outputs error details and retries

2. **Task Retry Logic**
   - If Ralph fails to complete a task:
     - Task remains as `[/]` (in-progress)
     - No git commit is created
     - Ralph can retry on next iteration
     - User can manually intervene by marking task `[x]` to skip
   - If Ralph succeeds: task marked `[x]`, git commit created, output `READY_FOR_NEXT_TASK`

3. **Iteration Recovery**
   - If Ralph crashes or script interrupted:
     - Next script restart recalculates iteration from completed tasks
     - No stale state persists
     - Work can resume at correct iteration number
   - Script cleanup removes orphaned processes on shutdown

4. **Human-in-the-Loop**
   - Script can be paused/interrupted with Ctrl+C
   - User can inspect tasks.md, add new tasks, or modify existing ones
   - User can resume script to continue from current iteration
   - AI can ask for clarification on ambiguous tasks
   - User can provide context injections if AI needs help

### 4. Git Integration Behavior

#### What Should Happen:
1. **Automatic Commits**
   - Each task completion triggers a git commit
   - Commit format includes iteration number and task list
   - Commits happen automatically, not manual
   - Git history shows clear progression of work

2. **Commit Format**
   ```
   Ralph iteration <N>: <brief summary of what was done>

   Tasks completed:
   - [x] <task.number> <task description>
   - [x] <task.number> <task description>
   - [x] <task.number> <task description>
   ```
   - Example:
     ```
     Ralph iteration 5: implement streaming features

     Tasks completed:
     - [x] 9.4 Implement streaming chunk display (chunks appear in sequence)
     - [x] 9.5 Test streaming chunks maintain correct ordering
     - [x] 9.6 Test streaming visual distinction from completed messages
     ```

3. **Commit Timing**
   - Commit created immediately after task completes
   - No waiting for end of iteration or manual triggers
   - Each task gets its own commit (or grouped commits per iteration)

4. **Git History Benefits**
   - `git log --grep="9.4"` shows when task was completed
   - `git log --grep="iteration 5"` shows all tasks done in iteration 5
   - `git show <commit>` shows full context including task numbers
   - Bisect can find which iteration introduced/fix a bug
   - Rollback can return to specific iteration if needed

### 5. Iteration Management

#### What Should Happen:
1. **Iteration Numbering**
   - Iteration 1: First incomplete task (or first `[/]` if exists)
   - Iteration N: After N-1 tasks completed
   - Iteration calculated as: `completed_count + 1`
   - This ensures iteration number always matches task progress

2. **Iteration Boundaries**
   - User can specify `--max-iterations <N>` to limit loop
   - Default is 50 iterations
   - Script resets state if iteration exceeds max (can be changed)
   - Iteration continues until all `[ ]` and `[/]` tasks exhausted

3. **Iteration State File**
   - `.ralph/ralph-loop.state.json` contains:
     - `iteration`: current iteration number
     - `minIterations`: always 1
     - `maxIterations`: from --max-iterations flag (default 50)
     - `completionPromise`: "COMPLETE" when all tasks done
     - `taskPromise`: "READY_FOR_NEXT_TASK" for continuing
     - `active`: true while running
     - `tasksMode`: true (tasks enabled)
     - `prompt`: template prompt file path
     - `startedAt`: timestamp when loop started
     - `model`: AI agent name (opencode)
   - Script updates these values during execution
   - File persists across script restarts

4. **Iteration Reset Logic**
   - When script restarts: reads completed tasks from tasks.md
   - Calculates: `iteration = completed_count + 1`
   - Updates Ralph state file with new iteration
   - If no incomplete tasks, sets iteration to completed_count (last iteration)
   - This prevents iteration number from getting out of sync

### 6. PRD Generation and Refresh

#### What Should Happen:
1. **Initial PRD Generation**
   - On script start, `read_openspec_artifacts()` is called
   - Reads full content of:
     - `openspec/changes/<name>/proposal.md` (why and what changes)
     - `openspec/changes/<name>/design.md` (technical approach)
     - All `openspec/changes/<name>/specs/*/spec.md` (detailed requirements)
   - Stores in global variables: `OPENSPEC_PROPOSAL`, `OPENSPEC_DESIGN`, `OPENSPEC_SPECS`
   - Generates PRD.md with all content
   - Writes to `.ralph/PRD.md`

2. **Per-Iteration PRD Refresh**
   - Before each iteration, script calls `get_current_task_context()`
   - This reads tasks.md and extracts:
     - Current in-progress task description
     - All completed tasks with descriptions
   - `generate_prd()` appends task context to PRD
   - PRD rewritten to `.ralph/PRD.md`
   - Ralph always reads fresh PRD on each iteration

3. **PRD Content Structure**
   ```markdown
   # Product Requirements Document

   *Generated from OpenSpec artifacts*

   ## Proposal
   <full proposal content>

   ## Specifications
   <all spec file contents>

   ## Design
   <full design content>

   ## Current Task Context
   <current task description>
   ## Completed Tasks for Git Commit
   <all completed tasks with descriptions>
   ```
   - Each iteration has up-to-date context
   - No stale information from previous iterations

4. **Why Fresh Context Matters**
   - AI makes better decisions with latest completed tasks
   - AI knows what was just done to avoid redoing work
   - AI can prioritize remaining tasks based on recent progress
   - Git commits reflect accurate state of completed work

## How the Script Achieves This

### Architecture Decision: Symlink for Single Source of Truth

**Implementation:**
```bash
ln -sf "$(realpath tasks.md)" .ralph/ralph-tasks.md
```

**Why This Matters:**
- Ralph receives `--tasks` flag pointing to `.ralph/ralph-tasks.md`
- `/opsx-apply` skill reads from same file path
- Both work on EXACT SAME FILE - no copies, no synchronization
- Any task state change is immediately visible to both systems
- Eliminates file sync issues completely

### Integration Point 1: OpenSpec → Script

**Data Flow:**
```
OpenSpec Artifacts → read_openspec_artifacts() → PRD → Ralph
```

**What's Passed to Ralph:**
- Complete project context (what, why, how, design)
- Technical specifications from all spec files
- Current task to work on
- List of what's been completed (for context)

**Key Functions:**
- `read_openspec_artifacts()`: Reads proposal.md, design.md, all specs/*/spec.md
- `generate_prd()`: Combines all artifacts into single PRD document
- Stores in global variables for skill access: `OPENSPEC_PROPOSAL`, `OPENSPEC_DESIGN`, `OPENSPEC_SPECS`

### Integration Point 2: Script → Ralph

**Data Flow:**
```
Script → PRD Generation + Task Context Extraction → ralph --prompt-file PRD.md
```

**What Ralph Receives:**
- Full OpenSpec proposal and design context
- All detailed specifications from specs directory
- Current task description (from tasks.md)
- Completed tasks list (for git commit messages)
- Template prompt with instructions and critical rules

**Key Functions:**
- `generate_prd()`: Creates comprehensive PRD with task context
- `get_current_task_context()`: Extracts current task and all completed tasks
- `execute_ralph_loop()`: Orchestrates Ralph invocation with all context
- `restore_ralph_state_from_tasks()`: Synchronizes iteration with task progress

### Integration Point 3: Ralph → OpenCode (AI Agent)

**Data Flow:**
```
Ralph → /opsx-apply skill → Code changes + Task updates
```

**What Ralph Does:**
- Reads PRD to understand full project context
- Finds current task in tasks.md
- Marks task as `[/]` before starting work
- Implements task by reading relevant specs and writing code
- Marks task as `[x]` when complete
- Creates git commit with task numbers and descriptions
- Outputs `READY_FOR_NEXT_TASK` to continue loop

**Key Skill:**
- `/opsx-apply` (openspec-apply-change): Handles task implementation
- Reads proposal, design, specs for implementation details
- Updates tasks.md checkboxes: `[/]` → `[x]`
- Generates appropriate git commit messages

### Integration Point 4: Ralph → Git

**Data Flow:**
```
Task completion → Git commit with task numbers → Ready for next task
```

**What Gets Committed:**
- Iteration number (from Ralph state)
- Brief summary of iteration
- List of all completed tasks with numbers and descriptions
- Traceable history linking iteration to specific tasks

**Why This Matters:**
- Clear audit trail of what was done when
- Easy to find which iteration completed which task
- Facilitates git bisect for debugging
- Enables rollback to specific iteration if needed

### Integration Point 5: Script State ↔ Ralph State

**Data Flow:**
```
Script → restore_ralph_state_from_tasks() → .ralph/ralph-loop.state.json
```

**What's Synchronized:**
- Iteration number calculated from completed task count
- Ensures Ralph's iteration matches actual progress
- Prevents mismatched iteration numbers in git commits

## What Makes This "Best of Both Worlds"

### Advantages Over Pure OpenSpec

1. **AI-Augmented Implementation**
   - AI can adapt to unexpected situations
   - AI can suggest improvements or alternatives
   - AI can debug and fix issues proactively
   - Human-in-the-loop for clarifications and guidance
   - Faster iteration cycle than manual implementation

2. **Automated Task Management**
   - Automatic task marking eliminates manual errors
   - Automatic git commits create traceable history
   - Iteration loop runs continuously without manual intervention
   - Progress tracking is continuous and visible

3. **Iterative Refinement**
   - Each iteration gets fresh context from completed tasks
   - AI learns from previous work for better future decisions
   - Course corrections happen naturally through iteration feedback
   - No big-bang implementation - gradual, tested refinement

### Advantages Over Pure Ralph

1. **Spec-Driven Context**
   - All implementation follows documented requirements
   - No guesswork or assumptions about what to build
   - Technical decisions are recorded in design artifacts
   - Consistent architecture and design patterns

2. **Formal Specifications**
   - Reviewable requirements and design documents
   - Reproducible development process
   - Maintainable codebase with clear documentation
   - Easier handoff and team collaboration

3. **Traceable Progress**
   - Git commits link to specific task numbers
   - Each iteration clearly marked and documented
   - Full audit trail of all decisions and changes
   - Easy to identify when features were added

### Advantages Over Manual Development

1. **Workflow Automation**
   - No need to manually track tasks or create commits
   - System handles iteration, task switching, and context refresh
   - Reduces cognitive load on manual task management
   - Focus on implementation, not process management

2. **Quality Assurance**
   - AI can test and validate implementations
   - Automated testing ensures requirements are met
   - Continuous improvement through iterative refinement
   - Reduced bugs and edge cases

## Critical Success Criteria

### Must-Have Behaviors

1. ✅ **Single Source of Truth for Tasks**
   - `tasks.md` is the ONLY file that tracks task state
   - Symlink ensures Ralph and script read same file
   - No duplicate task state anywhere

2. ✅ **OpenSpec Artifacts Remain Immutable**
   - `proposal.md`, `design.md`, `specs/*/spec.md` are read-only
   - Only `tasks.md` is modified by Ralph/script
   - Specs are always the reference for implementation

3. ✅ **Fresh Context Each Iteration**
   - PRD regenerated before each Ralph invocation
   - Includes current task and all completed tasks
   - No stale context from previous iterations

4. ✅ **Iteration Numbers Aligned with Task Progress**
   - Iteration N = completed tasks count + 1
   - Always reflects actual work done
   - No arbitrary or meaningless iteration numbers

5. ✅ **Git Commits Include Task Numbers**
   - Each commit lists completed tasks with their numbers
   - Clear traceability of what task completed in which iteration
   - Enables git bisect and debugging

6. ✅ **Continuous Loop Until Complete**
   - Loop continues automatically until no `[ ]` or `[/]` tasks remain
   - No manual iteration triggering needed
   - Or stops at max-iterations limit

7. ✅ **Error Recovery and Retry**
   - Failed tasks can be retried on next iteration
   - Script restart recalculates iteration from task state
   - No corrupted state or lost progress
   - Human can intervene by marking tasks `[x]` to skip

8. ✅ **Human-in-the-Loop Capability**
   - Script can be paused/interrupted (Ctrl+C)
   - AI can ask clarifying questions
   - User can provide additional context or direction
   - Manual task updates possible during pause

## What Should NOT Happen (Anti-Patterns)

### ❌ DO NOT Maintain Separate Task State

**Wrong Pattern:**
```python
# In Ralph or separate tracking
Ralph_STATE = {
    "current_task": "...",
    "completed_tasks": [...],
    "iteration": 5
}
```

**Why Wrong:**
- Creates duplication and sync issues
- tasks.md should be source of truth
- In-memory state gets stale or lost
- No single source of truth

**Correct Pattern:**
```bash
# Always read from tasks.md
grep "^- \[x\]" tasks.md  # Get completed tasks
grep "^- \[/\]" tasks.md  # Get in-progress task
```

### ❌ DO NOT Hardcode Iteration Numbers

**Wrong Pattern:**
```bash
COMMIT_MSG="Ralph iteration 3: work in progress"
# Uses hardcoded iteration number that doesn't match actual progress
```

**Why Wrong:**
- Iteration numbers become meaningless
- Git commits don't reflect actual work
- Cannot trace which tasks completed in which iteration
- Breaks correlation between progress and iteration number

**Correct Pattern:**
```bash
# Calculate iteration from actual task progress
completed_count=$(grep -c "^- \[x\]" tasks.md)
iteration=$((completed_count + 1))
COMMIT_MSG="Ralph iteration $iteration: $task_description"
```

### ❌ DO NOT Use Stale Context

**Wrong Pattern:**
```bash
# Use old PRD without regenerating
ralph --prompt-file .ralph/PRD.md  # Never regenerated
```

**Why Wrong:**
- Context doesn't include newly completed tasks
- AI doesn't know what was just done
- Risk of redoing work or missing dependencies
- No iteration feedback loop

**Correct Pattern:**
```bash
# Always regenerate PRD before each iteration
generate_prd "$change_dir" > .ralph/PRD.md
ralph --prompt-file .ralph/PRD.md
```

### ❌ DO NOT Break Symlink

**Wrong Pattern:**
```bash
# Copy tasks file instead of symlink
cp tasks.md .ralph/ralph-tasks.md  # Creates duplicate
```

**Why Wrong:**
- Breaks sync between Ralph and openspec-apply-change
- Both systems write to different files
- Task state gets out of sync
- Confusion about which file is source of truth

**Correct Pattern:**
```bash
# Always use symlink to single source of truth
ln -sf "$(realpath tasks.md)" .ralph/ralph-tasks.md
```

## Ralph Wiggum Technique with This Script

### Why This Alignment is Important

The `ralph-run.sh` script is designed to work with Ralph Wiggum's iterative AI development approach. This means:

1. **New Context Every Iteration**
   - Ralph Wiggum's power comes from running the AI agent with fresh context
   - Old context can lead to stale decisions or repeated work
   - Each iteration should have:
     - Latest task progress (what was just completed)
     - Current task to work on (what to do next)
     - All OpenSpec artifacts (what, why, how, design, specs)
   - The PRD regeneration provides this fresh context

2. **Context Evolution**
   - As tasks complete, context evolves:
     ```
     Iteration 1: Task A completed → Context includes [A] as done
     Iteration 2: Task B completed → Context includes [A], [B] as done
     Iteration 3: Task C completed → Context includes [A], [B], [C] as done
     ```
   - AI can make decisions based on cumulative progress
   - Each iteration builds on previous work

3. **Avoiding Stale Decisions**
   - Without fresh context, AI might:
     - Forget what was just completed and redo it
     - Miss dependencies between tasks
     - Make architectural decisions without knowing recent changes
     - Generate code that conflicts with completed work
   - Fresh context prevents all these issues

4. **Continuous Improvement Loop**
   - Ralph provides feedback (implementation, errors, test results)
   - Next iteration incorporates this feedback
   - Quality improves gradually through iteration cycle
   - Bad decisions are corrected, good decisions are reinforced

### How the Script Ensures This

1. **PRD Regeneration Before Each Iteration**
   ```bash
   # In generate_prd() function
   task_context=$(get_current_task_context "$change_dir")
   # Include context in PRD
   prd_content+=$task_context
   ```
   - This ensures Ralph sees latest completed tasks before each decision

2. **Completed Tasks List in PRD**
   - PRD includes "## Completed Tasks for Git Commit" section
   - Lists all `[x]` tasks with descriptions
   - AI can reference these for proper git commit messages
   - Provides full context of what work was done

3. **No Caching of Old Context**
   - PRD is regenerated (not cached)
   - Always reads fresh from tasks.md
   - No risk of using stale or outdated task state

## Potential Missing Features and Enhancements

### What's Currently Missing (Opportunities)

1. **Automatic PRD Updates During Skill Execution**
   - Current: PRD only regenerated at script start, not during skill execution
   - Issue: If Ralph completes multiple tasks in one iteration, PRD becomes stale
   - Enhancement: Hook into Ralph's skill lifecycle to update PRD after each task
   - Benefit: Ralph always has latest context, better decisions

2. **Progress Dashboard**
   - Current: Script outputs minimal progress (iteration count)
   - Issue: Hard to see overall progress, remaining tasks
   - Enhancement: Display progress bar, tasks completed/remaining, estimated time
   - Benefit: Better visibility into development status

3. **Task Dependency Support**
   - Current: Tasks executed in numerical order (first incomplete task)
   - Issue: If task B depends on task A, but A comes after B, out-of-order execution
   - Enhancement: Parse task dependencies from spec files, execute in dependency order
   - Benefit: Logical task sequence, no dependency violations

4. **Incremental PRD Updates**
   - Current: Full PRD regenerated each iteration (can be slow with large specs)
   - Issue: I/O overhead reading all spec files every time
   - Enhancement: Only update changed sections (task context, completed tasks)
   - Benefit: Faster iteration starts, lower CPU usage

5. **Error Recovery and State Persistence**
   - Current: Basic error handling, state recalculates on restart
   - Issue: If Ralph crashes mid-task, task state may be inconsistent
   - Enhancement: Detect Ralph crashes, restore task state to last safe point
   - Benefit: Robust against failures, no lost progress

6. **Task Parallelization**
   - Current: One task per iteration (sequential)
   - Issue: Some tasks could be done in parallel (independent tasks)
   - Enhancement: Identify independent tasks, execute multiple per iteration
   - Benefit: Faster overall completion, better resource utilization

### Compromises Made (Trade-offs)

1. **Full PRD vs Incremental PRD**
   - Trade-off: Full PRD every iteration vs partial updates
   - Decision: Use full PRD for simplicity and reliability
   - Rationale: Simpler code, easier to debug, guaranteed fresh context
   - Impact: Slightly slower iterations with large specs, acceptable trade-off

2. **Git Commit Frequency**
   - Trade-off: Commit per task vs commit per iteration
   - Decision: Commit per task (or small batches) for traceability
   - Rationale: Better git history, easier debugging, immediate snapshot
   - Impact: More commits, but clearer progress tracking

3. **Single-Task vs Multi-Task Iterations**
   - Trade-off: One task per iteration vs multiple tasks
   - Decision: Let Ralph decide task granularity per iteration
   - Rationale: AI can pace itself, natural stopping points
   - Impact: Less predictable iteration count, but more adaptive to task complexity

## Why This Approach Matters for Spec-Driven Development

### Benefits for Development Team

1. **Consistency and Discipline**
   - All work follows documented requirements
   - No ad-hoc decisions or implementation drift
   - Clear process that anyone can follow
   - Reduces bugs from misinterpretation or missing requirements

2. **Traceability and Auditability**
   - Git commits link to specific task numbers
   - Can answer "when was feature X added?" with precision
   - Can find which iteration introduced a bug
   - Can rollback to specific state if needed

3. **Quality and Testing**
   - Automated testing with each task
   - AI validates implementation against requirements
   - Continuous improvement through iteration feedback
   - Reduced production bugs and edge cases

4. **Maintainability**
   - Clear documentation for all features
   - Code organized according to spec structure
   - Easy to onboard new developers
   - Easier to make changes or fix bugs

### Benefits for AI-Augmented Development

1. **Leveraging AI Capabilities**
   - AI handles rote implementation tasks efficiently
   - AI provides intelligent problem-solving and debugging
   - AI adapts to unexpected situations flexibly
   - Reduces developer fatigue on repetitive tasks

2. **Iterative Refinement**
   - Each iteration improves quality based on previous work
   - Gradual, tested approach vs big-bang implementation
   - Course corrections happen naturally through feedback
   - Better final product quality

3. **Continuous Workflow**
   - No waiting for manual task progression
   - Automatic context refresh and git commits
   - Hands-off operation once started
   - Focus on review and direction, not process management

## Summary: Why This is the "Best of Both Worlds"

### The Three Pillars

1. **OpenSpec**: Formal, rigorous specifications for what to build
2. **Ralph Wiggum**: AI-powered, iterative, adaptive implementation
3. **tasks.md**: Simple, reliable task tracking with automatic state management

### The Resulting Workflow

When combined, these create a development workflow where:

- ✅ **Requirements are clearly defined** (OpenSpec)
- ✅ **Implementation is AI-augmented** (Ralph Wiggum)
- ✅ **Progress is automatically tracked** (tasks.md + Ralph)
- ✅ **Context is always fresh** (PRD regeneration)
- ✅ **Work is traceable** (git commits with task numbers)
- ✅ **Loop runs continuously** (no manual intervention needed)
- ✅ **Human can intervene** (pause, clarify, modify)
- ✅ **Quality improves iteratively** (continuous feedback loop)

### Why No Other Approach is Better

This hybrid approach is optimal because:

1. **Separation of Concerns**: Specification, implementation, and tracking are separate systems
2. **Single Source of Truth**: tasks.md prevents state duplication and sync issues
3. **Fresh Context AI**: Each iteration has complete, up-to-date context for better decisions
4. **Automation**: Task marking, git commits, and iteration progression are all automated
5. **Flexibility**: Human can pause, clarify, or modify at any point
6. **Traceability**: Git history links iterations to specific tasks for auditing
7. **Quality**: AI ensures requirements are met and tests pass
8. **Maintainability**: Clear specs and automated tracking make codebase maintainable

Any deviation from this architecture would compromise one or more of these principles, leading to:
- Duplicate or out-of-sync task state
- Stale AI context making poor decisions
- Missing or incorrect git history
- Manual process overhead
- Loss of traceability or auditability
- Implementation drift from specifications
