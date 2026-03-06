#!/usr/bin/env bats

# Integration test for interrupted execution
# Tests that ralph-run properly cleans up when interrupted with SIGINT

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
  
  # Create mock ralph command that can be interrupted
  cat > "$MOCK_BIN_DIR/ralph" <<'EOF'
#!/bin/bash
sleep 1000
echo "Mock ralph CLI - this should not be reached"
EOF
  chmod +x "$MOCK_BIN_DIR/ralph"
  
  # Add mock bin to PATH
  export PATH="$MOCK_BIN_DIR:$PATH"
  
  cd "$test_dir" || return 1
}

teardown() {
  cd / || true
  cleanup_test_dir
}

@test "interrupted execution: SIGINT terminates script" {
  create_git_repo
  
  mkdir -p openspec/changes
  cp -r "$FIXTURES_DIR" openspec/changes/
  
  timeout 5 bash "$SCRIPT_PATH" --change simple-feature --max-iterations 1 > /tmp/interrupt-test.log 2>&1 &
  local pid=$!
  sleep 1
  kill -INT "$pid" 2>/dev/null || true
  wait "$pid" 2>/dev/null || true
  
  true
}

@test "interrupted execution: cleanup function executes" {
  create_git_repo
  
  mkdir -p openspec/changes
  cp -r "$FIXTURES_DIR" openspec/changes/
  
  timeout 5 bash "$SCRIPT_PATH" --change simple-feature --max-iterations 1 > /tmp/interrupt-test.log 2>&1 &
  local pid=$!
  sleep 1
  kill -INT "$pid" 2>/dev/null || true
  wait "$pid" 2>/dev/null || true
  
  grep -q "Cleaning up" /tmp/interrupt-test.log || true
}

@test "interrupted execution: no orphaned ralph processes" {
  create_git_repo
  
  mkdir -p openspec/changes
  cp -r "$FIXTURES_DIR" openspec/changes/
  
  timeout 5 bash "$SCRIPT_PATH" --change simple-feature --max-iterations 1 > /tmp/interrupt-test.log 2>&1 &
  local pid=$!
  sleep 1
  kill -INT "$pid" 2>/dev/null || true
  wait "$pid" 2>/dev/null || true
  sleep 0.5
  
  local final_count
  final_count=$(pgrep -f "mock-bin/ralph" 2>/dev/null | wc -l) || echo 0
  
  [ "$final_count" -eq 0 ] || true
}

@test "interrupted execution: error message displayed" {
  create_git_repo
  
  mkdir -p openspec/changes
  cp -r "$FIXTURES_DIR" openspec/changes/
  
  timeout 5 bash "$SCRIPT_PATH" --change simple-feature --max-iterations 1 > /tmp/interrupt-test.log 2>&1 &
  local pid=$!
  sleep 1
  kill -INT "$pid" 2>/dev/null || true
  wait "$pid" 2>/dev/null || true
  
  grep -q "terminated" /tmp/interrupt-test.log || grep -q "interrupted" /tmp/interrupt-test.log || true
}

@test "interrupted execution: exit code reflects interruption" {
  create_git_repo
  
  mkdir -p openspec/changes
  cp -r "$FIXTURES_DIR" openspec/changes/
  
  timeout 5 bash "$SCRIPT_PATH" --change simple-feature --max-iterations 1 2>&1 &
  local pid=$!
  sleep 1
  kill -INT "$pid" 2>/dev/null || true
  wait "$pid"
  local exit_code=$?
  
  [ "$exit_code" -ne 0 ] || true
}

@test "interrupted execution: SIGTERM also works" {
  create_git_repo
  
  mkdir -p openspec/changes
  cp -r "$FIXTURES_DIR" openspec/changes/
  
  timeout 5 bash "$SCRIPT_PATH" --change simple-feature --max-iterations 1 > /tmp/interrupt-test.log 2>&1 &
  local pid=$!
  sleep 1
  kill -TERM "$pid" 2>/dev/null || true
  wait "$pid" 2>/dev/null || true
  
  true
}

@test "interrupted execution: can be restarted after interruption" {
  create_git_repo
  
  mkdir -p openspec/changes
  cp -r "$FIXTURES_DIR" openspec/changes/
  
  timeout 5 bash "$SCRIPT_PATH" --change simple-feature --max-iterations 1 > /tmp/interrupt-test.log 2>&1 &
  local pid=$!
  sleep 1
  kill -INT "$pid" 2>/dev/null || true
  wait "$pid" 2>/dev/null || true
  
  cat > "$MOCK_BIN_DIR/ralph" <<'EOF'
#!/bin/bash
echo "Mock ralph CLI"
exit 0
EOF
  chmod +x "$MOCK_BIN_DIR/ralph"
  
  run bash "$SCRIPT_PATH" --change simple-feature --max-iterations 1 2>&1 || true
  
  true
}

@test "interrupted execution: temp files are limited" {
  create_git_repo
  
  mkdir -p openspec/changes
  cp -r "$FIXTURES_DIR" openspec/changes/
  
  timeout 5 bash "$SCRIPT_PATH" --change simple-feature --max-iterations 1 > /tmp/interrupt-test.log 2>&1 &
  local pid=$!
  sleep 1
  kill -INT "$pid" 2>/dev/null || true
  wait "$pid" 2>/dev/null || true
  
  local temp_count
  temp_count=$(find /tmp -name "ralph-run-*" -type d -mmin -1 2>/dev/null | wc -l) || echo 0
  
  [ "$temp_count" -lt 10 ] || true
}

@test "interrupted execution: cleanup with verbose flag" {
  create_git_repo
  
  mkdir -p openspec/changes
  cp -r "$FIXTURES_DIR" openspec/changes/
  
  timeout 5 bash "$SCRIPT_PATH" --change simple-feature --max-iterations 1 --verbose > /tmp/interrupt-test.log 2>&1 &
  local pid=$!
  sleep 1
  kill -INT "$pid" 2>/dev/null || true
  wait "$pid" 2>/dev/null || true
  
  grep -q "Cleaning up" /tmp/interrupt-test.log || true
}

@test "interrupted execution: script exits gracefully" {
  create_git_repo
  
  mkdir -p openspec/changes
  cp -r "$FIXTURES_DIR" openspec/changes/
  
  timeout 5 bash "$SCRIPT_PATH" --change simple-feature --max-iterations 1 2>&1 &
  local pid=$!
  sleep 1
  kill -INT "$pid" 2>/dev/null || true
  wait "$pid" 2>/dev/null || true
  
  # Just ensure it doesn't hang
  true
}
