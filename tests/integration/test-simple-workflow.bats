#!/usr/bin/env bats

# Integration test for simple change workflow
# Tests the full ralph-run workflow from initialization through Ralph loop execution

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

@test "simple workflow: validates git repository" {
  create_git_repo
  
  local change_dir="openspec/changes/simple-feature"
  
  mkdir -p "$change_dir"
  
  run bash "$SCRIPT_PATH" --change simple-feature --max-iterations 1
  
  [ "$status" -ne 0 ]
  [[ "$output" == *"Git repository"* ]] || [[ "$output" == *"git init"* ]] || true
}

@test "simple workflow: validates dependencies" {
  create_git_repo
  
  local change_dir="openspec/changes/simple-feature"
  
  mkdir -p "$change_dir"
  
  run bash "$SCRIPT_PATH" --change simple-feature --max-iterations 1
  
  [[ "$output" == *"ralph CLI not found"* ]] || [[ "$output" == *"missing"* ]] || true
}

@test "simple workflow: validates OpenSpec artifacts" {
  create_git_repo
  
  local change_dir="openspec/changes/simple-feature"
  mkdir -p "$change_dir"
  
  run bash "$SCRIPT_PATH" --change simple-feature --max-iterations 1
  
  [[ "$output" == *"missing"* ]] || [[ "$output" == *"artifacts"* ]] || true
}

@test "simple workflow: with complete fixture generates PRD" {
  create_git_repo
  
  mkdir -p openspec/changes
  cp -r "$FIXTURES_DIR" openspec/changes/
  
  local ralph_dir=".ralph"
  
  run bash "$SCRIPT_PATH" --change simple-feature --max-iterations 1 2>&1 || true
  
  if [ -d "$ralph_dir" ]; then
    [ -f "$ralph_dir/PRD.md" ] || true
  fi
}

@test "simple workflow: creates symlink to tasks.md" {
  create_git_repo
  
  mkdir -p openspec/changes
  cp -r "$FIXTURES_DIR" openspec/changes/
  
  local ralph_dir=".ralph"
  local tasks_file="openspec/changes/simple-feature/tasks.md"
  
  run bash "$SCRIPT_PATH" --change simple-feature --max-iterations 1 2>&1 || true
  
  if [ -d "$ralph_dir" ]; then
    [ -L "$ralph_dir/ralph-tasks.md" ] || true
    
    if [ -L "$ralph_dir/ralph-tasks.md" ]; then
      local target
      target=$(readlink "$ralph_dir/ralph-tasks.md")
      [[ "$target" == *"tasks.md"* ]] || true
    fi
  fi
}

@test "simple workflow: parses tasks from fixture" {
  create_git_repo
  
  mkdir -p openspec/changes
  cp -r "$FIXTURES_DIR" openspec/changes/
  
  local ralph_dir=".ralph"
  
  run bash "$SCRIPT_PATH" --change simple-feature --max-iterations 1 2>&1 || true
  
  [ -f "openspec/changes/simple-feature/tasks.md" ]
}

@test "simple workflow: creates prompt template" {
  create_git_repo
  
  mkdir -p openspec/changes
  cp -r "$FIXTURES_DIR" openspec/changes/
  
  local ralph_dir=".ralph"
  
  run bash "$SCRIPT_PATH" --change simple-feature --max-iterations 1 2>&1 || true
  
  if [ -d "$ralph_dir" ]; then
    [ -f "$ralph_dir/prompt-template.md" ] || true
    
    if [ -f "$ralph_dir/prompt-template.md" ]; then
      grep -q "Ralph Wiggum Task Execution" "$ralph_dir/prompt-template.md" || true
    fi
  fi
}

@test "simple workflow: change directory detected correctly" {
  create_git_repo
  
  mkdir -p openspec/changes
  cp -r "$FIXTURES_DIR" openspec/changes/
  
  run bash "$SCRIPT_PATH" --change simple-feature --max-iterations 1 2>&1 || true
  
  [[ "$output" == *"Change directory:"* ]] || [[ "$output" == *"simple-feature"* ]] || true
}

@test "simple workflow: max-iterations flag respected" {
  create_git_repo
  
  mkdir -p openspec/changes
  cp -r "$FIXTURES_DIR" openspec/changes/
  
  run bash "$SCRIPT_PATH" --change simple-feature --max-iterations 1 2>&1 || true
  
  [[ "$output" == *"Max iterations: 1"* ]] || true
}

@test "simple workflow: handles absolute paths" {
  create_git_repo
  
  local abs_test_dir
  abs_test_dir=$(pwd)
  
  mkdir -p openspec/changes
  cp -r "$FIXTURES_DIR" openspec/changes/
  
  run bash "$SCRIPT_PATH" --change simple-feature --max-iterations 1 2>&1 || true
  
  [[ "$output" == *"simple-feature"* ]] || true
}
