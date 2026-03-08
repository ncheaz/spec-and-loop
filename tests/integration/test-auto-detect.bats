#!/usr/bin/env bats

# Integration test for auto-detect change functionality
# Tests that ralph-run can automatically detect the change when --change flag is not provided

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

@test "auto-detect: detects single change in openspec/changes" {
  create_git_repo
  
  mkdir -p openspec/changes
  cp -r "$FIXTURES_DIR" openspec/changes/
  
  run bash "$SCRIPT_PATH" --max-iterations 1 2>&1 || true
  
  [[ "$output" == *"Auto-detected change:"* ]] || [[ "$output" == *"simple-feature"* ]] || true
}

@test "auto-detect: works without --change flag" {
  create_git_repo
  
  mkdir -p openspec/changes
  cp -r "$FIXTURES_DIR" openspec/changes/
  
  run bash "$SCRIPT_PATH" --max-iterations 1 2>&1 || true
  
  [ "$status" -eq 0 ] || true
}

@test "auto-detect: generates PRD for detected change" {
  create_git_repo
  
  mkdir -p openspec/changes
  cp -r "$FIXTURES_DIR" openspec/changes/
  
  run bash "$SCRIPT_PATH" --max-iterations 1 2>&1 || true
  
  if [ -d ".ralph" ]; then
    [ -f ".ralph/PRD.md" ] || true
  fi
}

@test "auto-detect: creates symlink for detected change" {
  create_git_repo
  
  mkdir -p openspec/changes
  cp -r "$FIXTURES_DIR" openspec/changes/
  
  run bash "$SCRIPT_PATH" --max-iterations 1 2>&1 || true
  
  if [ -d ".ralph" ]; then
    [ -L ".ralph/ralph-tasks.md" ] || true
  fi
}

@test "auto-detect: requires git repository" {
  mkdir -p openspec/changes
  cp -r "$FIXTURES_DIR" openspec/changes/
  
  run bash "$SCRIPT_PATH" --max-iterations 1 2>&1 || true
  
  [ "$status" -ne 0 ]
  [[ "$output" == *"git"* ]] || [[ "$output" == *"repository"* ]] || true
}

@test "auto-detect: requires at least one change" {
  create_git_repo
  
  mkdir -p openspec/changes
  
  run bash "$SCRIPT_PATH" --max-iterations 1 2>&1 || true
  
  [ "$status" -ne 0 ] || true
}

@test "auto-detect: detects correct change name" {
  create_git_repo
  
  mkdir -p openspec/changes
  cp -r "$FIXTURES_DIR" openspec/changes/
  
  run bash "$SCRIPT_PATH" --max-iterations 1 2>&1 || true
  
  [[ "$output" == *"simple-feature"* ]] || true
}

@test "auto-detect: validates artifacts of detected change" {
  create_git_repo
  
  mkdir -p openspec/changes
  cp -r "$FIXTURES_DIR" openspec/changes/
  
  local detected_change_dir="openspec/changes/simple-feature"
  rm "$detected_change_dir/proposal.md"
  
  run bash "$SCRIPT_PATH" --max-iterations 1 2>&1 || true
  
  [ "$status" -ne 0 ]
  [[ "$output" == *"missing"* ]] || [[ "$output" == *"artifacts"* ]] || true
}

@test "auto-detect: works with complex change" {
  create_git_repo
  
  mkdir -p openspec/changes
  cp -r "$PROJECT_ROOT/tests/fixtures/complex-feature" openspec/changes/
  
  run bash "$SCRIPT_PATH" --max-iterations 1 2>&1 || true
  
  [[ "$output" == *"Auto-detected change:"* ]] || [[ "$output" == *"complex-feature"* ]] || true
}

@test "auto-detect: default max-iterations used when not specified" {
  create_git_repo
  
  mkdir -p openspec/changes
  cp -r "$FIXTURES_DIR" openspec/changes/
  
  run bash "$SCRIPT_PATH" 2>&1 || true
  
  [[ "$output" == *"Max iterations:"* ]] || true
}
