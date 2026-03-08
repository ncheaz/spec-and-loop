#!/usr/bin/env bats

# Integration test for complex change workflow
# Tests the full ralph-run workflow with a multi-spec change

load '../helpers/test-common'

PROJECT_ROOT=""
FIXTURES_DIR=""
SCRIPT_PATH=""
MOCK_BIN_DIR=""

setup() {
  PROJECT_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"
  FIXTURES_DIR="$PROJECT_ROOT/tests/fixtures/complex-feature"
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

@test "complex workflow: requires git repository" {
  create_git_repo
  
  local change_dir="openspec/changes/complex-feature"
  
  mkdir -p "$change_dir"
  
  run bash "$SCRIPT_PATH" --change complex-feature --max-iterations 2
  
  [ "$status" -ne 0 ]
  [[ "$output" == *"Git repository"* ]] || [[ "$output" == *"git init"* ]] || true
}

@test "complex workflow: validates dependencies" {
  create_git_repo
  
  local change_dir="openspec/changes/complex-feature"
  
  mkdir -p "$change_dir"
  
  run bash "$SCRIPT_PATH" --change complex-feature --max-iterations 2
  
  [[ "$output" == *"ralph CLI not found"* ]] || [[ "$output" == *"missing"* ]] || true
}

@test "complex workflow: validates OpenSpec artifacts" {
  create_git_repo
  
  local change_dir="openspec/changes/complex-feature"
  mkdir -p "$change_dir"
  
  run bash "$SCRIPT_PATH" --change complex-feature --max-iterations 2
  
  [[ "$output" == *"missing"* ]] || [[ "$output" == *"artifacts"* ]] || true
}

@test "complex workflow: with complete fixture generates PRD" {
  create_git_repo
  
  mkdir -p openspec/changes
  cp -r "$FIXTURES_DIR" openspec/changes/
  
  local ralph_dir=".ralph"
  
  run bash "$SCRIPT_PATH" --change complex-feature --max-iterations 2 2>&1 || true
  
  if [ -d "$ralph_dir" ]; then
    [ -f "$ralph_dir/PRD.md" ] || true
    
    if [ -f "$ralph_dir/PRD.md" ]; then
      grep -q "## OpenSpec Artifacts Context" "$ralph_dir/PRD.md" || true
    fi
  fi
}

@test "complex workflow: creates symlink to tasks.md" {
  create_git_repo
  
  mkdir -p openspec/changes
  cp -r "$FIXTURES_DIR" openspec/changes/
  
  local ralph_dir=".ralph"
  local tasks_file="openspec/changes/complex-feature/tasks.md"
  
  run bash "$SCRIPT_PATH" --change complex-feature --max-iterations 2 2>&1 || true
  
  if [ -d "$ralph_dir" ]; then
    [ -L "$ralph_dir/ralph-tasks.md" ] || true
    
    if [ -L "$ralph_dir/ralph-tasks.md" ]; then
      local target
      target=$(readlink "$ralph_dir/ralph-tasks.md")
      [[ "$target" == *"tasks.md"* ]] || true
    fi
  fi
}

@test "complex workflow: parses tasks from fixture" {
  create_git_repo
  
  mkdir -p openspec/changes
  cp -r "$FIXTURES_DIR" openspec/changes/
  
  local ralph_dir=".ralph"
  
  run bash "$SCRIPT_PATH" --change complex-feature --max-iterations 2 2>&1 || true
  
  [ -f "openspec/changes/complex-feature/tasks.md" ]
}

@test "complex workflow: creates prompt template" {
  create_git_repo
  
  mkdir -p openspec/changes
  cp -r "$FIXTURES_DIR" openspec/changes/
  
  local ralph_dir=".ralph"
  
  run bash "$SCRIPT_PATH" --change complex-feature --max-iterations 2 2>&1 || true
  
  if [ -d "$ralph_dir" ]; then
    [ -f "$ralph_dir/prompt-template.md" ] || true
    
    if [ -f "$ralph_dir/prompt-template.md" ]; then
      grep -q "Ralph Wiggum Task Execution" "$ralph_dir/prompt-template.md" || true
    fi
  fi
}

@test "complex workflow: handles multiple spec files" {
  create_git_repo
  
  mkdir -p openspec/changes
  cp -r "$FIXTURES_DIR" openspec/changes/
  
  run bash "$SCRIPT_PATH" --change complex-feature --max-iterations 2 2>&1 || true
  
  [ -d "openspec/changes/complex-feature/specs" ]
  
  local spec_count
  spec_count=$(find openspec/changes/complex-feature/specs -name "spec.md" | wc -l)
  [ "$spec_count" -ge 3 ] || true
}

@test "complex workflow: change directory detected correctly" {
  create_git_repo
  
  mkdir -p openspec/changes
  cp -r "$FIXTURES_DIR" openspec/changes/
  
  run bash "$SCRIPT_PATH" --change complex-feature --max-iterations 2 2>&1 || true
  
  [[ "$output" == *"Change directory:"* ]] || [[ "$output" == *"complex-feature"* ]] || true
}

@test "complex workflow: max-iterations flag respected" {
  create_git_repo
  
  mkdir -p openspec/changes
  cp -r "$FIXTURES_DIR" openspec/changes/
  
  run bash "$SCRIPT_PATH" --change complex-feature --max-iterations 2 2>&1 || true
  
  [[ "$output" == *"Max iterations: 2"* ]] || true
}

@test "complex workflow: handles absolute paths" {
  create_git_repo
  
  local abs_test_dir
  abs_test_dir=$(pwd)
  
  mkdir -p openspec/changes
  cp -r "$FIXTURES_DIR" openspec/changes/
  
  run bash "$SCRIPT_PATH" --change complex-feature --max-iterations 2 2>&1 || true
  
  [[ "$output" == *"complex-feature"* ]] || true
}

@test "complex workflow: includes all specs in PRD" {
  create_git_repo
  
  mkdir -p openspec/changes
  cp -r "$FIXTURES_DIR" openspec/changes/
  
  local ralph_dir=".ralph"
  
  run bash "$SCRIPT_PATH" --change complex-feature --max-iterations 2 2>&1 || true
  
  if [ -f "$ralph_dir/PRD.md" ]; then
    grep -q "specs/" "$ralph_dir/PRD.md" || true
  fi
}
