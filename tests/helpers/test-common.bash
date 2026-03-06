#!/usr/bin/env bash

# test-common.sh - Common test helper functions for Bats tests
# This file provides reusable utilities for test setup, teardown, and assertions

# Detect the OS (Linux or macOS)
detect_os() {
  if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    echo "Linux"
  elif [[ "$OSTYPE" == "darwin"* ]]; then
    echo "macOS"
  else
    echo "Unknown"
  fi
}

get_test_temp_root() {
  local temp_root="${TMPDIR:-/tmp}"
  temp_root="${temp_root%/}"

  if [[ -z "$temp_root" ]]; then
    temp_root="/tmp"
  fi

  echo "$temp_root"
}

# Create a temporary test directory with unique name
setup_test_dir() {
  local test_name="${1:-test}"
  local temp_root
  temp_root=$(get_test_temp_root)

  TEST_DIR=$(mktemp -d "${temp_root}/${test_name}-XXXXXX" 2>/dev/null) || \
    TEST_DIR=$(mktemp -d -t "$test_name" 2>/dev/null) || \
    TEST_DIR=""

  if [[ -z "$TEST_DIR" ]]; then
    TEST_DIR="${temp_root}/${test_name}-$(date +%s)-$$"
    mkdir -p "$TEST_DIR"
  fi

  echo "$TEST_DIR"
}

# Clean up test directory
cleanup_test_dir() {
  if [[ -n "${TEST_DIR:-}" && -d "$TEST_DIR" ]]; then
    rm -rf "$TEST_DIR"
  fi
}

# Create a sample git repository in the test directory
create_git_repo() {
  local repo_path="${1:-$TEST_DIR}"
  mkdir -p "$repo_path"
  cd "$repo_path" || return 1
  git init -q
  git config user.email "test@example.com"
  git config user.name "Test User"
  touch README.md
  git add README.md
  git commit -q -m "Initial commit"
}

# Create a sample OpenSpec change structure
create_openspec_change() {
  local change_name="${1:-test-change}"
  local change_dir="$TEST_DIR/openspec/changes/$change_name"
  mkdir -p "$change_dir/specs"
  
  # Create proposal.md
  cat > "$change_dir/proposal.md" <<'EOF'
## Why

Test proposal for testing purposes.

## What Changes

- Test change 1
- Test change 2
EOF

  # Create design.md
  cat > "$change_dir/design.md" <<'EOF'
## Context

Test design for testing purposes.
EOF

  # Create tasks.md
  cat > "$change_dir/tasks.md" <<'EOF'
## Test Tasks

- [ ] 1.1 Task one
- [ ] 1.2 Task two
- [ ] 1.3 Task three
EOF

  # Create a spec file
  mkdir -p "$change_dir/specs/test-spec"
  cat > "$change_dir/specs/test-spec/spec.md" <<'EOF'
## Test Spec

Test specification for testing purposes.
EOF

  echo "$change_dir"
}

# Mock git command for testing
mock_git() {
  if [[ "$1" == "status" ]]; then
    echo "On branch main"
  elif [[ "$1" == "rev-parse" && "$2" == "--git-dir" ]]; then
    echo ".git"
  elif [[ "$1" == "config" && "$2" == "--get" ]]; then
    echo "test@example.com"
  else
    echo "git $*"
  fi
}

# Mock jq command for testing
mock_jq() {
  echo '{ "test": "value" }'
}

# Mock ralph command for testing
mock_ralph() {
  echo "Mock ralph output"
  return 0
}

# Mock opencode command for testing
mock_opencode() {
  echo "Mock opencode output"
  return 0
}

# Create a temporary file with content
create_temp_file() {
  local filename="${1:-temp.txt}"
  local content="${2:-test content}"
  local filepath="$TEST_DIR/$filename"
  echo "$content" > "$filepath"
  echo "$filepath"
}

# Get file modification time (cross-platform)
get_file_mtime() {
  local file="$1"
  local os
  os=$(detect_os)
  
  if [[ "$os" == "Linux" ]]; then
    stat -c %Y "$file"
  elif [[ "$os" == "macOS" ]]; then
    stat -f %m "$file"
  else
    echo "Error: Unsupported OS" >&2
    return 1
  fi
}

# Get file MD5 hash (cross-platform)
get_file_md5() {
  local file="$1"
  local os
  os=$(detect_os)
  
  if [[ "$os" == "Linux" ]]; then
    md5sum "$file" | awk '{print $1}'
  elif [[ "$os" == "macOS" ]]; then
    md5 -q "$file"
  else
    echo "Error: Unsupported OS" >&2
    return 1
  fi
}

# Get real path (cross-platform)
get_realpath() {
  local path="$1"
  
  if command -v realpath &> /dev/null; then
    realpath "$path"
  elif command -v readlink &> /dev/null; then
    readlink -f "$path"
  else
    cd "$path" && pwd
  fi
}

# Assert file exists
assert_file_exists() {
  local file="$1"
  if [[ ! -f "$file" ]]; then
    echo "Error: File does not exist: $file" >&2
    return 1
  fi
}

# Assert directory exists
assert_dir_exists() {
  local dir="$1"
  if [[ ! -d "$dir" ]]; then
    echo "Error: Directory does not exist: $dir" >&2
    return 1
  fi
}

# Assert file contains string
assert_file_contains() {
  local file="$1"
  local string="$2"
  if ! grep -q "$string" "$file" 2>/dev/null; then
    echo "Error: File '$file' does not contain '$string'" >&2
    return 1
  fi
}

# Create symlink (cross-platform safe)
create_symlink() {
  local target="$1"
  local link="$2"
  
  ln -sf "$target" "$link"
}

# Assert symlink points to target
assert_symlink_target() {
  local link="$1"
  local expected_target="$2"
  local actual_target
  
  if [[ ! -L "$link" ]]; then
    echo "Error: '$link' is not a symlink" >&2
    return 1
  fi
  
  actual_target=$(readlink "$link")
  if [[ "$actual_target" != "$expected_target" ]]; then
    echo "Error: Symlink '$link' points to '$actual_target', expected '$expected_target'" >&2
    return 1
  fi
}

# Export all functions for use in Bats tests
export -f detect_os
export -f get_test_temp_root
export -f setup_test_dir
export -f cleanup_test_dir
export -f create_git_repo
export -f create_openspec_change
export -f mock_git
export -f mock_jq
export -f mock_ralph
export -f mock_opencode
export -f create_temp_file
export -f get_file_mtime
export -f get_file_md5
export -f get_realpath
export -f assert_file_exists
export -f assert_dir_exists
export -f assert_file_contains
export -f create_symlink
export -f assert_symlink_target
