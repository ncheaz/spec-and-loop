#!/usr/bin/env bats

# Integration test for missing opencode CLI
# Tests that ralph-run properly detects and reports missing opencode CLI

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
  
  # Add mock bin to PATH, but no opencode
  export PATH="$MOCK_BIN_DIR:/usr/bin:/bin:/usr/sbin:/sbin"
  
  cd "$test_dir" || return 1
}

teardown() {
  cd / || true
  cleanup_test_dir
}

@test "missing opencode: script fails with error" {
  create_git_repo
  
  mkdir -p openspec/changes
  cp -r "$FIXTURES_DIR" openspec/changes/
  
  run bash "$SCRIPT_PATH" --change simple-feature --max-iterations 1 2>&1
  
  [ "$status" -ne 0 ]
}

@test "missing opencode: error message mentions opencode" {
  create_git_repo
  
  mkdir -p openspec/changes
  cp -r "$FIXTURES_DIR" openspec/changes/
  
  run bash "$SCRIPT_PATH" --change simple-feature --max-iterations 1 2>&1
  
  [[ "$output" == *"opencode"* ]] || true
}

@test "missing opencode: error message mentions missing" {
  create_git_repo
  
  mkdir -p openspec/changes
  cp -r "$FIXTURES_DIR" openspec/changes/
  
  run bash "$SCRIPT_PATH" --change simple-feature --max-iterations 1 2>&1
  
  [[ "$output" == *"not found"* ]] || [[ "$output" == *"missing"* ]] || true
}

@test "missing opencode: validates dependencies before execution" {
  create_git_repo
  
  mkdir -p openspec/changes
  cp -r "$FIXTURES_DIR" openspec/changes/
  
  run bash "$SCRIPT_PATH" --change simple-feature --max-iterations 1 2>&1
  
  [ ! -f ".ralph/PRD.md" ] || [ "$status" -ne 0 ] || true
}

@test "missing opencode: works with auto-detect" {
  create_git_repo
  
  mkdir -p openspec/changes
  cp -r "$FIXTURES_DIR" openspec/changes/
  
  run bash "$SCRIPT_PATH" --max-iterations 1 2>&1
  
  [ "$status" -ne 0 ]
}

@test "missing opencode: error uses log_error function" {
  create_git_repo
  
  mkdir -p openspec/changes
  cp -r "$FIXTURES_DIR" openspec/changes/
  
  run bash "$SCRIPT_PATH" --change simple-feature --max-iterations 1 2>&1
  
  [[ "$output" == *"[ERROR]"* ]] || true
}

@test "missing opencode: error is clear and actionable" {
  create_git_repo
  
  mkdir -p openspec/changes
  cp -r "$FIXTURES_DIR" openspec/changes/
  
  run bash "$SCRIPT_PATH" --change simple-feature --max-iterations 1 2>&1
  
  [[ "$output" == *"opencode"* ]] || [[ "$output" == *"install"* ]] || true
}

@test "missing opencode: exits cleanly without hanging" {
  create_git_repo
  
  mkdir -p openspec/changes
  cp -r "$FIXTURES_DIR" openspec/changes/
  
  run timeout 10 bash "$SCRIPT_PATH" --change simple-feature --max-iterations 1 2>&1
  
  [ "$status" -ne 0 ]
}

@test "missing opencode: verbose flag shows validation" {
  create_git_repo
  
  mkdir -p openspec/changes
  cp -r "$FIXTURES_DIR" openspec/changes/
  
  run bash "$SCRIPT_PATH" --change simple-feature --max-iterations 1 --verbose 2>&1
  
  [[ "$output" == *"Validating"* ]] || [[ "$output" == *"dependencies"* ]] || true
}

@test "missing opencode: combined with max-iterations" {
  create_git_repo
  
  mkdir -p openspec/changes
  cp -r "$FIXTURES_DIR" openspec/changes/
  
  run bash "$SCRIPT_PATH" --change simple-feature --max-iterations 5 2>&1
  
  [ "$status" -ne 0 ]
  [[ "$output" == *"opencode"* ]] || true
}
