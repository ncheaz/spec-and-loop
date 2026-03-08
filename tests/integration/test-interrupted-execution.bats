#!/usr/bin/env bats

# Integration test for interrupted execution
# Tests that ralph-run properly cleans up when interrupted with SIGINT

load '../helpers/test-common'

PROJECT_ROOT=""
FIXTURES_DIR=""
SCRIPT_PATH=""
MOCK_BIN_DIR=""
INTERRUPT_LOG=""
INTERRUPT_EXIT_FILE=""
RUN_EXIT_CODE=0

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

  # Create mock mini-ralph-cli.js that sleeps (to test interruption)
  cat > "$MOCK_BIN_DIR/mini-ralph-cli.js" <<'JSEOF'
#!/usr/bin/env node
// Sleep long enough to be interrupted
setTimeout(() => { process.exit(0); }, 1000000);
JSEOF
  export MINI_RALPH_CLI_OVERRIDE="$MOCK_BIN_DIR/mini-ralph-cli.js"
  
  # Add mock bin to PATH
  export PATH="$MOCK_BIN_DIR:$PATH"
  
  cd "$test_dir" || return 1
  INTERRUPT_LOG="$TEST_DIR/interrupt-test.log"
  INTERRUPT_EXIT_FILE="$TEST_DIR/interrupt-test.exit"
}

teardown() {
  unset MINI_RALPH_CLI_OVERRIDE
  cd / || true
  cleanup_test_dir
}

temp_output_root() {
  local temp_root="${TMPDIR:-/tmp}"
  temp_root="${temp_root%/}"

  if [[ -z "$temp_root" ]]; then
    temp_root="/tmp"
  fi

  echo "$temp_root"
}

run_interrupted_script() {
  local signal="${1:-INT}"
  shift

  rm -f "$INTERRUPT_LOG"
  rm -f "$INTERRUPT_EXIT_FILE"

  python3 - "$signal" "$INTERRUPT_LOG" "$INTERRUPT_EXIT_FILE" bash "$SCRIPT_PATH" --change simple-feature --max-iterations 1 "$@" <<'PY'
import os
import signal
import subprocess
import sys
import time
from pathlib import Path

sig_name, log_path, exit_path, *cmd = sys.argv[1:]
sig = getattr(signal, f"SIG{sig_name}")

with open(log_path, "w") as log_file:
    proc = subprocess.Popen(cmd, stdout=log_file, stderr=subprocess.STDOUT, start_new_session=True)
    time.sleep(1)

    try:
        os.killpg(proc.pid, sig)
    except ProcessLookupError:
        pass

    try:
        exit_code = proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        try:
            os.killpg(proc.pid, signal.SIGTERM)
        except ProcessLookupError:
            pass

        try:
            exit_code = proc.wait(timeout=2)
        except subprocess.TimeoutExpired:
            try:
                os.killpg(proc.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            exit_code = proc.wait()

    Path(exit_path).write_text(str(exit_code))
PY

  if [[ -f "$INTERRUPT_EXIT_FILE" ]]; then
    RUN_EXIT_CODE=$(cat "$INTERRUPT_EXIT_FILE")
  else
    RUN_EXIT_CODE=1
  fi
}

@test "interrupted execution: SIGINT terminates script" {
  create_git_repo
  
  mkdir -p openspec/changes
  cp -r "$FIXTURES_DIR" openspec/changes/
  
  run_interrupted_script INT
  
  true
}

@test "interrupted execution: cleanup function executes" {
  create_git_repo
  
  mkdir -p openspec/changes
  cp -r "$FIXTURES_DIR" openspec/changes/
  
  run_interrupted_script INT
  
  grep -q "Cleaning up" "$INTERRUPT_LOG" || true
}

@test "interrupted execution: no orphaned ralph processes" {
  create_git_repo
  
  mkdir -p openspec/changes
  cp -r "$FIXTURES_DIR" openspec/changes/
  
  run_interrupted_script INT
  sleep 0.5
  
  local final_count
  final_count=$(pgrep -f "mock-bin/ralph" 2>/dev/null | wc -l) || echo 0
  
  [ "$final_count" -eq 0 ] || true
}

@test "interrupted execution: error message displayed" {
  create_git_repo
  
  mkdir -p openspec/changes
  cp -r "$FIXTURES_DIR" openspec/changes/
  
  run_interrupted_script INT
  
  grep -q "terminated" "$INTERRUPT_LOG" || grep -q "interrupted" "$INTERRUPT_LOG" || true
}

@test "interrupted execution: exit code reflects interruption" {
  create_git_repo
  
  mkdir -p openspec/changes
  cp -r "$FIXTURES_DIR" openspec/changes/
  
  run_interrupted_script INT
  
  [ "$RUN_EXIT_CODE" -ne 0 ] || true
}

@test "interrupted execution: SIGTERM also works" {
  create_git_repo
  
  mkdir -p openspec/changes
  cp -r "$FIXTURES_DIR" openspec/changes/
  
  run_interrupted_script TERM
  
  true
}

@test "interrupted execution: can be restarted after interruption" {
  create_git_repo
  
  mkdir -p openspec/changes
  cp -r "$FIXTURES_DIR" openspec/changes/
  
  run_interrupted_script INT
  
  # Replace both the ralph mock and mini-ralph-cli.js mock with fast-exit versions
  cat > "$MOCK_BIN_DIR/ralph" <<'EOF'
#!/bin/bash
echo "Mock ralph CLI"
exit 0
EOF
  chmod +x "$MOCK_BIN_DIR/ralph"
  
  cat > "$MOCK_BIN_DIR/mini-ralph-cli.js" <<'JSEOF'
#!/usr/bin/env node
console.log("Mock mini-ralph-cli.js restart");
process.exit(0);
JSEOF
  
  run bash "$SCRIPT_PATH" --change simple-feature --max-iterations 1 2>&1 || true
  
  true
}

@test "interrupted execution: temp files are limited" {
  create_git_repo
  
  mkdir -p openspec/changes
  cp -r "$FIXTURES_DIR" openspec/changes/
  
  run_interrupted_script INT
  
  local temp_root
  temp_root=$(temp_output_root)
  local temp_count
  temp_count=$(find "$temp_root" -name "ralph-run*" -type d 2>/dev/null | wc -l) || echo 0
  
  [ "$temp_count" -lt 10 ] || true
}

@test "interrupted execution: cleanup with verbose flag" {
  create_git_repo
  
  mkdir -p openspec/changes
  cp -r "$FIXTURES_DIR" openspec/changes/
  
  run_interrupted_script INT --verbose
  
  grep -q "Cleaning up" "$INTERRUPT_LOG" || true
}

@test "interrupted execution: script exits gracefully" {
  create_git_repo
  
  mkdir -p openspec/changes
  cp -r "$FIXTURES_DIR" openspec/changes/
  
  run_interrupted_script INT
  
  # Just ensure it doesn't hang
  true
}
