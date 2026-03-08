#!/usr/bin/env bats

# Integration test for MD5 hashing on both platforms
# Tests that get_file_md5() function works correctly on Linux and macOS
# Verifies md5sum (Linux) and md5 -q (macOS) commands

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

@test "MD5 hashing: get_file_md5 returns valid hash on Linux" {
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
  
  # Get the MD5 hash
  local hash
  hash=$(get_file_md5 "$tasks_file")
  
  # Verify hash is a valid 32-character hexadecimal string
  [[ "$hash" =~ ^[a-f0-9]{32}$ ]]
}

@test "MD5 hashing: get_file_md5 returns valid hash on macOS" {
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
  
  # Get the MD5 hash
  local hash
  hash=$(get_file_md5 "$tasks_file")
  
  # Verify hash is a valid 32-character hexadecimal string
  [[ "$hash" =~ ^[a-f0-9]{32}$ ]]
}

@test "MD5 hashing: get_file_md5 detects file changes on Linux" {
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
  
  # Get initial hash
  local initial_hash
  initial_hash=$(get_file_md5 "$tasks_file")
  
  # Modify the file
  echo "[TEST] Modified content" >> "$tasks_file"
  
  # Get new hash
  local new_hash
  new_hash=$(get_file_md5 "$tasks_file")
  
  # Verify hash changed
  [ "$initial_hash" != "$new_hash" ]
}

@test "MD5 hashing: get_file_md5 detects file changes on macOS" {
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
  
  # Get initial hash
  local initial_hash
  initial_hash=$(get_file_md5 "$tasks_file")
  
  # Modify the file
  echo "[TEST] Modified content" >> "$tasks_file"
  
  # Get new hash
  local new_hash
  new_hash=$(get_file_md5 "$tasks_file")
  
  # Verify hash changed
  [ "$initial_hash" != "$new_hash" ]
}

@test "MD5 hashing: get_file_md5 returns consistent results on Linux" {
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
  
  # Get hash multiple times
  local hash1
  hash1=$(get_file_md5 "$tasks_file")
  
  local hash2
  hash2=$(get_file_md5 "$tasks_file")
  
  local hash3
  hash3=$(get_file_md5 "$tasks_file")
  
  # Verify all results are the same
  [ "$hash1" = "$hash2" ]
  [ "$hash2" = "$hash3" ]
}

@test "MD5 hashing: get_file_md5 returns consistent results on macOS" {
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
  
  # Get hash multiple times
  local hash1
  hash1=$(get_file_md5 "$tasks_file")
  
  local hash2
  hash2=$(get_file_md5 "$tasks_file")
  
  local hash3
  hash3=$(get_file_md5 "$tasks_file")
  
  # Verify all results are the same
  [ "$hash1" = "$hash2" ]
  [ "$hash2" = "$hash3" ]
}

@test "MD5 hashing: get_file_md5 produces same hash for identical files on Linux" {
  local os
  os=$(detect_os)
  if [[ "$os" != "Linux" ]]; then
    skip "Test is Linux-specific, running on $os"
  fi
  
  create_git_repo
  
  mkdir -p openspec/changes
  cp -r "$FIXTURES_DIR" openspec/changes/
  
  local tasks_file1="openspec/changes/simple-feature/tasks.md"
  local tasks_file2="openspec/changes/simple-feature/tasks-copy.md"
  
  # Create identical copy
  cp "$tasks_file1" "$tasks_file2"
  
  # Source the script to access the function
  source "$SCRIPT_PATH"
  
  # Get hashes for both files
  local hash1
  hash1=$(get_file_md5 "$tasks_file1")
  
  local hash2
  hash2=$(get_file_md5 "$tasks_file2")
  
  # Verify hashes are identical
  [ "$hash1" = "$hash2" ]
}

@test "MD5 hashing: get_file_md5 produces same hash for identical files on macOS" {
  local os
  os=$(detect_os)
  if [[ "$os" != "macOS" ]]; then
    skip "Test is macOS-specific, running on $os"
  fi
  
  create_git_repo
  
  mkdir -p openspec/changes
  cp -r "$FIXTURES_DIR" openspec/changes/
  
  local tasks_file1="openspec/changes/simple-feature/tasks.md"
  local tasks_file2="openspec/changes/simple-feature/tasks-copy.md"
  
  # Create identical copy
  cp "$tasks_file1" "$tasks_file2"
  
  # Source the script to access the function
  source "$SCRIPT_PATH"
  
  # Get hashes for both files
  local hash1
  hash1=$(get_file_md5 "$tasks_file1")
  
  local hash2
  hash2=$(get_file_md5 "$tasks_file2")
  
  # Verify hashes are identical
  [ "$hash1" = "$hash2" ]
}

@test "MD5 hashing: get_file_md5 handles relative paths on Linux" {
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
  local hash
  hash=$(get_file_md5 "openspec/changes/simple-feature/tasks.md")
  
  # Verify hash is valid
  [[ "$hash" =~ ^[a-f0-9]{32}$ ]]
}

@test "MD5 hashing: get_file_md5 handles relative paths on macOS" {
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
  local hash
  hash=$(get_file_md5 "openspec/changes/simple-feature/tasks.md")
  
  # Verify hash is valid
  [[ "$hash" =~ ^[a-f0-9]{32}$ ]]
}

@test "MD5 hashing: get_file_md5 handles absolute paths on Linux" {
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
  local hash
  hash=$(get_file_md5 "$tasks_file")
  
  # Verify hash is valid
  [[ "$hash" =~ ^[a-f0-9]{32}$ ]]
}

@test "MD5 hashing: get_file_md5 handles absolute paths on macOS" {
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
  local hash
  hash=$(get_file_md5 "$tasks_file")
  
  # Verify hash is valid
  [[ "$hash" =~ ^[a-f0-9]{32}$ ]]
}
