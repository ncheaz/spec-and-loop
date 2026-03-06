#!/usr/bin/env bats

# Test suite for task state synchronization
# Tests accuracy of completed task count and state restoration

setup() {
  load '../../helpers/test-common'
  source scripts/ralph-run.sh
  setup_test_dir
}

teardown() {
  cleanup_test_dir
}

@test "task state synchronization: counts completed tasks [x] correctly" {
  local tasks_file="$TEST_DIR/tasks.md"
  cat > "$tasks_file" <<'EOF'
## Test Tasks

- [x] 1.1 Completed task one
- [x] 1.2 Completed task two
- [x] 1.3 Completed task three
- [ ] 1.4 Incomplete task
EOF

  # Count completed tasks using grep (same as restore_ralph_state_from_tasks)
  local completed_count
  completed_count=$(grep -c "^- \[x\]" "$tasks_file" 2>/dev/null || echo "0")

  # Verify correct count
  [ "$completed_count" -eq 3 ]
}

@test "task state synchronization: count is accurate when no tasks completed" {
  local tasks_file="$TEST_DIR/tasks.md"
  cat > "$tasks_file" <<'EOF'
## Test Tasks

- [ ] 1.1 Incomplete task one
- [ ] 1.2 Incomplete task two
- [/] 1.3 In-progress task
EOF

  # Count completed tasks
  local completed_count
  completed_count=$(grep -c "^- \[x\]" "$tasks_file" 2>/dev/null || echo "0")

  # Verify count is 0
  [ "$completed_count" -eq 0 ]
}

@test "task state synchronization: count is accurate for mixed states" {
  local tasks_file="$TEST_DIR/tasks.md"
  cat > "$tasks_file" <<'EOF'
## Test Tasks

- [x] 1.1 Completed task
- [ ] 1.2 Incomplete task
- [x] 1.3 Another completed task
- [/] 1.4 In-progress task
- [x] 1.5 Yet another completed task
- [ ] 1.6 Another incomplete task
EOF

  # Count completed tasks
  local completed_count
  completed_count=$(grep -c "^- \[x\]" "$tasks_file" 2>/dev/null || echo "0")

  # Verify count is 3
  [ "$completed_count" -eq 3 ]
}

@test "task state synchronization: get_current_task_context collects all completed tasks" {
  local tasks_file="$TEST_DIR/tasks.md"
  cat > "$tasks_file" <<'EOF'
## Test Tasks

- [x] 1.1 First completed task
- [/] 1.2 In-progress task
- [ ] 1.3 Incomplete task
- [x] 1.4 Second completed task
- [x] 1.5 Third completed task
EOF

  local context
  context=$(get_current_task_context "$TEST_DIR")

  # Verify completed tasks section exists
  echo "$context" | grep -q "## Completed Tasks for Git Commit"

  # Verify all completed tasks are included
  echo "$context" | grep -q "\- \[x\] 1.1 First completed task"
  echo "$context" | grep -q "\- \[x\] 1.4 Second completed task"
  echo "$context" | grep -q "\- \[x\] 1.5 Third completed task"

  # Verify in-progress and incomplete tasks are not in completed section
  ! echo "$context" | grep -q "1.2 In-progress task"
  ! echo "$context" | grep -q "1.3 Incomplete task"
}

@test "task state synchronization: count changes when task state changes" {
  local tasks_file="$TEST_DIR/tasks.md"

  # Start with no completed tasks
  cat > "$tasks_file" <<'EOF'
## Test Tasks

- [ ] 1.1 Task one
- [ ] 1.2 Task two
- [ ] 1.3 Task three
EOF

  local completed_count
  completed_count=$(grep -c "^- \[x\]" "$tasks_file" 2>/dev/null || echo "0")
  [ "$completed_count" -eq 0 ]

  # Mark one task as completed
  cat > "$tasks_file" <<'EOF'
## Test Tasks

- [x] 1.1 Task one
- [ ] 1.2 Task two
- [ ] 1.3 Task three
EOF

  completed_count=$(grep -c "^- \[x\]" "$tasks_file" 2>/dev/null || echo "0")
  [ "$completed_count" -eq 1 ]

  # Mark two more tasks as completed
  cat > "$tasks_file" <<'EOF'
## Test Tasks

- [x] 1.1 Task one
- [x] 1.2 Task two
- [x] 1.3 Task three
EOF

  completed_count=$(grep -c "^- \[x\]" "$tasks_file" 2>/dev/null || echo "0")
  [ "$completed_count" -eq 3 ]
}

@test "task state synchronization: handles empty tasks file" {
  local tasks_file="$TEST_DIR/tasks.md"
  cat > "$tasks_file" <<'EOF'
## Test Tasks

EOF

  # Count completed tasks
  local completed_count
  completed_count=$(grep -c "^- \[x\]" "$tasks_file" 2>/dev/null || echo "0")

  # Verify count is 0
  [ "$completed_count" -eq 0 ]
}

@test "task state synchronization: handles file without task lines" {
  local tasks_file="$TEST_DIR/tasks.md"
  cat > "$tasks_file" <<'EOF'
## Test Tasks

Some random text
1.1 Task without checkbox
More text
EOF

  # Count completed tasks
  local completed_count
  completed_count=$(grep -c "^- \[x\]" "$tasks_file" 2>/dev/null || echo "0")

  # Verify count is 0
  [ "$completed_count" -eq 0 ]
}

@test "task state synchronization: parse_tasks does NOT count completed tasks" {
  local tasks_file="$TEST_DIR/tasks.md"
  cat > "$tasks_file" <<'EOF'
## Test Tasks

- [x] 1.1 Completed task one
- [x] 1.2 Completed task two
- [x] 1.3 Completed task three
- [ ] 1.4 Incomplete task
EOF

  # Parse tasks (should only extract incomplete tasks)
  parse_tasks "$TEST_DIR"

  # Verify no tasks in TASKS array (parse_tasks ignores [x] tasks)
  [ "${#TASKS[@]}" -eq 1 ]
  [ "${TASKS[0]}" = "1.4 Incomplete task" ]
}

@test "task state synchronization: completed count matches get_current_task_context output" {
  local tasks_file="$TEST_DIR/tasks.md"
  cat > "$tasks_file" <<'EOF'
## Test Tasks

- [x] 1.1 First completed
- [x] 1.2 Second completed
- [/] 1.3 In-progress
- [ ] 1.4 Incomplete
- [x] 1.5 Third completed
EOF

  # Count completed tasks
  local completed_count
  completed_count=$(grep -c "^- \[x\]" "$tasks_file" 2>/dev/null || echo "0")
  [ "$completed_count" -eq 3 ]

  # Get task context and verify completed tasks section
  local context
  context=$(get_current_task_context "$TEST_DIR")

  # Count completed tasks in context output
  local context_completed_count
  context_completed_count=$(echo "$context" | grep -c "\- \[x\]" || echo "0")
  [ "$context_completed_count" -eq 3 ]
}
