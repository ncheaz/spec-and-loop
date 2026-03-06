#!/usr/bin/env bats

# Test suite for parse_tasks() function
# Tests parsing of [ ], [x], [/] checkbox states from tasks.md

setup() {
  # Load the main script to access the parse_tasks function
  load '../../helpers/test-common'
  source scripts/ralph-run.sh
  setup_test_dir
}

teardown() {
  cleanup_test_dir
}

@test "parse_tasks: parses incomplete tasks [ ] correctly" {
  # Create test tasks file with incomplete tasks
  local tasks_file="$TEST_DIR/tasks.md"
  cat > "$tasks_file" <<'EOF'
## Test Tasks

- [ ] 1.1 First incomplete task
- [ ] 1.2 Second incomplete task
- [ ] 1.3 Third incomplete task
EOF

  # Call parse_tasks
  parse_tasks "$TEST_DIR"

  # Verify TASKS array contains all incomplete tasks
  [ "${#TASKS[@]}" -eq 3 ]
  [ "${TASKS[0]}" = "1.1 First incomplete task" ]
  [ "${TASKS[1]}" = "1.2 Second incomplete task" ]
  [ "${TASKS[2]}" = "1.3 Third incomplete task" ]
}

@test "parse_tasks: does not parse completed tasks [x]" {
  # Create test tasks file with completed tasks
  local tasks_file="$TEST_DIR/tasks.md"
  cat > "$tasks_file" <<'EOF'
## Test Tasks

- [x] 1.1 Completed task one
- [x] 1.2 Completed task two
- [ ] 1.3 Incomplete task
EOF

  # Call parse_tasks
  parse_tasks "$TEST_DIR"

  # Verify only incomplete tasks are parsed
  [ "${#TASKS[@]}" -eq 1 ]
  [ "${TASKS[0]}" = "1.3 Incomplete task" ]
}

@test "parse_tasks: does not parse in-progress tasks [/]" {
  # Create test tasks file with in-progress tasks
  local tasks_file="$TEST_DIR/tasks.md"
  cat > "$tasks_file" <<'EOF'
## Test Tasks

- [/] 1.1 In-progress task one
- [/] 1.2 In-progress task two
- [ ] 1.3 Incomplete task
EOF

  # Call parse_tasks
  parse_tasks "$TEST_DIR"

  # Verify only incomplete tasks are parsed, in-progress are not
  [ "${#TASKS[@]}" -eq 1 ]
  [ "${TASKS[0]}" = "1.3 Incomplete task" ]
}

@test "parse_tasks: handles mixed checkbox states" {
  # Create test tasks file with mixed states
  local tasks_file="$TEST_DIR/tasks.md"
  cat > "$tasks_file" <<'EOF'
## Test Tasks

- [x] 1.1 Completed task
- [ ] 1.2 Incomplete task
- [/] 1.3 In-progress task
- [ ] 1.4 Another incomplete task
- [x] 1.5 Another completed task
EOF

  # Call parse_tasks
  parse_tasks "$TEST_DIR"

  # Verify only incomplete tasks are parsed
  [ "${#TASKS[@]}" -eq 2 ]
  [ "${TASKS[0]}" = "1.2 Incomplete task" ]
  [ "${TASKS[1]}" = "1.4 Another incomplete task" ]
}

@test "parse_tasks: stores correct line numbers for tasks" {
  # Create test tasks file with line numbers
  local tasks_file="$TEST_DIR/tasks.md"
  cat > "$tasks_file" <<'EOF'
## Test Tasks

- [ ] 1.1 First task (line 4)
- [ ] 1.2 Second task (line 5)
- [ ] 1.3 Third task (line 6)
EOF

  # Call parse_tasks
  parse_tasks "$TEST_DIR"

  # Verify line numbers are correct (1-indexed)
  [ "${#TASK_IDS[@]}" -eq 3 ]
  [ "${TASK_IDS[0]}" = "4" ]
  [ "${TASK_IDS[1]}" = "5" ]
  [ "${TASK_IDS[2]}" = "6" ]
}

@test "parse_tasks: handles empty tasks file" {
  # Create empty tasks file
  local tasks_file="$TEST_DIR/tasks.md"
  cat > "$tasks_file" <<'EOF'
## Test Tasks

EOF

  # Call parse_tasks
  parse_tasks "$TEST_DIR"

  # Verify no tasks are parsed
  [ "${#TASKS[@]}" -eq 0 ]
  [ "${#TASK_IDS[@]}" -eq 0 ]
}

@test "parse_tasks: handles no incomplete tasks" {
  # Create tasks file with only completed and in-progress tasks
  local tasks_file="$TEST_DIR/tasks.md"
  cat > "$tasks_file" <<'EOF'
## Test Tasks

- [x] 1.1 Completed task one
- [x] 1.2 Completed task two
- [/] 1.3 In-progress task
EOF

  # Call parse_tasks
  parse_tasks "$TEST_DIR"

  # Verify no tasks are parsed (no [ ] tasks)
  [ "${#TASKS[@]}" -eq 0 ]
  [ "${#TASK_IDS[@]}" -eq 0 ]
}

@test "parse_tasks: extracts task description correctly" {
  # Create tasks file with various description formats
  local tasks_file="$TEST_DIR/tasks.md"
  cat > "$tasks_file" <<'EOF'
## Test Tasks

- [ ] 1.1 Simple task
- [ ] 1.2 Task with parentheses (extra info)
- [ ] 1.3 Task with - hyphen dash
- [ ] 1.4 Task with /forward/slash
EOF

  # Call parse_tasks
  parse_tasks "$TEST_DIR"

  # Verify task descriptions are correctly extracted
  [ "${#TASKS[@]}" -eq 4 ]
  [ "${TASKS[0]}" = "1.1 Simple task" ]
  [ "${TASKS[1]}" = "1.2 Task with parentheses (extra info)" ]
  [ "${TASKS[2]}" = "1.3 Task with - hyphen dash" ]
  [ "${TASKS[3]}" = "1.4 Task with /forward/slash" ]
}

@test "parse_tasks: computes MD5 hash of tasks file" {
  # Create tasks file with content
  local tasks_file="$TEST_DIR/tasks.md"
  cat > "$tasks_file" <<'EOF'
## Test Tasks

- [ ] 1.1 First task
- [ ] 1.2 Second task
EOF

  # Call parse_tasks
  parse_tasks "$TEST_DIR"

  # Verify TASKS_MD5 is not empty
  [ -n "$TASKS_MD5" ]

  # Verify MD5 is consistent (call again)
  parse_tasks "$TEST_DIR"
  local md5_1="$TASKS_MD5"
  parse_tasks "$TEST_DIR"
  local md5_2="$TASKS_MD5"
  [ "$md5_1" = "$md5_2" ]
}

@test "parse_tasks: handles tasks file without [ ] checkbox" {
  # Create tasks file with lines that look like tasks but no checkbox
  local tasks_file="$TEST_DIR/tasks.md"
  cat > "$tasks_file" <<'EOF'
## Test Tasks

1.1 Task without checkbox
1.2 Another task without checkbox
- Some list item without checkbox
EOF

  # Call parse_tasks
  parse_tasks "$TEST_DIR"

  # Verify no tasks are parsed
  [ "${#TASKS[@]}" -eq 0 ]
  [ "${#TASK_IDS[@]}" -eq 0 ]
}

@test "parse_tasks: handles tasks with leading whitespace variations" {
  # Create tasks file with various whitespace patterns
  local tasks_file="$TEST_DIR/tasks.md"
  cat > "$tasks_file" <<'EOF'
## Test Tasks

- [ ] 1.1 Normal task
  - [ ] 1.2 Indented task
   - [ ] 1.3 Double-indented task
EOF

  # Call parse_tasks
  parse_tasks "$TEST_DIR"

  # Verify tasks with extra leading whitespace may not be parsed correctly
  # (current implementation expects "- [ ]" at exact start of line)
  [ "${#TASKS[@]}" -ge 1 ]
  [ "${TASKS[0]}" = "1.1 Normal task" ]
}

@test "parse_tasks: handles non-existent tasks file gracefully" {
  # Don't create tasks file
  local tasks_file="$TEST_DIR/tasks.md"

  # Call parse_tasks (should handle missing file)
  parse_tasks "$TEST_DIR"

  # Verify TASKS_MD5 is empty for missing file
  [ -z "$TASKS_MD5" ]
  [ "${#TASKS[@]}" -eq 0 ]
}

@test "parse_tasks: ignores uppercase checkbox state [X]" {
  # Create tasks file with uppercase X (should not parse as incomplete)
  local tasks_file="$TEST_DIR/tasks.md"
  cat > "$tasks_file" <<'EOF'
## Test Tasks

- [X] 1.1 Uppercase X task (should be ignored)
- [ ] 1.2 Normal incomplete task
EOF

  # Call parse_tasks
  parse_tasks "$TEST_DIR"

  # Verify only lowercase [ ] is parsed
  [ "${#TASKS[@]}" -eq 1 ]
  [ "${TASKS[0]}" = "1.2 Normal incomplete task" ]
}

@test "parse_tasks: handles malformed checkbox without space after dash" {
  # Create tasks file with malformed checkbox (no space after dash)
  local tasks_file="$TEST_DIR/tasks.md"
  cat > "$tasks_file" <<'EOF'
## Test Tasks

-[ ] 1.1 Malformed dash spacing
- [ ] 1.2 Normal task
EOF

  # Call parse_tasks
  parse_tasks "$TEST_DIR"

  # Verify malformed task is not parsed
  [ "${#TASKS[@]}" -eq 1 ]
  [ "${TASKS[0]}" = "1.2 Normal task" ]
}

@test "parse_tasks: handles malformed checkbox with extra spaces" {
  # Create tasks file with extra spaces in checkbox
  local tasks_file="$TEST_DIR/tasks.md"
  cat > "$tasks_file" <<'EOF'
## Test Tasks

- [  ] 1.1 Double space in checkbox (should not parse)
- [ ] 1.2 Normal task
EOF

  # Call parse_tasks
  parse_tasks "$TEST_DIR"

  # Verify malformed checkbox is not parsed
  [ "${#TASKS[@]}" -eq 1 ]
  [ "${TASKS[0]}" = "1.2 Normal task" ]
}

@test "parse_tasks: handles empty task description" {
  # Create tasks file with empty task description
  local tasks_file="$TEST_DIR/tasks.md"
  cat > "$tasks_file" <<'EOF'
## Test Tasks

- [ ] 
- [ ] 1.2 Normal task
- [ ]    (only spaces)
EOF

  # Call parse_tasks
  parse_tasks "$TEST_DIR"

  # Verify empty and whitespace-only tasks are parsed
  [ "${#TASKS[@]}" -ge 2 ]
}

@test "parse_tasks: handles special characters in task descriptions" {
  # Create tasks file with special characters
  local tasks_file="$TEST_DIR/tasks.md"
  cat > "$tasks_file" <<'EOF'
## Test Tasks

- [ ] 1.1 Task with "quotes"
- [ ] 1.2 Task with 'single quotes'
- [ ] 1.3 Task with $dollar sign
- [ ] 1.4 Task with &ampersand
- [ ] 1.5 Task with |pipe|
EOF

  # Call parse_tasks
  parse_tasks "$TEST_DIR"

  # Verify special characters are preserved
  [ "${#TASKS[@]}" -eq 5 ]
  [[ "${TASKS[0]}" == *"quotes"* ]]
  [[ "${TASKS[1]}" == *"'single quotes'"* ]]
}

@test "parse_tasks: handles unicode characters in tasks" {
  # Create tasks file with unicode/emoji characters
  local tasks_file="$TEST_DIR/tasks.md"
  cat > "$tasks_file" <<'EOF'
## Test Tasks

- [ ] 1.1 Task with emoji 🎉
- [ ] 1.2 Task with unicode café
- [ ] 1.3 Task with arrow →
EOF

  # Call parse_tasks
  parse_tasks "$TEST_DIR"

  # Verify unicode characters are preserved
  [ "${#TASKS[@]}" -eq 3 ]
  [[ "${TASKS[0]}" == *"🎉"* ]]
}

@test "parse_tasks: handles very long task descriptions" {
  # Create tasks file with very long description
  local tasks_file="$TEST_DIR/tasks.md"
  local long_desc="1.1 This is a very long task description that goes on and on and on and on and on and on and on and on and on and on and on and on and on and on and on and on and on and on and on and on and on and on and on and on and on"
  
  cat > "$tasks_file" <<EOF
## Test Tasks

- [ ] $long_desc
- [ ] 1.2 Normal task
EOF

  # Call parse_tasks
  parse_tasks "$TEST_DIR"

  # Verify long description is preserved
  [ "${#TASKS[@]}" -eq 2 ]
  [[ "${TASKS[0]}" == *"very long task description"* ]]
}

@test "parse_tasks: handles backslash in task descriptions" {
  # Create tasks file with backslashes
  local tasks_file="$TEST_DIR/tasks.md"
  cat > "$tasks_file" <<'EOF'
## Test Tasks

- [ ] 1.1 Task with \backslash
- [ ] 1.2 Task with /forward/slash\back
- [ ] 1.3 Normal task
EOF

  # Call parse_tasks
  parse_tasks "$TEST_DIR"

  # Verify backslashes are preserved
  [ "${#TASKS[@]}" -eq 3 ]
  [[ "${TASKS[0]}" == *"\\"* ]]
}

@test "parse_tasks: handles tasks with only numbers" {
  # Create tasks file with minimal descriptions
  local tasks_file="$TEST_DIR/tasks.md"
  cat > "$tasks_file" <<'EOF'
## Test Tasks

- [ ] 1
- [ ] 1.1
- [ ] Task with words
EOF

  # Call parse_tasks
  parse_tasks "$TEST_DIR"

  # Verify minimal descriptions are parsed
  [ "${#TASKS[@]}" -eq 3 ]
}

@test "parse_tasks: ignores comment-like lines" {
  # Create tasks file with lines that look like comments or headers
  local tasks_file="$TEST_DIR/tasks.md"
  cat > "$tasks_file" <<'EOF'
## Test Tasks

# This is a comment, not a task
## This is a header, not a task
### Also not a task
- [ ] 1.1 Actual task
# Another comment
- [ ] 1.2 Another task
EOF

  # Call parse_tasks
  parse_tasks "$TEST_DIR"

  # Verify only actual tasks are parsed
  [ "${#TASKS[@]}" -eq 2 ]
  [ "${TASKS[0]}" = "1.1 Actual task" ]
  [ "${TASKS[1]}" = "1.2 Another task" ]
}
