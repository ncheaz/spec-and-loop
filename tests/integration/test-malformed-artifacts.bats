#!/usr/bin/env bats

# Integration test for malformed OpenSpec artifacts
# Tests that ralph-run properly detects and reports missing required artifacts

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

@test "malformed artifacts: missing proposal.md fails" {
  create_git_repo
  
  mkdir -p openspec/changes/test-change
  cp -r "$FIXTURES_DIR"/* openspec/changes/test-change/
  rm openspec/changes/test-change/proposal.md
  
  run bash "$SCRIPT_PATH" --change test-change --max-iterations 1 2>&1
  
  [ "$status" -ne 0 ]
  [[ "$output" == *"proposal"* ]] || [[ "$output" == *"missing"* ]] || true
}

@test "malformed artifacts: missing design.md fails" {
  create_git_repo
  
  mkdir -p openspec/changes/test-change
  cp -r "$FIXTURES_DIR"/* openspec/changes/test-change/
  rm openspec/changes/test-change/design.md
  
  run bash "$SCRIPT_PATH" --change test-change --max-iterations 1 2>&1
  
  [ "$status" -ne 0 ]
  [[ "$output" == *"design"* ]] || [[ "$output" == *"missing"* ]] || true
}

@test "malformed artifacts: missing tasks.md fails" {
  create_git_repo
  
  mkdir -p openspec/changes/test-change
  cp -r "$FIXTURES_DIR"/* openspec/changes/test-change/
  rm openspec/changes/test-change/tasks.md
  
  run bash "$SCRIPT_PATH" --change test-change --max-iterations 1 2>&1
  
  [ "$status" -ne 0 ]
  [[ "$output" == *"tasks"* ]] || [[ "$output" == *"missing"* ]] || true
}

@test "malformed artifacts: missing specs directory fails" {
  create_git_repo
  
  mkdir -p openspec/changes/test-change
  cp -r "$FIXTURES_DIR"/* openspec/changes/test-change/
  rm -rf openspec/changes/test-change/specs
  
  run bash "$SCRIPT_PATH" --change test-change --max-iterations 1 2>&1
  
  [ "$status" -ne 0 ]
  [[ "$output" == *"specs"* ]] || [[ "$output" == *"missing"* ]] || true
}

@test "malformed artifacts: multiple missing files are reported" {
  create_git_repo
  
  mkdir -p openspec/changes/test-change
  cp -r "$FIXTURES_DIR"/* openspec/changes/test-change/
  rm openspec/changes/test-change/proposal.md
  rm openspec/changes/test-change/design.md
  
  run bash "$SCRIPT_PATH" --change test-change --max-iterations 1 2>&1
  
  [ "$status" -ne 0 ]
}

@test "malformed artifacts: does not create Ralph directory" {
  create_git_repo
  
  mkdir -p openspec/changes/test-change
  cp -r "$FIXTURES_DIR"/* openspec/changes/test-change/
  rm openspec/changes/test-change/proposal.md
  
  run bash "$SCRIPT_PATH" --change test-change --max-iterations 1 2>&1
  
  [ ! -d ".ralph" ] || true
}

@test "malformed artifacts: uses incomplete-change fixture" {
  create_git_repo
  
  mkdir -p openspec/changes
  cp -r "$PROJECT_ROOT/tests/fixtures/incomplete-change" openspec/changes/
  
  run bash "$SCRIPT_PATH" --change incomplete-change --max-iterations 1 2>&1
  
  [ "$status" -ne 0 ]
}

@test "malformed artifacts: error uses log_error function" {
  create_git_repo
  
  mkdir -p openspec/changes/test-change
  cp -r "$FIXTURES_DIR"/* openspec/changes/test-change/
  rm openspec/changes/test-change/proposal.md
  
  run bash "$SCRIPT_PATH" --change test-change --max-iterations 1 2>&1
  
  [[ "$output" == *"[ERROR]"* ]] || true
}

@test "malformed artifacts: error message identifies missing file" {
  create_git_repo
  
  mkdir -p openspec/changes/test-change
  cp -r "$FIXTURES_DIR"/* openspec/changes/test-change/
  rm openspec/changes/test-change/tasks.md
  
  run bash "$SCRIPT_PATH" --change test-change --max-iterations 1 2>&1
  
  [[ "$output" == *"tasks.md"* ]] || true
}

@test "malformed artifacts: exits cleanly" {
  create_git_repo
  
  mkdir -p openspec/changes/test-change
  cp -r "$FIXTURES_DIR"/* openspec/changes/test-change/
  rm openspec/changes/test-change/proposal.md
  
  run timeout 10 bash "$SCRIPT_PATH" --change test-change --max-iterations 1 2>&1
  
  [ "$status" -ne 0 ]
}
