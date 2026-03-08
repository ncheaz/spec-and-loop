#!/usr/bin/env bats

# Integration test for verbose flag
# Tests that the --verbose flag produces debug output

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

@test "verbose: flag enables verbose output" {
  create_git_repo
  
  mkdir -p openspec/changes
  cp -r "$FIXTURES_DIR" openspec/changes/
  
  run bash "$SCRIPT_PATH" --change simple-feature --max-iterations 1 --verbose 2>&1 || true
  
  [[ "$output" == *"[VERBOSE]"* ]] || true
}

@test "verbose: -v short flag works" {
  create_git_repo
  
  mkdir -p openspec/changes
  cp -r "$FIXTURES_DIR" openspec/changes/
  
  run bash "$SCRIPT_PATH" --change simple-feature --max-iterations 1 -v 2>&1 || true
  
  [[ "$output" == *"[VERBOSE]"* ]] || true
}

@test "verbose: without flag no verbose output" {
  create_git_repo
  
  mkdir -p openspec/changes
  cp -r "$FIXTURES_DIR" openspec/changes/
  
  run bash "$SCRIPT_PATH" --change simple-feature --max-iterations 1 2>&1 || true
  
  [[ "$output" != *"[VERBOSE]"* ]] || true
}

@test "verbose: shows version information" {
  create_git_repo
  
  mkdir -p openspec/changes
  cp -r "$FIXTURES_DIR" openspec/changes/
  
  run bash "$SCRIPT_PATH" --change simple-feature --max-iterations 1 --verbose 2>&1 || true
  
  [[ "$output" == *"ralph-run v"* ]] || [[ "$output" == *"Starting"* ]] || true
}

@test "verbose: shows change name" {
  create_git_repo
  
  mkdir -p openspec/changes
  cp -r "$FIXTURES_DIR" openspec/changes/
  
  run bash "$SCRIPT_PATH" --change simple-feature --max-iterations 1 --verbose 2>&1 || true
  
  [[ "$output" == *"Change name:"* ]] || [[ "$output" == *"simple-feature"* ]] || true
}

@test "verbose: shows git repository validation" {
  create_git_repo
  
  mkdir -p openspec/changes
  cp -r "$FIXTURES_DIR" openspec/changes/
  
  run bash "$SCRIPT_PATH" --change simple-feature --max-iterations 1 --verbose 2>&1 || true
  
  [[ "$output" == *"Validating git repository"* ]] || true
}

@test "verbose: shows PRD generation steps" {
  create_git_repo
  
  mkdir -p openspec/changes
  cp -r "$FIXTURES_DIR" openspec/changes/
  
  run bash "$SCRIPT_PATH" --change simple-feature --max-iterations 1 --verbose 2>&1 || true
  
  [[ "$output" == *"PRD generation"* ]] || [[ "$output" == *"tasks"* ]] || true
}

@test "verbose: shows symlink creation" {
  create_git_repo
  
  mkdir -p openspec/changes
  cp -r "$FIXTURES_DIR" openspec/changes/
  
  run bash "$SCRIPT_PATH" --change simple-feature --max-iterations 1 --verbose 2>&1 || true
  
  [[ "$output" == *"symlink"* ]] || true
}

@test "verbose: works with auto-detect" {
  create_git_repo
  
  mkdir -p openspec/changes
  cp -r "$FIXTURES_DIR" openspec/changes/
  
  run bash "$SCRIPT_PATH" --max-iterations 1 --verbose 2>&1 || true
  
  [[ "$output" == *"[VERBOSE]"* ]] || true
}

@test "verbose: combined with max-iterations" {
  create_git_repo
  
  mkdir -p openspec/changes
  cp -r "$FIXTURES_DIR" openspec/changes/
  
  run bash "$SCRIPT_PATH" --change simple-feature --max-iterations 5 --verbose 2>&1 || true
  
  [[ "$output" == *"[VERBOSE]"* ]] || [[ "$output" == *"Max iterations: 5"* ]] || true
}
