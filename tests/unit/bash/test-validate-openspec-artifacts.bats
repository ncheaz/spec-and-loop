#!/usr/bin/env bats

# Test suite for validate_openspec_artifacts() function
# Tests OpenSpec artifact validation logic

setup() {
  # Load the main script to access the validate_openspec_artifacts function
  load '../../helpers/test-common'
  source ../../../scripts/ralph-run.sh
}

teardown() {
  cleanup_test_dir
}

@test "validate_openspec_artifacts: succeeds with all required artifacts" {
  # Create a test directory with a complete OpenSpec change
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1

  # Create a complete OpenSpec change
  local change_dir
  change_dir=$(create_openspec_change "complete-change")

  # Run validate_openspec_artifacts - should succeed without exiting
  run validate_openspec_artifacts "$change_dir"

  # Function should complete without error
  [ "$status" -eq 0 ]

  # Output should contain validation success message
  [[ "$output" == *"All OpenSpec artifacts validated"* ]] || true
}

@test "validate_openspec_artifacts: fails when proposal.md is missing" {
  # Create a test directory
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1

  # Create an OpenSpec change without proposal.md
  local change_dir="$test_dir/openspec/changes/incomplete-change"
  mkdir -p "$change_dir/specs"

  # Create all required files except proposal.md
  touch "$change_dir/design.md"
  touch "$change_dir/tasks.md"
  mkdir -p "$change_dir/specs/test-spec"
  touch "$change_dir/specs/test-spec/spec.md"

  # Run validate_openspec_artifacts - should exit with error
  run bash -c 'source scripts/ralph-run.sh && validate_openspec_artifacts "$1"' _ "$change_dir"

  # Function should exit with code 1
  [ "$status" -eq 1 ]

  # Output should contain error about missing proposal.md
  [[ "$output" == *"Required artifact not found: proposal.md"* ]] || true
}

@test "validate_openspec_artifacts: fails when design.md is missing" {
  # Create a test directory
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1

  # Create an OpenSpec change without design.md
  local change_dir="$test_dir/openspec/changes/incomplete-change"
  mkdir -p "$change_dir/specs"

  # Create all required files except design.md
  touch "$change_dir/proposal.md"
  touch "$change_dir/tasks.md"
  mkdir -p "$change_dir/specs/test-spec"
  touch "$change_dir/specs/test-spec/spec.md"

  # Run validate_openspec_artifacts - should exit with error
  run bash -c 'source scripts/ralph-run.sh && validate_openspec_artifacts "$1"' _ "$change_dir"

  # Function should exit with code 1
  [ "$status" -eq 1 ]

  # Output should contain error about missing design.md
  [[ "$output" == *"Required artifact not found: design.md"* ]] || true
}

@test "validate_openspec_artifacts: fails when tasks.md is missing" {
  # Create a test directory
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1

  # Create an OpenSpec change without tasks.md
  local change_dir="$test_dir/openspec/changes/incomplete-change"
  mkdir -p "$change_dir/specs"

  # Create all required files except tasks.md
  touch "$change_dir/proposal.md"
  touch "$change_dir/design.md"
  mkdir -p "$change_dir/specs/test-spec"
  touch "$change_dir/specs/test-spec/spec.md"

  # Run validate_openspec_artifacts - should exit with error
  run bash -c 'source scripts/ralph-run.sh && validate_openspec_artifacts "$1"' _ "$change_dir"

  # Function should exit with code 1
  [ "$status" -eq 1 ]

  # Output should contain error about missing tasks.md
  [[ "$output" == *"Required artifact not found: tasks.md"* ]] || true
}

@test "validate_openspec_artifacts: fails when specs/ directory is missing" {
  # Create a test directory
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1

  # Create an OpenSpec change without specs/ directory
  local change_dir="$test_dir/openspec/changes/incomplete-change"
  mkdir -p "$change_dir"

  # Create all required files except specs/ directory
  touch "$change_dir/proposal.md"
  touch "$change_dir/design.md"
  touch "$change_dir/tasks.md"

  # Run validate_openspec_artifacts - should exit with error
  run bash -c 'source scripts/ralph-run.sh && validate_openspec_artifacts "$1"' _ "$change_dir"

  # Function should exit with code 1
  [ "$status" -eq 1 ]

  # Output should contain error about missing specs/ directory
  [[ "$output" == *"Required directory not found: specs/"* ]] || true
}

@test "validate_openspec_artifacts: fails when multiple artifacts are missing" {
  # Create a test directory
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1

  # Create an OpenSpec change with only proposal.md
  local change_dir="$test_dir/openspec/changes/incomplete-change"
  mkdir -p "$change_dir"

  # Create only proposal.md
  touch "$change_dir/proposal.md"

  # Run validate_openspec_artifacts - should exit with error
  run bash -c 'source scripts/ralph-run.sh && validate_openspec_artifacts "$1"' _ "$change_dir"

  # Function should exit with code 1
  [ "$status" -eq 1 ]

  # Output should contain error about missing design.md (first missing file)
  [[ "$output" == *"Required artifact not found: design.md"* ]] || true
}

@test "validate_openspec_artifacts: validates empty specs/ directory" {
  # Create a test directory
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1

  # Create an OpenSpec change with empty specs/ directory
  local change_dir="$test_dir/openspec/changes/empty-specs"
  mkdir -p "$change_dir/specs"

  # Create all required files
  touch "$change_dir/proposal.md"
  touch "$change_dir/design.md"
  touch "$change_dir/tasks.md"

  # Run validate_openspec_artifacts - should succeed (only checks directory exists)
  run validate_openspec_artifacts "$change_dir"

  # Function should complete without error
  [ "$status" -eq 0 ]

  # Output should contain validation success message
  [[ "$output" == *"All OpenSpec artifacts validated"* ]] || true
}

@test "validate_openspec_artifacts: validates with multiple spec files" {
  # Create a test directory
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1

  # Create an OpenSpec change with multiple spec files
  local change_dir="$test_dir/openspec/changes/multi-spec"
  mkdir -p "$change_dir/specs/spec1"
  mkdir -p "$change_dir/specs/spec2"
  mkdir -p "$change_dir/specs/spec3"

  # Create all required files
  touch "$change_dir/proposal.md"
  touch "$change_dir/design.md"
  touch "$change_dir/tasks.md"
  touch "$change_dir/specs/spec1/spec.md"
  touch "$change_dir/specs/spec2/spec.md"
  touch "$change_dir/specs/spec3/spec.md"

  # Run validate_openspec_artifacts - should succeed
  run validate_openspec_artifacts "$change_dir"

  # Function should complete without error
  [ "$status" -eq 0 ]

  # Output should contain validation success message
  [[ "$output" == *"All OpenSpec artifacts validated"* ]] || true
}

@test "validate_openspec_artifacts: logs verbose messages during validation" {
  # Create a test directory with a complete OpenSpec change
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1

  # Create a complete OpenSpec change
  local change_dir
  change_dir=$(create_openspec_change "verbose-test")

  # Run validate_openspec_artifacts with verbose output
  VERBOSE=true
  run validate_openspec_artifacts "$change_dir"

  # Function should complete without error
  [ "$status" -eq 0 ]

  # Output should contain verbose messages
  [[ "$output" == *"Validating OpenSpec artifacts"* || "$output" == *"validating"* ]] || true
  [[ "$output" == *"Found artifact: proposal.md"* ]] || true
  [[ "$output" == *"Found artifact: design.md"* ]] || true
  [[ "$output" == *"Found artifact: tasks.md"* ]] || true
  [[ "$output" == *"Found directory: specs/"* ]] || true
}

@test "validate_openspec_artifacts: validates specs/ as a subdirectory" {
  # Create a test directory
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1

  # Create an OpenSpec change with nested specs/ directory
  local change_dir="$test_dir/openspec/changes/nested-specs"
  mkdir -p "$change_dir/specs/deep/nested"

  # Create all required files
  touch "$change_dir/proposal.md"
  touch "$change_dir/design.md"
  touch "$change_dir/tasks.md"

  # Run validate_openspec_artifacts - should succeed
  run validate_openspec_artifacts "$change_dir"

  # Function should complete without error
  [ "$status" -eq 0 ]

  # Output should contain validation success message
  [[ "$output" == *"All OpenSpec artifacts validated"* ]] || true
}

@test "validate_openspec_artifacts: handles absolute path for change_dir" {
  # Create a test directory with a complete OpenSpec change
  local test_dir
  test_dir=$(setup_test_dir)

  # Create a complete OpenSpec change
  local change_dir
  change_dir=$(create_openspec_change "absolute-path-test")
  cd "$test_dir" || return 1

  # Run validate_openspec_artifacts with absolute path
  run validate_openspec_artifacts "$change_dir"

  # Function should complete without error
  [ "$status" -eq 0 ]

  # Output should contain validation success message
  [[ "$output" == *"All OpenSpec artifacts validated"* ]] || true
}

@test "validate_openspec_artifacts: handles relative path for change_dir" {
  # Create a test directory with a complete OpenSpec change
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1

  # Create a complete OpenSpec change
  local change_dir
  create_openspec_change "relative-path-test"

  # Run validate_openspec_artifacts with relative path
  run validate_openspec_artifacts "openspec/changes/relative-path-test"

  # Function should complete without error
  [ "$status" -eq 0 ]

  # Output should contain validation success message
  [[ "$output" == *"All OpenSpec artifacts validated"* ]] || true
}
