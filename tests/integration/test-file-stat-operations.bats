#!/usr/bin/env bats

# Integration test for file stat operations on both platforms
# Tests that get_file_mtime() function works correctly on Linux and macOS
# Verifies stat -c %Y (Linux) and stat -f %m (macOS) commands

load '../helpers/test-common'

PROJECT_ROOT=""
FIXTURES_DIR=""
SCRIPT_PATH=""

setup() {
  PROJECT_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"
  FIXTURES_DIR="$PROJECT_ROOT/tests/fixtures/simple-feature"
  SCRIPT_PATH="$PROJECT_ROOT/scripts/ralph-run.sh"
  
  local test_dir
  test_dir=$(setup_test_dir)
  export TEST_DIR="$test_dir"
  
  cd "$test_dir" || return 1
}

teardown() {
  cd / || true
  cleanup_test_dir
}

@test "file stat operations: get_file_mtime returns valid timestamp on Linux" {
  local os
  os=$(detect_os)
  if [[ "$os" != "Linux" ]]; then
    skip "Test is Linux-specific, running on $os"
  fi
  
  create_git_repo
  
  mkdir -p openspec/changes
  cp -r "$FIXTURES_DIR" openspec/changes/
  
  local tasks_file="openspec/changes/simple-feature/tasks.md"
  
  # Source the script to access the function
  source "$SCRIPT_PATH"
  
  # Get the modification time
  local mtime
  mtime=$(get_file_mtime "$tasks_file")
  
  # Verify mtime is a valid number
  [[ "$mtime" =~ ^[0-9]+$ ]]
  
  # Verify mtime is greater than 0
  [ "$mtime" -gt 0 ]
  
  # Verify mtime is not too old (should be within last hour)
  local current_time
  current_time=$(date +%s)
  local age=$((current_time - mtime))
  [ "$age" -lt 3600 ]
}

@test "file stat operations: get_file_mtime returns valid timestamp on macOS" {
  local os
  os=$(detect_os)
  if [[ "$os" != "macOS" ]]; then
    skip "Test is macOS-specific, running on $os"
  fi
  
  create_git_repo
  
  mkdir -p openspec/changes
  cp -r "$FIXTURES_DIR" openspec/changes/
  
  local tasks_file="openspec/changes/simple-feature/tasks.md"
  
  # Source the script to access the function
  source "$SCRIPT_PATH"
  
  # Get the modification time
  local mtime
  mtime=$(get_file_mtime "$tasks_file")
  
  # Verify mtime is a valid number
  [[ "$mtime" =~ ^[0-9]+$ ]]
  
  # Verify mtime is greater than 0
  [ "$mtime" -gt 0 ]
  
  # Verify mtime is not too old (should be within last hour)
  local current_time
  current_time=$(date +%s)
  local age=$((current_time - mtime))
  [ "$age" -lt 3600 ]
}

@test "file stat operations: get_file_mtime detects file changes on Linux" {
  local os
  os=$(detect_os)
  if [[ "$os" != "Linux" ]]; then
    skip "Test is Linux-specific, running on $os"
  fi
  
  create_git_repo
  
  mkdir -p openspec/changes
  cp -r "$FIXTURES_DIR" openspec/changes/
  
  local tasks_file="openspec/changes/simple-feature/tasks.md"
  
  # Source the script to access the function
  source "$SCRIPT_PATH"
  
  # Get initial mtime
  local initial_mtime
  initial_mtime=$(get_file_mtime "$tasks_file")
  
  # Wait briefly and modify the file
  sleep 0.1
  echo "[TEST] Modified content" >> "$tasks_file"
  
  # Get new mtime
  local new_mtime
  new_mtime=$(get_file_mtime "$tasks_file")
  
  # Verify mtime changed
  [ "$new_mtime" -gt "$initial_mtime" ]
}

@test "file stat operations: get_file_mtime detects file changes on macOS" {
  local os
  os=$(detect_os)
  if [[ "$os" != "macOS" ]]; then
    skip "Test is Linux-specific, running on $os"
  fi
  
  create_git_repo
  
  mkdir -p openspec/changes
  cp -r "$FIXTURES_DIR" openspec/changes/
  
  local tasks_file="openspec/changes/simple-feature/tasks.md"
  
  # Source the script to access the function
  source "$SCRIPT_PATH"
  
  # Get initial mtime
  local initial_mtime
  initial_mtime=$(get_file_mtime "$tasks_file")
  
  # Use touch with a future timestamp to guarantee mtime changes
  # (macOS stat -f %m returns integer seconds; sub-second sleep is unreliable)
  local future_time
  future_time=$(date -v+2S "+%Y%m%d%H%M.%S")
  touch -t "$future_time" "$tasks_file"
  
  # Get new mtime
  local new_mtime
  new_mtime=$(get_file_mtime "$tasks_file")
  
  # Verify mtime changed
  [ "$new_mtime" -gt "$initial_mtime" ]
}

@test "file stat operations: get_file_mtime handles relative paths on Linux" {
  local os
  os=$(detect_os)
  if [[ "$os" != "Linux" ]]; then
    skip "Test is Linux-specific, running on $os"
  fi
  
  create_git_repo
  
  mkdir -p openspec/changes
  cp -r "$FIXTURES_DIR" openspec/changes/
  
  # Source the script to access the function
  source "$SCRIPT_PATH"
  
  # Use relative path
  local mtime
  mtime=$(get_file_mtime "openspec/changes/simple-feature/tasks.md")
  
  # Verify mtime is valid
  [[ "$mtime" =~ ^[0-9]+$ ]]
  [ "$mtime" -gt 0 ]
}

@test "file stat operations: get_file_mtime handles relative paths on macOS" {
  local os
  os=$(detect_os)
  if [[ "$os" != "macOS" ]]; then
    skip "Test is macOS-specific, running on $os"
  fi
  
  create_git_repo
  
  mkdir -p openspec/changes
  cp -r "$FIXTURES_DIR" openspec/changes/
  
  # Source the script to access the function
  source "$SCRIPT_PATH"
  
  # Use relative path
  local mtime
  mtime=$(get_file_mtime "openspec/changes/simple-feature/tasks.md")
  
  # Verify mtime is valid
  [[ "$mtime" =~ ^[0-9]+$ ]]
  [ "$mtime" -gt 0 ]
}

@test "file stat operations: get_file_mtime handles absolute paths on Linux" {
  local os
  os=$(detect_os)
  if [[ "$os" != "Linux" ]]; then
    skip "Test is Linux-specific, running on $os"
  fi
  
  create_git_repo
  
  mkdir -p openspec/changes
  cp -r "$FIXTURES_DIR" openspec/changes/
  
  local tasks_file
  tasks_file=$(realpath openspec/changes/simple-feature/tasks.md)
  
  # Source the script to access the function
  source "$SCRIPT_PATH"
  
  # Use absolute path
  local mtime
  mtime=$(get_file_mtime "$tasks_file")
  
  # Verify mtime is valid
  [[ "$mtime" =~ ^[0-9]+$ ]]
  [ "$mtime" -gt 0 ]
}

@test "file stat operations: get_file_mtime handles absolute paths on macOS" {
  local os
  os=$(detect_os)
  if [[ "$os" != "macOS" ]]; then
    skip "Test is macOS-specific, running on $os"
  fi
  
  create_git_repo
  
  mkdir -p openspec/changes
  cp -r "$FIXTURES_DIR" openspec/changes/
  
  local tasks_file
  tasks_file=$(realpath openspec/changes/simple-feature/tasks.md)
  
  # Source the script to access the function
  source "$SCRIPT_PATH"
  
  # Use absolute path
  local mtime
  mtime=$(get_file_mtime "$tasks_file")
  
  # Verify mtime is valid
  [[ "$mtime" =~ ^[0-9]+$ ]]
  [ "$mtime" -gt 0 ]
}

@test "file stat operations: get_file_mtime returns consistent results on Linux" {
  local os
  os=$(detect_os)
  if [[ "$os" != "Linux" ]]; then
    skip "Test is Linux-specific, running on $os"
  fi
  
  create_git_repo
  
  mkdir -p openspec/changes
  cp -r "$FIXTURES_DIR" openspec/changes/
  
  local tasks_file="openspec/changes/simple-feature/tasks.md"
  
  # Source the script to access the function
  source "$SCRIPT_PATH"
  
  # Get mtime multiple times
  local mtime1
  mtime1=$(get_file_mtime "$tasks_file")
  
  local mtime2
  mtime2=$(get_file_mtime "$tasks_file")
  
  local mtime3
  mtime3=$(get_file_mtime "$tasks_file")
  
  # Verify all results are the same
  [ "$mtime1" = "$mtime2" ]
  [ "$mtime2" = "$mtime3" ]
}

@test "file stat operations: get_file_mtime returns consistent results on macOS" {
  local os
  os=$(detect_os)
  if [[ "$os" != "macOS" ]]; then
    skip "Test is macOS-specific, running on $os"
  fi
  
  create_git_repo
  
  mkdir -p openspec/changes
  cp -r "$FIXTURES_DIR" openspec/changes/
  
  local tasks_file="openspec/changes/simple-feature/tasks.md"
  
  # Source the script to access the function
  source "$SCRIPT_PATH"
  
  # Get mtime multiple times
  local mtime1
  mtime1=$(get_file_mtime "$tasks_file")
  
  local mtime2
  mtime2=$(get_file_mtime "$tasks_file")
  
  local mtime3
  mtime3=$(get_file_mtime "$tasks_file")
  
  # Verify all results are the same
  [ "$mtime1" = "$mtime2" ]
  [ "$mtime2" = "$mtime3" ]
}
