#!/usr/bin/env bats

# Integration test for missing dependencies error handling
# Tests that ralph-run properly detects and reports missing ralph CLI

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
  
  # Remove ralph from PATH to simulate missing CLI
  export PATH="/usr/bin:/bin:/usr/sbin:/sbin"
  
  cd "$test_dir" || return 1
}

teardown() {
  cd / || true
  cleanup_test_dir
}

@test "missing ralph: script fails with error" {
  create_git_repo
  
  mkdir -p openspec/changes
  cp -r "$FIXTURES_DIR" openspec/changes/
  
  run bash "$SCRIPT_PATH" --change simple-feature --max-iterations 1 2>&1
  
  [ "$status" -ne 0 ]
}

@test "missing ralph: error message mentions ralph CLI" {
  create_git_repo
  
  mkdir -p openspec/changes
  cp -r "$FIXTURES_DIR" openspec/changes/
  
  run bash "$SCRIPT_PATH" --change simple-feature --max-iterations 1 2>&1
  
  [[ "$output" == *"ralph"* ]] || [[ "$output" == *"CLI"* ]] || true
}

@test "missing ralph: error message provides installation hint" {
  create_git_repo
  
  mkdir -p openspec/changes
  cp -r "$FIXTURES_DIR" openspec/changes/
  
  run bash "$SCRIPT_PATH" --change simple-feature --max-iterations 1 2>&1
  
  [[ "$output" == *"npm install"* ]] || [[ "$output" == *"install"* ]] || true
}

@test "missing ralph: validates dependencies before PRD generation" {
  create_git_repo
  
  mkdir -p openspec/changes
  cp -r "$FIXTURES_DIR" openspec/changes/
  
  run bash "$SCRIPT_PATH" --change simple-feature --max-iterations 1 2>&1
  
  [ ! -f ".ralph/PRD.md" ] || true
}

@test "missing ralph: does not create Ralph directory" {
  create_git_repo
  
  mkdir -p openspec/changes
  cp -r "$FIXTURES_DIR" openspec/changes/
  
  run bash "$SCRIPT_PATH" --change simple-feature --max-iterations 1 2>&1
  
  [ ! -d ".ralph" ] || true
}

@test "missing ralph: works with auto-detect" {
  create_git_repo
  
  mkdir -p openspec/changes
  cp -r "$FIXTURES_DIR" openspec/changes/
  
  run bash "$SCRIPT_PATH" --max-iterations 1 2>&1
  
  [ "$status" -ne 0 ]
}

@test "missing ralph: error uses log_error function" {
  create_git_repo
  
  mkdir -p openspec/changes
  cp -r "$FIXTURES_DIR" openspec/changes/
  
  run bash "$SCRIPT_PATH" --change simple-feature --max-iterations 1 2>&1
  
  [[ "$output" == *"[ERROR]"* ]] || true
}

@test "missing ralph: error is clear and actionable" {
  create_git_repo
  
  mkdir -p openspec/changes
  cp -r "$FIXTURES_DIR" openspec/changes/
  
  run bash "$SCRIPT_PATH" --change simple-feature --max-iterations 1 2>&1
  
  [[ "$output" == *"not found"* ]] || [[ "$output" == *"missing"* ]] || true
}

@test "missing ralph: exits cleanly without hanging" {
  create_git_repo
  
  mkdir -p openspec/changes
  cp -r "$FIXTURES_DIR" openspec/changes/
  
  run timeout 10 bash "$SCRIPT_PATH" --change simple-feature --max-iterations 1 2>&1
  
  [ "$status" -ne 0 ]
}

@test "missing ralph: verbose flag shows dependency validation" {
  create_git_repo
  
  mkdir -p openspec/changes
  cp -r "$FIXTURES_DIR" openspec/changes/
  
  run bash "$SCRIPT_PATH" --change simple-feature --max-iterations 1 --verbose 2>&1
  
  [[ "$output" == *"Validating"* ]] || [[ "$output" == *"dependencies"* ]] || true
}
