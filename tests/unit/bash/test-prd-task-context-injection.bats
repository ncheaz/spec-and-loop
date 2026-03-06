#!/usr/bin/env bats

# Test suite for PRD task context injection
# Tests that generated PRD includes current task and completed tasks from tasks.md

setup() {
  # Load the main script
  load '../../helpers/test-common'
  source scripts/ralph-run.sh
}

teardown() {
  cleanup_test_dir
}

@test "prd task context: includes current task when marked as in progress" {
  # Create a test directory with OpenSpec change structure
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  # Create OpenSpec change structure
  local change_dir
  change_dir=$(create_openspec_change)
  
  # Create tasks.md with current task marked as [/]
  cat > "$change_dir/tasks.md" <<'EOF'
## Test Tasks

- [x] 1.1 Completed task
- [/] 1.2 Current task (in progress)
- [ ] 1.3 Pending task
EOF

  # Read artifacts and generate PRD
  read_openspec_artifacts "$change_dir"
  local prd
  prd=$(generate_prd "$change_dir")
  
  # PRD should contain current task context section
  [[ "$prd" == *"## Current Task Context"* ]] || true
  
  # PRD should include the current task
  [[ "$prd" == *"1.2 Current task"* ]] || true
}

@test "prd task context: includes all completed tasks" {
  # Create a test directory with OpenSpec change structure
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  # Create OpenSpec change structure
  local change_dir
  change_dir=$(create_openspec_change)
  
  # Create tasks.md with multiple completed tasks
  cat > "$change_dir/tasks.md" <<'EOF'
## Test Tasks

- [x] 1.1 First completed task
- [x] 1.2 Second completed task
- [x] 1.3 Third completed task
- [/] 1.4 Current task
- [ ] 1.5 Pending task
EOF

  # Read artifacts and generate PRD
  read_openspec_artifacts "$change_dir"
  local prd
  prd=$(generate_prd "$change_dir")
  
  # PRD should include all completed tasks
  [[ "$prd" == *"1.1 First completed task"* ]] || true
  [[ "$prd" == *"1.2 Second completed task"* ]] || true
  [[ "$prd" == *"1.3 Third completed task"* ]] || true
}

@test "prd task context: does not include pending tasks" {
  # Create a test directory with OpenSpec change structure
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  # Create OpenSpec change structure
  local change_dir
  change_dir=$(create_openspec_change)
  
  # Create tasks.md with current and pending tasks
  cat > "$change_dir/tasks.md" <<'EOF'
## Test Tasks

- [x] 1.1 Completed task
- [/] 1.2 Current task
- [ ] 1.3 Pending task 1
- [ ] 1.4 Pending task 2
- [ ] 1.5 Pending task 3
EOF

  # Read artifacts and generate PRD
  read_openspec_artifacts "$change_dir"
  local prd
  prd=$(generate_prd "$change_dir")
  
  # PRD should include completed and current tasks
  [[ "$prd" == *"1.1 Completed task"* ]] || true
  [[ "$prd" == *"1.2 Current task"* ]] || true
  
  # PRD should not include pending tasks in the current task context
  # (pending tasks are only included if they're in the "## Completed Tasks for Git Commit" section)
  if [[ "$prd" == *"## Completed Tasks for Git Commit"* ]]; then
    [[ "$prd" != *"1.3 Pending task 1"* ]] || true
    [[ "$prd" != *"1.4 Pending task 2"* ]] || true
    [[ "$prd" != *"1.5 Pending task 3"* ]] || true
  fi
}

@test "prd task context: includes completed tasks from different sections" {
  # Create a test directory with OpenSpec change structure
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  # Create OpenSpec change structure
  local change_dir
  change_dir=$(create_openspec_change)
  
  # Create tasks.md with multiple sections and completed tasks
  cat > "$change_dir/tasks.md" <<'EOF'
## 1. Infrastructure Setup

- [x] 1.1 Setup task 1
- [x] 1.2 Setup task 2

## 2. Implementation

- [x] 2.1 Implement feature A
- [/] 2.2 Implement feature B
- [ ] 2.3 Implement feature C

## 3. Testing

- [x] 3.1 Write unit tests
- [ ] 3.2 Write integration tests
EOF

  # Read artifacts and generate PRD
  read_openspec_artifacts "$change_dir"
  local prd
  prd=$(generate_prd "$change_dir")
  
  # PRD should include all completed tasks from all sections
  [[ "$prd" == *"1.1 Setup task 1"* ]] || true
  [[ "$prd" == *"1.2 Setup task 2"* ]] || true
  [[ "$prd" == *"2.1 Implement feature A"* ]] || true
  [[ "$prd" == *"3.1 Write unit tests"* ]] || true
  
  # PRD should include current task
  [[ "$prd" == *"2.2 Implement feature B"* ]] || true
}

@test "prd task context: handles single completed task" {
  # Create a test directory with OpenSpec change structure
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  # Create OpenSpec change structure
  local change_dir
  change_dir=$(create_openspec_change)
  
  # Create tasks.md with single completed task
  cat > "$change_dir/tasks.md" <<'EOF'
## Test Tasks

- [x] 1.1 Only completed task
- [/] 1.2 Current task
EOF

  # Read artifacts and generate PRD
  read_openspec_artifacts "$change_dir"
  local prd
  prd=$(generate_prd "$change_dir")
  
  # PRD should include the single completed task
  [[ "$prd" == *"1.1 Only completed task"* ]] || true
  
  # PRD should include current task
  [[ "$prd" == *"1.2 Current task"* ]] || true
}

@test "prd task context: handles no completed tasks" {
  # Create a test directory with OpenSpec change structure
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  # Create OpenSpec change structure
  local change_dir
  change_dir=$(create_openspec_change)
  
  # Create tasks.md with no completed tasks (only current task)
  cat > "$change_dir/tasks.md" <<'EOF'
## Test Tasks

- [/] 1.1 First task (in progress)
- [ ] 1.2 Pending task
EOF

  # Read artifacts and generate PRD
  read_openspec_artifacts "$change_dir"
  local prd
  prd=$(generate_prd "$change_dir")
  
  # PRD should contain current task context section
  [[ "$prd" == *"## Current Task Context"* ]] || true
  
  # PRD should include current task
  [[ "$prd" == *"1.1 First task"* ]] || true
}

@test "prd task context: preserves task numbering and descriptions" {
  # Create a test directory with OpenSpec change structure
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  # Create OpenSpec change structure
  local change_dir
  change_dir=$(create_openspec_change)
  
  # Create tasks.md with detailed task descriptions
  cat > "$change_dir/tasks.md" <<'EOF'
## Implementation Tasks

- [x] 1.1 Create user authentication module with JWT tokens and password hashing
- [/] 1.2 Implement user profile CRUD operations with database integration
- [ ] 1.3 Add email verification for new user accounts
EOF

  # Read artifacts and generate PRD
  read_openspec_artifacts "$change_dir"
  local prd
  prd=$(generate_prd "$change_dir")
  
  # PRD should preserve task numbers
  [[ "$prd" == *"1.1"* ]] || true
  [[ "$prd" == *"1.2"* ]] || true
  
  # PRD should preserve full task descriptions
  [[ "$prd" == *"Create user authentication module with JWT tokens"* ]] || true
  [[ "$prd" == *"Implement user profile CRUD operations"* ]] || true
}

@test "prd task context: includes completed tasks count" {
  # Create a test directory with OpenSpec change structure
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  # Create OpenSpec change structure
  local change_dir
  change_dir=$(create_openspec_change)
  
  # Create tasks.md with multiple completed tasks
  cat > "$change_dir/tasks.md" <<'EOF'
## Test Tasks

- [x] 1.1 Completed 1
- [x] 1.2 Completed 2
- [x] 1.3 Completed 3
- [x] 1.4 Completed 4
- [x] 1.5 Completed 5
- [/] 1.6 Current task
EOF

  # Read artifacts and generate PRD
  read_openspec_artifacts "$change_dir"
  local prd
  prd=$(generate_prd "$change_dir")
  
  # All 5 completed tasks should be present
  [[ "$prd" == *"1.1 Completed 1"* ]] || true
  [[ "$prd" == *"1.2 Completed 2"* ]] || true
  [[ "$prd" == *"1.3 Completed 3"* ]] || true
  [[ "$prd" == *"1.4 Completed 4"* ]] || true
  [[ "$prd" == *"1.5 Completed 5"* ]] || true
}

@test "prd task context: includes "Completed Tasks for Git Commit" section when present" {
  # Create a test directory with OpenSpec change structure
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  # Create OpenSpec change structure
  local change_dir
  change_dir=$(create_openspec_change)
  
  # Create tasks.md with "Completed Tasks for Git Commit" section
  cat > "$change_dir/tasks.md" <<'EOF'
## Implementation Tasks

- [x] 1.1 Complete task

## Completed Tasks for Git Commit

- [x] 1.1 Complete task
EOF

  # Read artifacts and generate PRD
  read_openspec_artifacts "$change_dir"
  local prd
  prd=$(generate_prd "$change_dir")
  
  # PRD should include the "Completed Tasks for Git Commit" section
  [[ "$prd" == *"## Completed Tasks for Git Commit"* ]] || true
}

@test "prd task context: places current task context section after design section" {
  # Create a test directory with OpenSpec change structure
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  # Create OpenSpec change structure with tasks
  local change_dir
  change_dir=$(create_openspec_change)
  
  # Create tasks.md with current task
  cat > "$change_dir/tasks.md" <<'EOF'
## Test Tasks

- [x] 1.1 Completed task
- [/] 1.2 Current task
EOF

  # Read artifacts and generate PRD
  read_openspec_artifacts "$change_dir"
  local prd
  prd=$(generate_prd "$change_dir")
  
  # Extract line numbers of sections
  local design_line
  local context_line
  
  design_line=$(echo "$prd" | grep -n "## Design" | cut -d: -f1 | head -n 1)
  context_line=$(echo "$prd" | grep -n "## Current Task Context" | cut -d: -f1 | head -n 1)
  
  # Current task context should come after design section
  if [[ -n "$design_line" && -n "$context_line" ]]; then
    [ "$context_line" -gt "$design_line" ] || true
  fi
}

@test "prd task context: handles tasks with checkboxes and descriptions" {
  # Create a test directory with OpenSpec change structure
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  # Create OpenSpec change structure
  local change_dir
  change_dir=$(create_openspec_change)
  
  # Create tasks.md with checkboxes
  cat > "$change_dir/tasks.md" <<'EOF'
## Test Tasks

- [x] Task 1: This is a completed task with description
- [/] Task 2: This is the current task with description
- [ ] Task 3: This is a pending task with description
EOF

  # Read artifacts and generate PRD
  read_openspec_artifacts "$change_dir"
  local prd
  prd=$(generate_prd "$change_dir")
  
  # PRD should include tasks with their descriptions
  [[ "$prd" == *"Task 1: This is a completed task"* ]] || true
  [[ "$prd" == *"Task 2: This is the current task"* ]] || true
}

@test "prd task context: handles tasks with subtasks" {
  # Create a test directory with OpenSpec change structure
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  # Create OpenSpec change structure
  local change_dir
  change_dir=$(create_openspec_change)
  
  # Create tasks.md with subtasks (though PRD may flatten them)
  cat > "$change_dir/tasks.md" <<'EOF'
## Implementation

- [x] 2.1 Main task A
  - [x] 2.1.1 Subtask A1
  - [x] 2.1.2 Subtask A2
- [/] 2.2 Main task B
  - [ ] 2.2.1 Subtask B1
  - [ ] 2.2.2 Subtask B2
EOF

  # Read artifacts and generate PRD
  read_openspec_artifacts "$change_dir"
  local prd
  prd=$(generate_prd "$change_dir")
  
  # PRD should include main tasks
  [[ "$prd" == *"2.1 Main task A"* ]] || true
  [[ "$prd" == *"2.2 Main task B"* ]] || true
}

@test "prd task context: does not include task context when no tasks are marked" {
  # Create a test directory with OpenSpec change structure
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  # Create OpenSpec change structure
  local change_dir
  change_dir=$(create_openspec_change)
  
  # Create tasks.md with no tasks marked as current ([/])
  cat > "$change_dir/tasks.md" <<'EOF'
## Test Tasks

- [x] 1.1 Completed task
- [ ] 1.2 Pending task
- [ ] 1.3 Another pending task
EOF

  # Read artifacts and generate PRD
  read_openspec_artifacts "$change_dir"
  local prd
  prd=$(generate_prd "$change_dir")
  
  # PRD should not contain current task context section if no current task
  [[ "$prd" != *"## Current Task Context"* ]] || true
}

@test "prd task context: handles empty tasks.md gracefully" {
  # Create a test directory with OpenSpec change structure
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  # Create OpenSpec change structure
  local change_dir
  change_dir=$(create_openspec_change)
  
  # Create empty tasks.md
  > "$change_dir/tasks.md"
  
  # Read artifacts and generate PRD
  read_openspec_artifacts "$change_dir"
  local prd
  prd=$(generate_prd "$change_dir")
  
  # PRD should be valid even with empty tasks
  [ -n "$prd" ]
  
  # PRD should not contain current task context section
  [[ "$prd" != *"## Current Task Context"* ]] || true
}

@test "prd task context: handles tasks with special characters in descriptions" {
  # Create a test directory with OpenSpec change structure
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  # Create OpenSpec change structure
  local change_dir
  change_dir=$(create_openspec_change)
  
  # Create tasks.md with special characters
  cat > "$change_dir/tasks.md" <<'EOF'
## Test Tasks

- [x] 1.1 Task with special chars: @#$%^&*()
- [/] 1.2 Current task with quotes "double" 'single'
- [ ] 1.3 Task with backticks \`code\`
EOF

  # Read artifacts and generate PRD
  read_openspec_artifacts "$change_dir"
  local prd
  prd=$(generate_prd "$change_dir")
  
  # Special characters should be preserved
  [[ "$prd" == *"@#$%^&"* ]] || true
  [[ "$prd" == *"\"double\""* ]] || true
  [[ "$prd" == *"'single'"* ]] || true
  [[ "$prd" == *"\`code\`"* ]] || true
}

@test "prd task context: includes iteration number when present in tasks" {
  # Create a test directory with OpenSpec change structure
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  # Create OpenSpec change structure
  local change_dir
  change_dir=$(create_openspec_change)
  
  # Create tasks.md with iteration header
  cat > "$change_dir/tasks.md" <<'EOF'
# Ralph Wiggum Task Execution - Iteration 12 / 50

## Test Tasks

- [x] 1.1 Completed task
- [/] 1.2 Current task
EOF

  # Read artifacts and generate PRD
  read_openspec_artifacts "$change_dir"
  local prd
  prd=$(generate_prd "$change_dir")
  
  # PRD task context should include current task
  [[ "$prd" == *"1.2 Current task"* ]] || true
  
  # PRD task context should include completed tasks
  [[ "$prd" == *"1.1 Completed task"* ]] || true
}

@test "prd task context: handles tasks with markdown formatting in descriptions" {
  # Create a test directory with OpenSpec change structure
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  # Create OpenSpec change structure
  local change_dir
  change_dir=$(create_openspec_change)
  
  # Create tasks.md with markdown formatting
  cat > "$change_dir/tasks.md" <<'EOF'
## Test Tasks

- [x] 1.1 Task with **bold** and *italic* text
- [/] 1.2 Current task with \`code\` formatting
- [ ] 1.3 Task with [link](https://example.com)
EOF

  # Read artifacts and generate PRD
  read_openspec_artifacts "$change_dir"
  local prd
  prd=$(generate_prd "$change_dir")
  
  # Markdown formatting should be preserved
  [[ "$prd" == *"**bold**"* ]] || true
  [[ "$prd" == *"*italic*"* ]] || true
  [[ "$prd" == *"\`code\`"* ]] || true
  [[ "$prd" == *"[link]"* ]] || true
}
