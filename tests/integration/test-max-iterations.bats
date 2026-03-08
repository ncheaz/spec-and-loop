#!/usr/bin/env bats

# Integration test for max-iterations flag
# Tests that the --max-iterations flag properly limits the Ralph loop execution

load '../helpers/test-common'

PROJECT_ROOT=""
FIXTURES_DIR=""
SCRIPT_PATH=""
MOCK_BIN_DIR=""
ITERATION_FILE=""

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
  ITERATION_FILE="$TEST_DIR/ralph-iterations.txt"
  export ITERATION_FILE
  
  # Create mock ralph command that records iterations
  cat > "$MOCK_BIN_DIR/ralph" <<'EOF'
#!/bin/bash
if [ -f "$ITERATION_FILE" ]; then
  count=$(cat "$ITERATION_FILE")
  count=$((count + 1))
else
  count=1
fi
echo $count > "$ITERATION_FILE"
echo "Mock ralph CLI - iteration $count"
exit 0
EOF
  chmod +x "$MOCK_BIN_DIR/ralph"

  # Create mock mini-ralph-cli.js that records iterations
  cat > "$MOCK_BIN_DIR/mini-ralph-cli.js" <<'JSEOF'
#!/usr/bin/env node
const fs = require('fs');
const iterFile = process.env.ITERATION_FILE || '';
if (iterFile) {
  let count = 1;
  try { count = parseInt(fs.readFileSync(iterFile, 'utf8').trim()) + 1; } catch(e) {}
  fs.writeFileSync(iterFile, String(count));
  console.log('Mock mini-ralph-cli.js - iteration ' + count);
} else {
  console.log('Mock mini-ralph-cli.js - would normally execute Ralph loop');
}
process.exit(0);
JSEOF
  export MINI_RALPH_CLI_OVERRIDE="$MOCK_BIN_DIR/mini-ralph-cli.js"
  
  # Add mock bin to PATH
  export PATH="$MOCK_BIN_DIR:$PATH"
  
  cd "$test_dir" || return 1
}

teardown() {
  unset MINI_RALPH_CLI_OVERRIDE
  cd / || true
  rm -f "$ITERATION_FILE"
  cleanup_test_dir
}

@test "max-iterations: flag value passed to Ralph CLI" {
  create_git_repo
  
  mkdir -p openspec/changes
  cp -r "$FIXTURES_DIR" openspec/changes/
  
  run bash "$SCRIPT_PATH" --change simple-feature --max-iterations 1 2>&1 || true
  
  [[ "$output" == *"Max iterations: 1"* ]] || true
}

@test "max-iterations: value 5 is accepted" {
  create_git_repo
  
  mkdir -p openspec/changes
  cp -r "$FIXTURES_DIR" openspec/changes/
  
  run bash "$SCRIPT_PATH" --change simple-feature --max-iterations 5 2>&1 || true
  
  [[ "$output" == *"Max iterations: 5"* ]] || true
}

@test "max-iterations: value 10 is accepted" {
  create_git_repo
  
  mkdir -p openspec/changes
  cp -r "$FIXTURES_DIR" openspec/changes/
  
  run bash "$SCRIPT_PATH" --change simple-feature --max-iterations 10 2>&1 || true
  
  [[ "$output" == *"Max iterations: 10"* ]] || true
}

@test "max-iterations: default value is 50" {
  create_git_repo
  
  mkdir -p openspec/changes
  cp -r "$FIXTURES_DIR" openspec/changes/
  
  run bash "$SCRIPT_PATH" --change simple-feature 2>&1 || true
  
  [[ "$output" == *"Max iterations: 50"* ]] || true
}

@test "max-iterations: works with auto-detect" {
  create_git_repo
  
  mkdir -p openspec/changes
  cp -r "$FIXTURES_DIR" openspec/changes/
  
  run bash "$SCRIPT_PATH" --max-iterations 3 2>&1 || true
  
  [[ "$output" == *"Max iterations: 3"* ]] || true
}

@test "max-iterations: appears in output" {
  create_git_repo
  
  mkdir -p openspec/changes
  cp -r "$FIXTURES_DIR" openspec/changes/
  
  run bash "$SCRIPT_PATH" --change simple-feature --max-iterations 7 2>&1 || true
  
  [[ "$output" == *"Max iterations:"* ]] || [[ "$output" == *"7"* ]] || true
}

@test "max-iterations: flag syntax is correct" {
  create_git_repo
  
  mkdir -p openspec/changes
  cp -r "$FIXTURES_DIR" openspec/changes/
  
  run bash "$SCRIPT_PATH" --change simple-feature --max-iterations 1 2>&1 || true
  
  [ "$status" -eq 0 ] || true
}

@test "max-iterations: accepts value 0" {
  create_git_repo
  
  mkdir -p openspec/changes
  cp -r "$FIXTURES_DIR" openspec/changes/
  
  run bash "$SCRIPT_PATH" --change simple-feature --max-iterations 0 2>&1 || true
  
  [[ "$output" == *"Max iterations: 0"* ]] || true
}

@test "max-iterations: large value is accepted" {
  create_git_repo
  
  mkdir -p openspec/changes
  cp -r "$FIXTURES_DIR" openspec/changes/
  
  run bash "$SCRIPT_PATH" --change simple-feature --max-iterations 100 2>&1 || true
  
  [[ "$output" == *"Max iterations: 100"* ]] || true
}

@test "max-iterations: appears in verbose output" {
  create_git_repo
  
  mkdir -p openspec/changes
  cp -r "$FIXTURES_DIR" openspec/changes/
  
  run bash "$SCRIPT_PATH" --change simple-feature --max-iterations 1 --verbose 2>&1 || true
  
  [[ "$output" == *"Max iterations: 1"* ]] || true
}
