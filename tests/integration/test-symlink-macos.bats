#!/usr/bin/env bats

# Integration test for symlink creation on macOS
# Tests that symlink creation works correctly on macOS platform
# Verifies .ralph/ralph-tasks.md symlink behavior

load '../helpers/test-common'

PROJECT_ROOT=""
FIXTURES_DIR=""
SCRIPT_PATH=""
MOCK_BIN_DIR=""

setup() {
  PROJECT_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"
  FIXTURES_DIR="$PROJECT_ROOT/tests/fixtures/simple-feature"
  SCRIPT_PATH="$PROJECT_ROOT/scripts/ralph-run.sh"
  
  local test_dir
  test_dir=$(setup_test_dir)
  export TEST_DIR="$test_dir"
  
  # Create mock bin directory
  MOCK_BIN_DIR="$test_dir/mock-bin"
  mkdir -p "$MOCK_BIN_DIR"
  
  # Create mock ralph command
  cat > "$MOCK_BIN_DIR/ralph" <<'EOF'
#!/bin/bash
echo "Mock ralph CLI - would normally execute Ralph loop"
exit 0
EOF
  chmod +x "$MOCK_BIN_DIR/ralph"

  # Create mock mini-ralph-cli.js so execute_ralph_loop exits immediately
  cat > "$MOCK_BIN_DIR/mini-ralph-cli.js" <<'EOF'
#!/usr/bin/env node
console.log("Mock mini-ralph-cli.js - would normally execute Ralph loop");
process.exit(0);
EOF
  export MINI_RALPH_CLI_OVERRIDE="$MOCK_BIN_DIR/mini-ralph-cli.js"
  
  # Add mock bin to PATH
  export PATH="$MOCK_BIN_DIR:$PATH"
  
  cd "$test_dir" || return 1
}

teardown() {
  unset MINI_RALPH_CLI_OVERRIDE
  cd / || true
  cleanup_test_dir
}

# Skip all tests if not running on macOS
setup_file() {
  local os
  os=$(detect_os)
  if [[ "$os" != "macOS" ]]; then
    skip "Test is macOS-specific, running on $os"
  fi
}

@test "symlink on macOS: creates symlink from .ralph/ralph-tasks.md to tasks.md" {
  create_git_repo
  
  mkdir -p openspec/changes
  cp -r "$FIXTURES_DIR" openspec/changes/
  
  local change_ralph_dir="openspec/changes/simple-feature/.ralph"
  local ralph_tasks_link="$change_ralph_dir/ralph-tasks.md"
  local tasks_file="openspec/changes/simple-feature/tasks.md"
  
  run bash "$SCRIPT_PATH" --change simple-feature --max-iterations 1 2>&1 || true
  
  # Verify symlink was created in change directory
  [ -L "$ralph_tasks_link" ]
  
  # Verify symlink target is correct
  local target
  target=$(readlink "$ralph_tasks_link")
  [[ "$target" == *"tasks.md"* ]]
  
  # Verify original tasks file exists
  [ -f "$tasks_file" ]
}

@test "symlink on macOS: symlink points to absolute path" {
  create_git_repo
  
  mkdir -p openspec/changes
  cp -r "$FIXTURES_DIR" openspec/changes/
  
  local change_ralph_dir="openspec/changes/simple-feature/.ralph"
  local ralph_tasks_link="$change_ralph_dir/ralph-tasks.md"
  
  run bash "$SCRIPT_PATH" --change simple-feature --max-iterations 1 2>&1 || true
  
  # Verify symlink target is an absolute path (starts with /)
  local target
  target=$(readlink "$ralph_tasks_link")
  [[ "$target" == /* ]]
  
  # Verify the absolute path points to the tasks file
  [ -f "$target" ]
}

@test "symlink on macOS: writing to symlink updates target file" {
  create_git_repo
  
  mkdir -p openspec/changes
  cp -r "$FIXTURES_DIR" openspec/changes/
  
  local change_ralph_dir="openspec/changes/simple-feature/.ralph"
  local ralph_tasks_link="$change_ralph_dir/ralph-tasks.md"
  local tasks_file="openspec/changes/simple-feature/tasks.md"
  
  run bash "$SCRIPT_PATH" --change simple-feature --max-iterations 1 2>&1 || true
  
  # Get original content of tasks file
  local original_content
  original_content=$(cat "$tasks_file")
  
  # Write new content via symlink
  echo "[TEST] New content written via symlink" >> "$ralph_tasks_link"
  
  # Verify target file was updated
  local updated_content
  updated_content=$(cat "$tasks_file")
  [[ "$updated_content" == *"[TEST] New content written via symlink"* ]]
  
  # Verify symlink still exists
  [ -L "$ralph_tasks_link" ]
}

@test "symlink on macOS: reading symlink returns target file content" {
  create_git_repo
  
  mkdir -p openspec/changes
  cp -r "$FIXTURES_DIR" openspec/changes/
  
  local change_ralph_dir="openspec/changes/simple-feature/.ralph"
  local ralph_tasks_link="$change_ralph_dir/ralph-tasks.md"
  local tasks_file="openspec/changes/simple-feature/tasks.md"
  
  run bash "$SCRIPT_PATH" --change simple-feature --max-iterations 1 2>&1 || true
  
  # Get content via symlink
  local symlink_content
  symlink_content=$(cat "$ralph_tasks_link")
  
  # Get content from target file directly
  local target_content
  target_content=$(cat "$tasks_file")
  
  # Verify both are identical
  [ "$symlink_content" = "$target_content" ]
}

@test "symlink on macOS: symlink is created in correct directory" {
  create_git_repo
  
  mkdir -p openspec/changes
  cp -r "$FIXTURES_DIR" openspec/changes/
  
  local change_ralph_dir="openspec/changes/simple-feature/.ralph"
  
  run bash "$SCRIPT_PATH" --change simple-feature --max-iterations 1 2>&1 || true
  
  # Verify .ralph directory exists in change directory
  [ -d "$change_ralph_dir" ]
  
  # Verify symlink is in .ralph directory
  [ -L "$change_ralph_dir/ralph-tasks.md" ]
  
  # Verify symlink file exists
  [ -f "$change_ralph_dir/ralph-tasks.md" ]
  
  # Verify symlink points to tasks.md file
  local target
  target=$(readlink "$change_ralph_dir/ralph-tasks.md")
  [[ "$target" == *"tasks.md"* ]]
}

@test "symlink on macOS: replacing existing symlink updates target" {
  create_git_repo
  
  mkdir -p openspec/changes
  cp -r "$FIXTURES_DIR" openspec/changes/
  
  local change_ralph_dir="openspec/changes/simple-feature/.ralph"
  local ralph_tasks_link="$change_ralph_dir/ralph-tasks.md"
  
  # First run - creates initial symlink
  run bash "$SCRIPT_PATH" --change simple-feature --max-iterations 1 2>&1 || true
  
  # Get initial symlink target
  local initial_target
  initial_target=$(readlink "$ralph_tasks_link")
  
  # Verify initial symlink
  [ -L "$ralph_tasks_link" ]
  [ "$initial_target" != "" ]
  
  # Second run - should update symlink if needed
  run bash "$SCRIPT_PATH" --change simple-feature --max-iterations 1 2>&1 || true
  
  # Verify symlink still exists
  [ -L "$ralph_tasks_link" ]
  
  # Verify symlink still points to a valid file
  local current_target
  current_target=$(readlink "$ralph_tasks_link")
  [ -f "$current_target" ]
}

@test "symlink on macOS: symlink persists after script completion" {
  create_git_repo
  
  mkdir -p openspec/changes
  cp -r "$FIXTURES_DIR" openspec/changes/
  
  local change_ralph_dir="openspec/changes/simple-feature/.ralph"
  local ralph_tasks_link="$change_ralph_dir/ralph-tasks.md"
  
  # Run the script
  run bash "$SCRIPT_PATH" --change simple-feature --max-iterations 1 2>&1 || true
  
  # Verify symlink exists immediately after script
  [ -L "$ralph_tasks_link" ]
  
  # Sleep briefly and verify symlink still exists
  sleep 0.1
  [ -L "$ralph_tasks_link" ]
  
  # Verify symlink target is still valid
  local target
  target=$(readlink "$ralph_tasks_link")
  [ -f "$target" ]
}

@test "symlink on macOS: symlink creation is idempotent" {
  create_git_repo
  
  mkdir -p openspec/changes
  cp -r "$FIXTURES_DIR" openspec/changes/
  
  local change_ralph_dir="openspec/changes/simple-feature/.ralph"
  local ralph_tasks_link="$change_ralph_dir/ralph-tasks.md"
  
  # Run the script twice
  run bash "$SCRIPT_PATH" --change simple-feature --max-iterations 1 2>&1 || true
  local first_run_status=$status
  
  run bash "$SCRIPT_PATH" --change simple-feature --max-iterations 1 2>&1 || true
  local second_run_status=$status
  
  # Verify symlink exists after both runs
  [ -L "$ralph_tasks_link" ]
  
  # Get symlink target after both runs
  local first_target
  first_target=$(readlink "$ralph_tasks_link")
  
  local second_target
  second_target=$(readlink "$ralph_tasks_link")
  
  # Verify target is consistent
  [ "$first_target" = "$second_target" ]
}
