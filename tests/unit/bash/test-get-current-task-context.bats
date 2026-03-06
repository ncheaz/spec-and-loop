#!/usr/bin/env bats

# Test suite for get_current_task_context() function
# Tests extraction of current task and completed tasks from tasks.md

setup() {
  load '../../helpers/test-common'
  source ../../../scripts/ralph-run.sh
  setup_test_dir
}

teardown() {
  cleanup_test_dir
}

@test "get_current_task_context: extracts in-progress task [/] correctly" {
  local tasks_file="$TEST_DIR/tasks.md"
  cat > "$tasks_file" <<'EOF'
## Test Tasks

- [x] 1.1 Completed task
- [/] 1.2 In-progress task
- [ ] 1.3 Incomplete task
EOF

  local context
  context=$(get_current_task_context "$TEST_DIR")

  # Verify current task section exists
  echo "$context" | grep -q "## Current Task"
  
  # Verify in-progress task is extracted
  echo "$context" | grep -q "1.2 In-progress task"
  
  # Verify completed task is included
  echo "$context" | grep -q "## Completed Tasks for Git Commit"
  echo "$context" | grep -q "- \[x\] 1.1 Completed task"
}

@test "get_current_task_context: falls back to first incomplete task [ ] when no in-progress" {
  local tasks_file="$TEST_DIR/tasks.md"
  cat > "$tasks_file" <<'EOF'
## Test Tasks

- [x] 1.1 Completed task
- [ ] 1.2 First incomplete task
- [ ] 1.3 Second incomplete task
EOF

  local context
  context=$(get_current_task_context "$TEST_DIR")

  # Verify current task section exists
  echo "$context" | grep -q "## Current Task"
  
  # Verify first incomplete task is extracted
  echo "$context" | grep -q "1.2 First incomplete task"
  
  # Verify second incomplete task is NOT in current task section
  ! echo "$context" | grep -q "1.3 Second incomplete task"
}

@test "get_current_task_context: collects all completed tasks [x]" {
  local tasks_file="$TEST_DIR/tasks.md"
  cat > "$tasks_file" <<'EOF'
## Test Tasks

- [x] 1.1 First completed task
- [x] 1.2 Second completed task
- [ ] 1.3 Incomplete task
- [x] 1.4 Third completed task
EOF

  local context
  context=$(get_current_task_context "$TEST_DIR")

  # Verify completed tasks section exists
  echo "$context" | grep -q "## Completed Tasks for Git Commit"
  
  # Verify all completed tasks are included
  echo "$context" | grep -q "- \[x\] 1.1 First completed task"
  echo "$context" | grep -q "- \[x\] 1.2 Second completed task"
  echo "$context" | grep -q "- \[x\] 1.4 Third completed task"
  
  # Verify incomplete task is not in completed section
  ! echo "$context" | grep -q "1.3 Incomplete task"
}

@test "get_current_task_context: returns empty string for missing tasks.md" {
  local context
  context=$(get_current_task_context "$TEST_DIR")

  # Verify empty string returned
  [ -z "$context" ]
}

@test "get_current_task_context: handles empty tasks.md file" {
  local tasks_file="$TEST_DIR/tasks.md"
  cat > "$tasks_file" <<'EOF'
## Test Tasks

EOF

  local context
  context=$(get_current_task_context "$TEST_DIR")

  # Verify empty context (no current task section)
  [ -z "$context" ]
}

@test "get_current_task_context: handles tasks file with no task lines" {
  local tasks_file="$TEST_DIR/tasks.md"
  cat > "$tasks_file" <<'EOF'
## Test Tasks

This is just text without checkboxes
1.1 A task without checkbox
Another line
EOF

  local context
  context=$(get_current_task_context "$TEST_DIR")

  # Verify empty context (no current task section)
  [ -z "$context" ]
}

@test "get_current_task_context: only has completed tasks section when only [x] tasks exist" {
  local tasks_file="$TEST_DIR/tasks.md"
  cat > "$tasks_file" <<'EOF'
## Test Tasks

- [x] 1.1 Completed task one
- [x] 1.2 Completed task two
EOF

  local context
  context=$(get_current_task_context "$TEST_DIR")

  # Verify current task section does NOT exist
  ! echo "$context" | grep -q "## Current Task"
  
  # Verify completed tasks section exists
  echo "$context" | grep -q "## Completed Tasks for Git Commit"
}

@test "get_current_task_context: preserves task numbering in completed tasks" {
  local tasks_file="$TEST_DIR/tasks.md"
  cat > "$tasks_file" <<'EOF'
## Test Tasks

- [x] 3.1 First task
- [/] 3.2 In-progress
- [x] 3.3 Second task
EOF

  local context
  context=$(get_current_task_context "$TEST_DIR")

  # Verify task numbers are preserved in completed section
  echo "$context" | grep -q "3.1 First task"
  echo "$context" | grep -q "3.3 Second task"
}

@test "get_current_task_context: handles special characters in task descriptions" {
  local tasks_file="$TEST_DIR/tasks.md"
  cat > "$tasks_file" <<'EOF'
## Test Tasks

- [x] 1.1 Task with (parentheses)
- [/] 1.2 Task with "quotes" and 'apostrophes'
- [ ] 1.3 Task with -hyphens- and /slashes/
EOF

  local context
  context=$(get_current_task_context "$TEST_DIR")

  # Verify special characters are preserved
  echo "$context" | grep -q "Task with (parentheses)"
  echo "$context" | grep -q "Task with.*quotes.*and.*apostrophes"
}

@test "get_current_task_context: ignores non-task lines in file" {
  local tasks_file="$TEST_DIR/tasks.md"
  cat > "$tasks_file" <<'EOF'
## Test Tasks

Some header text
Random description
- [x] 1.1 Completed task
More random text
- [ ] 1.2 Incomplete task
Footer content
EOF

  local context
  context=$(get_current_task_context "$TEST_DIR")

  # Verify only task lines are included in context
  echo "$context" | grep -q "1.1 Completed task"
  echo "$context" | grep -q "1.2 Incomplete task"
  ! echo "$context" | grep -q "Some header text"
  ! echo "$context" | grep -q "Random description"
}

@test "get_current_task_context: handles tasks with multi-line descriptions" {
  local tasks_file="$TEST_DIR/tasks.md"
  cat > "$tasks_file" <<'EOF'
## Test Tasks

- [x] 1.1 First completed task
- [/] 1.2 Current task with description
- [x] 1.3 Another completed task
EOF

  local context
  context=$(get_current_task_context "$TEST_DIR")

  # Verify task descriptions are complete
  echo "$context" | grep -q "Current task with description"
}
