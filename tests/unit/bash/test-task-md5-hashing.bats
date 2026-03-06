#!/usr/bin/env bats

# Test suite for check_tasks_modified() function
# Tests MD5 hashing for detecting task file modifications

setup() {
  load '../helpers/test-common'
  source ../../../../scripts/ralph-run.sh
  TEST_DIR=$(setup_test_dir "task-md5-hashing")
}

teardown() {
  cleanup_test_dir
}

@test "check_tasks_modified: returns 0 when tasks.md has been modified" {
  # Create initial tasks.md
  local tasks_file="$TEST_DIR/tasks.md"
  cat > "$tasks_file" <<'EOF'
## Test Tasks

- [ ] 1.1 Task one
- [ ] 1.2 Task two
EOF

  # Get original MD5
  local original_md5
  original_md5=$(get_file_md5 "$tasks_file")

  # Modify tasks.md
  cat > "$tasks_file" <<'EOF'
## Test Tasks

- [ ] 1.1 Task one
- [x] 1.2 Task two
EOF

  # Check if modified (should return 0 = true)
  run check_tasks_modified "$TEST_DIR" "$original_md5"
  [ "$status" -eq 0 ]
}

@test "check_tasks_modified: returns 1 when tasks.md has not been modified" {
  # Create tasks.md
  local tasks_file="$TEST_DIR/tasks.md"
  cat > "$tasks_file" <<'EOF'
## Test Tasks

- [ ] 1.1 Task one
- [ ] 1.2 Task two
EOF

  # Get original MD5
  local original_md5
  original_md5=$(get_file_md5 "$tasks_file")

  # Do not modify tasks.md

  # Check if modified (should return 1 = false)
  run check_tasks_modified "$TEST_DIR" "$original_md5"
  [ "$status" -eq 1 ]
}

@test "check_tasks_modified: returns 1 when tasks.md file does not exist" {
  # Get original MD5 (won't matter since file doesn't exist)
  local original_md5="some_md5_hash"

  # Check if modified (should return 1 = false since file doesn't exist)
  run check_tasks_modified "$TEST_DIR" "$original_md5"
  [ "$status" -eq 1 ]
}

@test "check_tasks_modified: detects single character change" {
  # Create tasks.md
  local tasks_file="$TEST_DIR/tasks.md"
  cat > "$tasks_file" <<'EOF'
## Test Tasks

- [ ] 1.1 Task one
EOF

  # Get original MD5
  local original_md5
  original_md5=$(get_file_md5 "$tasks_file")

  # Modify single character
  cat > "$tasks_file" <<'EOF'
## Test Tasks

- [x] 1.1 Task one
EOF

  # Check if modified
  run check_tasks_modified "$TEST_DIR" "$original_md5"
  [ "$status" -eq 0 ]
}

@test "check_tasks_modified: detects addition of new task" {
  # Create tasks.md
  local tasks_file="$TEST_DIR/tasks.md"
  cat > "$tasks_file" <<'EOF'
## Test Tasks

- [ ] 1.1 Task one
EOF

  # Get original MD5
  local original_md5
  original_md5=$(get_file_md5 "$tasks_file")

  # Add new task
  cat > "$tasks_file" <<'EOF'
## Test Tasks

- [ ] 1.1 Task one
- [ ] 1.2 Task two
EOF

  # Check if modified
  run check_tasks_modified "$TEST_DIR" "$original_md5"
  [ "$status" -eq 0 ]
}

@test "check_tasks_modified: detects removal of task" {
  # Create tasks.md
  local tasks_file="$TEST_DIR/tasks.md"
  cat > "$tasks_file" <<'EOF'
## Test Tasks

- [ ] 1.1 Task one
- [ ] 1.2 Task two
- [ ] 1.3 Task three
EOF

  # Get original MD5
  local original_md5
  original_md5=$(get_file_md5 "$tasks_file")

  # Remove task
  cat > "$tasks_file" <<'EOF'
## Test Tasks

- [ ] 1.1 Task one
- [ ] 1.2 Task two
EOF

  # Check if modified
  run check_tasks_modified "$TEST_DIR" "$original_md5"
  [ "$status" -eq 0 ]
}

@test "check_tasks_modified: detects whitespace changes" {
  # Create tasks.md
  local tasks_file="$TEST_DIR/tasks.md"
  cat > "$tasks_file" <<'EOF'
## Test Tasks

- [ ] 1.1 Task one
EOF

  # Get original MD5
  local original_md5
  original_md5=$(get_file_md5 "$tasks_file")

  # Add whitespace
  cat > "$tasks_file" <<'EOF'
## Test Tasks


- [ ] 1.1 Task one
EOF

  # Check if modified
  run check_tasks_modified "$TEST_DIR" "$original_md5"
  [ "$status" -eq 0 ]
}

@test "check_tasks_modified: works with empty original_md5" {
  # Create tasks.md
  local tasks_file="$TEST_DIR/tasks.md"
  cat > "$tasks_file" <<'EOF'
## Test Tasks

- [ ] 1.1 Task one
EOF

  # Use empty MD5 as original
  local original_md5=""

  # Check if modified (should detect change since empty != real MD5)
  run check_tasks_modified "$TEST_DIR" "$original_md5"
  [ "$status" -eq 0 ]
}

@test "check_tasks_modified: uses correct tasks file path" {
  # Create tasks.md in correct location
  local tasks_file="$TEST_DIR/tasks.md"
  cat > "$tasks_file" <<'EOF'
## Test Tasks

- [ ] 1.1 Task one
EOF

  # Get original MD5
  local original_md5
  original_md5=$(get_file_md5 "$tasks_file")

  # Modify tasks.md
  cat > "$tasks_file" <<'EOF'
## Test Tasks

- [x] 1.1 Task one
EOF

  # Check if modified using change_dir path
  run check_tasks_modified "$TEST_DIR" "$original_md5"
  [ "$status" -eq 0 ]
}

@test "check_tasks_modified: works with multiline task descriptions" {
  # Create tasks.md with complex content
  local tasks_file="$TEST_DIR/tasks.md"
  cat > "$tasks_file" <<'EOF'
## Test Tasks

- [ ] 1.1 Complex task with
    multiple lines
- [ ] 1.2 Another task
EOF

  # Get original MD5
  local original_md5
  original_md5=$(get_file_md5 "$tasks_file")

  # Modify in multiline section
  cat > "$tasks_file" <<'EOF'
## Test Tasks

- [ ] 1.1 Complex task with
    modified lines
- [ ] 1.2 Another task
EOF

  # Check if modified
  run check_tasks_modified "$TEST_DIR" "$original_md5"
  [ "$status" -eq 0 ]
}

@test "check_tasks_modified: MD5 hash is consistent across multiple calls" {
  # Create tasks.md
  local tasks_file="$TEST_DIR/tasks.md"
  cat > "$tasks_file" <<'EOF'
## Test Tasks

- [ ] 1.1 Task one
- [ ] 1.2 Task two
EOF

  # Get MD5 twice
  local md5_1
  local md5_2
  md5_1=$(get_file_md5 "$tasks_file")
  md5_2=$(get_file_md5 "$tasks_file")

  # Verify MD5s are identical
  [ "$md5_1" = "$md5_2" ]

  # Verify not detected as modified
  run check_tasks_modified "$TEST_DIR" "$md5_1"
  [ "$status" -eq 1 ]
}

@test "check_tasks_modified: works with special characters in tasks" {
  # Create tasks.md with special characters
  local tasks_file="$TEST_DIR/tasks.md"
  cat > "$tasks_file" <<'EOF'
## Test Tasks

- [ ] 1.1 Task with $special && chars
- [ ] 1.2 Task with <html> tags
EOF

  # Get original MD5
  local original_md5
  original_md5=$(get_file_md5 "$tasks_file")

  # Modify special characters
  cat > "$tasks_file" <<'EOF'
## Test Tasks

- [ ] 1.1 Task with @other ## chars
- [ ] 1.2 Task with <html> tags
EOF

  # Check if modified
  run check_tasks_modified "$TEST_DIR" "$original_md5"
  [ "$status" -eq 0 ]
}

@test "check_tasks_modified: integrates with get_file_md5 function" {
  # Create tasks.md
  local tasks_file="$TEST_DIR/tasks.md"
  cat > "$tasks_file" <<'EOF'
## Test Tasks

- [ ] 1.1 Task one
EOF

  # Get MD5 using get_file_md5
  local md5
  md5=$(get_file_md5 "$tasks_file")

  # Verify MD5 is 32 characters
  [ ${#md5} -eq 32 ]

  # Verify MD5 is hexadecimal
  [[ "$md5" =~ ^[a-f0-9]{32}$ ]]

  # Modify and check
  echo "- [ ] 1.2 Task two" >> "$tasks_file"
  run check_tasks_modified "$TEST_DIR" "$md5"
  [ "$status" -eq 0 ]
}
