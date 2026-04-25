#!/usr/bin/env bats

# Test suite for show_ralphify_warning() function
# Tests the interactive ralphify guard warning and prompt

PROJECT_ROOT=""
setup() {
  load '../../helpers/test-common'
  PROJECT_ROOT="$PWD"
  TEST_DIR=$(setup_test_dir)
}

teardown() {
  cleanup_test_dir
}

@test "show_ralphify_warning: displays bordered warning box on stderr" {
  local test_dir="$TEST_DIR"

  run bash -c "
    cd '$test_dir'
    source '$PROJECT_ROOT/tests/helpers/test-functions.sh'
    echo 'C' | show_ralphify_warning test-change 2>&1
  "

  [[ "$output" == *"WARNING"* ]]
  [[ "$output" == *"Ralph Wiggum"* ]]
}

@test "show_ralphify_warning: displays three options A, C, Q" {
  local test_dir="$TEST_DIR"

  run bash -c "
    cd '$test_dir'
    source '$PROJECT_ROOT/tests/helpers/test-functions.sh'
    echo 'C' | show_ralphify_warning test-change 2>&1
  "

  [[ "$output" == *"[A]"* ]]
  [[ "$output" == *"[C]"* ]]
  [[ "$output" == *"[Q]"* ]]
}

@test "show_ralphify_warning: option C continues with info message" {
  local test_dir="$TEST_DIR"

  run bash -c "
    cd '$test_dir'
    source '$PROJECT_ROOT/tests/helpers/test-functions.sh'
    echo 'C' | show_ralphify_warning test-change 2>&1
  "

  [ "$status" -eq 0 ]
  [[ "$output" == *"Continuing without"* ]]
}

@test "show_ralphify_warning: option Q exits with code 0" {
  local test_dir="$TEST_DIR"

  run bash -c "
    cd '$test_dir'
    source '$PROJECT_ROOT/tests/helpers/test-functions.sh'
    echo 'Q' | show_ralphify_warning test-change 2>&1
  "

  [ "$status" -eq 0 ]
  [[ "$output" == *"Exiting"* ]]
}

@test "show_ralphify_warning: option A calls ralphify_init" {
  local test_dir="$TEST_DIR"
  mkdir -p "$test_dir/openspec"
  echo "schema: spec-driven" > "$test_dir/openspec/config.yaml"
  mkdir -p "$test_dir/scripts/.."
  echo "# Ralph Best Practices" > "$test_dir/OPENSPEC-RALPH-BP.md"

  cd "$test_dir"
  git init -q
  git config user.email "test@example.com"
  git config user.name "Test User"
  touch README.md
  git add README.md
  git commit -q -m "init"

  run bash -c "
    cd '$test_dir'
    export SCRIPT_DIR='$test_dir/scripts'
    source '$PROJECT_ROOT/tests/helpers/test-functions.sh'
    echo 'A' | show_ralphify_warning test-change 2>&1
  "

  [[ "$output" == *"ralphify init"* ]] || [[ "$output" == *"ralphified"* ]]
}

@test "show_ralphify_warning: option A deletes proposal.md" {
  local test_dir="$TEST_DIR"
  mkdir -p "$test_dir/openspec/changes/test-change"
  echo "# Proposal" > "$test_dir/openspec/changes/test-change/proposal.md"
  mkdir -p "$test_dir/openspec"
  echo "schema: spec-driven" > "$test_dir/openspec/config.yaml"
  mkdir -p "$test_dir/scripts/.."
  echo "# Ralph Best Practices" > "$test_dir/OPENSPEC-RALPH-BP.md"

  cd "$test_dir"
  git init -q
  git config user.email "test@example.com"
  git config user.name "Test User"
  touch README.md
  git add README.md
  git commit -q -m "init"

  run bash -c "
    cd '$test_dir'
    export SCRIPT_DIR='$test_dir/scripts'
    source '$PROJECT_ROOT/tests/helpers/test-functions.sh'
    echo 'A' | show_ralphify_warning test-change 2>&1 || true
  "

  [ ! -f "$test_dir/openspec/changes/test-change/proposal.md" ]
}

@test "show_ralphify_warning: invalid input re-prompts" {
  local test_dir="$TEST_DIR"

  run bash -c "
    cd '$test_dir'
    source '$PROJECT_ROOT/tests/helpers/test-functions.sh'
    printf 'X\nC\n' | show_ralphify_warning test-change 2>&1
  "

  [ "$status" -eq 0 ]
  [[ "$output" == *"Invalid"* ]]
}

@test "show_ralphify_warning: lowercase option c works" {
  local test_dir="$TEST_DIR"

  run bash -c "
    cd '$test_dir'
    source '$PROJECT_ROOT/tests/helpers/test-functions.sh'
    echo 'c' | show_ralphify_warning test-change 2>&1
  "

  [ "$status" -eq 0 ]
}

@test "show_ralphify_warning: lowercase option q works" {
  local test_dir="$TEST_DIR"

  run bash -c "
    cd '$test_dir'
    source '$PROJECT_ROOT/tests/helpers/test-functions.sh'
    echo 'q' | show_ralphify_warning test-change 2>&1
  "

  [ "$status" -eq 0 ]
}

@test "show_ralphify_warning: warns about non-ralphified project" {
  local test_dir="$TEST_DIR"

  run bash -c "
    cd '$test_dir'
    source '$PROJECT_ROOT/tests/helpers/test-functions.sh'
    echo 'C' | show_ralphify_warning test-change 2>&1
  "

  [[ "$output" == *"not"* ]] && [[ "$output" == *"ralphified"* ]]
}
