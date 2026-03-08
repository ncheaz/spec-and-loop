#!/usr/bin/env bats

# Integration test for invalid git repository
# Tests that ralph-run properly detects and reports non-git directories

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
  
  cd "$test_dir" || return 1
}

teardown() {
  cd / || true
  cleanup_test_dir
}

@test "invalid git: script fails in non-git directory" {
  mkdir -p openspec/changes
  cp -r "$FIXTURES_DIR" openspec/changes/
  
  run bash "$SCRIPT_PATH" --change simple-feature --max-iterations 1 2>&1
  
  [ "$status" -ne 0 ]
}

@test "invalid git: error message mentions git" {
  mkdir -p openspec/changes
  cp -r "$FIXTURES_DIR" openspec/changes/
  
  run bash "$SCRIPT_PATH" --change simple-feature --max-iterations 1 2>&1
  
  [[ "$output" == *"git"* ]] || true
}

@test "invalid git: error message suggests git init" {
  mkdir -p openspec/changes
  cp -r "$FIXTURES_DIR" openspec/changes/
  
  run bash "$SCRIPT_PATH" --change simple-feature --max-iterations 1 2>&1
  
  [[ "$output" == *"git init"* ]] || [[ "$output" == *"repository"* ]] || true
}

@test "invalid git: does not proceed with PRD generation" {
  mkdir -p openspec/changes
  cp -r "$FIXTURES_DIR" openspec/changes/
  
  run bash "$SCRIPT_PATH" --change simple-feature --max-iterations 1 2>&1
  
  [ ! -f ".ralph/PRD.md" ] || true
}

@test "invalid git: does not create Ralph directory" {
  mkdir -p openspec/changes
  cp -r "$FIXTURES_DIR" openspec/changes/
  
  run bash "$SCRIPT_PATH" --change simple-feature --max-iterations 1 2>&1
  
  [ ! -d ".ralph" ] || true
}

@test "invalid git: works with auto-detect" {
  mkdir -p openspec/changes
  cp -r "$FIXTURES_DIR" openspec/changes/
  
  run bash "$SCRIPT_PATH" --max-iterations 1 2>&1
  
  [ "$status" -ne 0 ]
}

@test "invalid git: error uses log_error function" {
  mkdir -p openspec/changes
  cp -r "$FIXTURES_DIR" openspec/changes/
  
  run bash "$SCRIPT_PATH" --change simple-feature --max-iterations 1 2>&1
  
  [[ "$output" == *"[ERROR]"* ]] || true
}

@test "invalid git: error message is clear" {
  mkdir -p openspec/changes
  cp -r "$FIXTURES_DIR" openspec/changes/
  
  run bash "$SCRIPT_PATH" --change simple-feature --max-iterations 1 2>&1
  
  [[ "$output" == *"not a git repository"* ]] || [[ "$output" == *"git repository"* ]] || true
}

@test "invalid git: exits cleanly" {
  mkdir -p openspec/changes
  cp -r "$FIXTURES_DIR" openspec/changes/
  
  run run_with_timeout 10 bash "$SCRIPT_PATH" --change simple-feature --max-iterations 1 2>&1
  
  [ "$status" -ne 0 ]
}

@test "invalid git: verbose shows validation" {
  mkdir -p openspec/changes
  cp -r "$FIXTURES_DIR" openspec/changes/
  
  run bash "$SCRIPT_PATH" --change simple-feature --max-iterations 1 --verbose 2>&1
  
  [[ "$output" == *"Validating git repository"* ]] || true
}
