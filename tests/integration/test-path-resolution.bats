#!/usr/bin/env bats

# Integration test for path resolution on both platforms
# Tests that get_realpath() function works correctly on Linux and macOS
# Verifies realpath, readlink -f, and fallback cd/pwd approaches

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

@test "path resolution: get_realpath resolves relative paths on Linux" {
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
  
  # Resolve relative path
  local resolved
  resolved=$(get_realpath "openspec/changes/simple-feature/tasks.md")
  
  # Verify resolved path is absolute (starts with /)
  [[ "$resolved" == /* ]]
  
  # Verify resolved path exists
  [ -f "$resolved" ]
  
  # Verify resolved path points to correct file
  [[ "$resolved" == *"tasks.md" ]]
}

@test "path resolution: get_realpath resolves relative paths on macOS" {
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
  
  # Resolve relative path
  local resolved
  resolved=$(get_realpath "openspec/changes/simple-feature/tasks.md")
  
  # Verify resolved path is absolute (starts with /)
  [[ "$resolved" == /* ]]
  
  # Verify resolved path exists
  [ -f "$resolved" ]
  
  # Verify resolved path points to correct file
  [[ "$resolved" == *"tasks.md" ]]
}

@test "path resolution: get_realpath handles absolute paths on Linux" {
  local os
  os=$(detect_os)
  if [[ "$os" != "Linux" ]]; then
    skip "Test is Linux-specific, running on $os"
  fi
  
  create_git_repo
  
  mkdir -p openspec/changes
  cp -r "$FIXTURES_DIR" openspec/changes/
  
  local absolute_path
  absolute_path=$(realpath openspec/changes/simple-feature/tasks.md)
  
  # Source the script to access the function
  source "$SCRIPT_PATH"
  
  # Resolve absolute path
  local resolved
  resolved=$(get_realpath "$absolute_path")
  
  # Verify resolved path equals input
  [ "$resolved" = "$absolute_path" ]
  
  # Verify resolved path exists
  [ -f "$resolved" ]
}

@test "path resolution: get_realpath handles absolute paths on macOS" {
  local os
  os=$(detect_os)
  if [[ "$os" != "macOS" ]]; then
    skip "Test is macOS-specific, running on $os"
  fi
  
  create_git_repo
  
  mkdir -p openspec/changes
  cp -r "$FIXTURES_DIR" openspec/changes/
  
  local absolute_path
  absolute_path=$(realpath openspec/changes/simple-feature/tasks.md)
  
  # Source the script to access the function
  source "$SCRIPT_PATH"
  
  # Resolve absolute path
  local resolved
  resolved=$(get_realpath "$absolute_path")
  
  # Verify resolved path equals input
  [ "$resolved" = "$absolute_path" ]
  
  # Verify resolved path exists
  [ -f "$resolved" ]
}

@test "path resolution: get_realpath resolves symlinks on Linux" {
  local os
  os=$(detect_os)
  if [[ "$os" != "Linux" ]]; then
    skip "Test is Linux-specific, running on $os"
  fi
  
  create_git_repo
  
  mkdir -p openspec/changes
  cp -r "$FIXTURES_DIR" openspec/changes/
  
  local tasks_file="openspec/changes/simple-feature/tasks.md"
  local symlink_file="openspec/changes/simple-feature/tasks-link.md"
  
  # Create symlink
  ln -s "$tasks_file" "$symlink_file"
  
  # Source the script to access the function
  source "$SCRIPT_PATH"
  
  # Resolve symlink path
  local resolved
  resolved=$(get_realpath "$symlink_file")
  
  # Verify resolved path is not the symlink
  [ "$resolved" != "$symlink_file" ]
  
  # Verify resolved path points to the original file
  local tasks_absolute
  tasks_absolute=$(realpath "$tasks_file")
  [ "$resolved" = "$tasks_absolute" ]
}

@test "path resolution: get_realpath resolves symlinks on macOS" {
  local os
  os=$(detect_os)
  if [[ "$os" != "macOS" ]]; then
    skip "Test is macOS-specific, running on $os"
  fi
  
  create_git_repo
  
  mkdir -p openspec/changes
  cp -r "$FIXTURES_DIR" openspec/changes/
  
  local tasks_file="openspec/changes/simple-feature/tasks.md"
  local symlink_file="openspec/changes/simple-feature/tasks-link.md"
  
  # Create symlink
  ln -s "$tasks_file" "$symlink_file"
  
  # Source the script to access the function
  source "$SCRIPT_PATH"
  
  # Resolve symlink path
  local resolved
  resolved=$(get_realpath "$symlink_file")
  
  # Verify resolved path is not the symlink
  [ "$resolved" != "$symlink_file" ]
  
  # Verify resolved path points to the original file
  local tasks_absolute
  tasks_absolute=$(realpath "$tasks_file")
  [ "$resolved" = "$tasks_absolute" ]
}

@test "path resolution: get_realpath handles . and .. on Linux" {
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
  
  # Resolve path with . and ..
  local resolved
  resolved=$(get_realpath "openspec/changes/simple-feature/./../simple-feature/./tasks.md")
  
  # Verify resolved path is absolute
  [[ "$resolved" == /* ]]
  
  # Verify resolved path exists
  [ -f "$resolved" ]
  
  # Verify resolved path doesn't contain . or ..
  [[ ! "$resolved" =~ \.\./ ]]
  [[ ! "$resolved" =~ /\./ ]]
}

@test "path resolution: get_realpath handles . and .. on macOS" {
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
  
  # Resolve path with . and ..
  local resolved
  resolved=$(get_realpath "openspec/changes/simple-feature/./../simple-feature/./tasks.md")
  
  # Verify resolved path is absolute
  [[ "$resolved" == /* ]]
  
  # Verify resolved path exists
  [ -f "$resolved" ]
  
  # Verify resolved path doesn't contain . or ..
  [[ ! "$resolved" =~ \.\./ ]]
  [[ ! "$resolved" =~ /\./ ]]
}

@test "path resolution: get_realpath returns consistent results on Linux" {
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
  
  # Resolve same path multiple times
  local resolved1
  resolved1=$(get_realpath "openspec/changes/simple-feature/tasks.md")
  
  local resolved2
  resolved2=$(get_realpath "openspec/changes/simple-feature/tasks.md")
  
  local resolved3
  resolved3=$(get_realpath "openspec/changes/simple-feature/tasks.md")
  
  # Verify all results are the same
  [ "$resolved1" = "$resolved2" ]
  [ "$resolved2" = "$resolved3" ]
}

@test "path resolution: get_realpath returns consistent results on macOS" {
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
  
  # Resolve same path multiple times
  local resolved1
  resolved1=$(get_realpath "openspec/changes/simple-feature/tasks.md")
  
  local resolved2
  resolved2=$(get_realpath "openspec/changes/simple-feature/tasks.md")
  
  local resolved3
  resolved3=$(get_realpath "openspec/changes/simple-feature/tasks.md")
  
  # Verify all results are the same
  [ "$resolved1" = "$resolved2" ]
  [ "$resolved2" = "$resolved3" ]
}

@test "path resolution: get_realpath handles directory paths on Linux" {
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
  
  # Resolve directory path
  local resolved
  resolved=$(get_realpath "openspec/changes/simple-feature")
  
  # Verify resolved path is absolute
  [[ "$resolved" == /* ]]
  
  # Verify resolved path is a directory
  [ -d "$resolved" ]
}

@test "path resolution: get_realpath handles directory paths on macOS" {
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
  
  # Resolve directory path
  local resolved
  resolved=$(get_realpath "openspec/changes/simple-feature")
  
  # Verify resolved path is absolute
  [[ "$resolved" == /* ]]
  
  # Verify resolved path is a directory
  [ -d "$resolved" ]
}
