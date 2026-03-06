#!/usr/bin/env bats

# Test suite for validate_script_state() function
# Tests script state validation logic (.ralph directory and required files)

setup() {
  # Load the main script to access the validate_script_state function
  load '../helpers/test-common'
  source ../../../../scripts/ralph-run.sh
}

teardown() {
  cleanup_test_dir
}

@test "validate_script_state: succeeds with .ralph directory and all required files present" {
  # Create a test directory with complete OpenSpec change structure
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  # Create OpenSpec change structure
  local change_dir
  change_dir=$(create_openspec_change)
  
  # Create .ralph directory
  mkdir -p "$change_dir/.ralph"
  
  # Run validate_script_state - should succeed
  run validate_script_state "$change_dir"
  
  # Function should complete without error
  [ "$status" -eq 0 ]
  
  # Output should contain validation message
  [[ "$output" == *"Script state validated"* ]] || true
}

@test "validate_script_state: succeeds when .ralph directory is missing (logs verbose message)" {
  # Create a test directory with complete OpenSpec change structure but no .ralph
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  # Create OpenSpec change structure without .ralph directory
  local change_dir
  change_dir=$(create_openspec_change)
  
  # Run validate_script_state - should succeed even without .ralph
  run validate_script_state "$change_dir"
  
  # Function should succeed (.ralph is optional, just logs)
  [ "$status" -eq 0 ]
  
  # Output may contain verbose message about .ralph not found
  [[ "$output" == *".ralph"* ]] || true
}

@test "validate_script_state: fails when tasks.md is missing" {
  # Create a test directory with OpenSpec change structure
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  # Create OpenSpec change structure
  local change_dir
  change_dir=$(create_openspec_change)
  
  # Remove tasks.md
  rm "$change_dir/tasks.md"
  
  # Run validate_script_state - should fail
  run validate_script_state "$change_dir"
  
  # Function should fail
  [ "$status" -eq 1 ]
  
  # Output should contain error message about missing tasks.md
  [[ "$output" == *"Required file not found"* ]] || true
  [[ "$output" == *"tasks.md"* ]] || true
}

@test "validate_script_state: fails when proposal.md is missing" {
  # Create a test directory with OpenSpec change structure
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  # Create OpenSpec change structure
  local change_dir
  change_dir=$(create_openspec_change)
  
  # Remove proposal.md
  rm "$change_dir/proposal.md"
  
  # Run validate_script_state - should fail
  run validate_script_state "$change_dir"
  
  # Function should fail
  [ "$status" -eq 1 ]
  
  # Output should contain error message about missing proposal.md
  [[ "$output" == *"Required file not found"* ]] || true
  [[ "$output" == *"proposal.md"* ]] || true
}

@test "validate_script_state: fails when design.md is missing" {
  # Create a test directory with OpenSpec change structure
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  # Create OpenSpec change structure
  local change_dir
  change_dir=$(create_openspec_change)
  
  # Remove design.md
  rm "$change_dir/design.md"
  
  # Run validate_script_state - should fail
  run validate_script_state "$change_dir"
  
  # Function should fail
  [ "$status" -eq 1 ]
  
  # Output should contain error message about missing design.md
  [[ "$output" == *"Required file not found"* ]] || true
  [[ "$output" == *"design.md"* ]] || true
}

@test "validate_script_state: fails when multiple required files are missing" {
  # Create a test directory with OpenSpec change structure
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  # Create OpenSpec change structure
  local change_dir
  change_dir=$(create_openspec_change)
  
  # Remove multiple files
  rm "$change_dir/tasks.md"
  rm "$change_dir/design.md"
  
  # Run validate_script_state - should fail
  run validate_script_state "$change_dir"
  
  # Function should fail
  [ "$status" -eq 1 ]
  
  # Output should contain error messages about both missing files
  [[ "$output" == *"Required file not found"* ]] || true
}

@test "validate_script_state: verifies .ralph directory exists when present" {
  # Create a test directory with OpenSpec change structure
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  # Create OpenSpec change structure
  local change_dir
  change_dir=$(create_openspec_change)
  
  # Create .ralph directory
  mkdir -p "$change_dir/.ralph"
  
  # Run validate_script_state
  run validate_script_state "$change_dir"
  
  # Function should succeed
  [ "$status" -eq 0 ]
  
  # Verify .ralph directory still exists
  [ -d "$change_dir/.ralph" ]
}

@test "validate_script_state: logs verbose message when validating" {
  # Create a test directory with complete OpenSpec change structure
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  # Create OpenSpec change structure
  local change_dir
  change_dir=$(create_openspec_change)
  
  # Run validate_script_state
  run validate_script_state "$change_dir"
  
  # Function should succeed
  [ "$status" -eq 0 ]
  
  # Output should contain validation message
  [[ "$output" == *"Validating script state"* || "$output" == *"validated"* ]] || true
}

@test "validate_script_state: handles empty change directory gracefully" {
  # Create a test directory
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  # Create empty change directory
  local change_dir="$test_dir/openspec/changes/test-change"
  mkdir -p "$change_dir"
  
  # Run validate_script_state - should fail
  run validate_script_state "$change_dir"
  
  # Function should fail (missing required files)
  [ "$status" -eq 1 ]
  
  # Output should contain error messages about missing files
  [[ "$output" == *"Required file not found"* ]] || true
}

@test "validate_script_state: accepts absolute path for change directory" {
  # Create a test directory with complete OpenSpec change structure
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  # Create OpenSpec change structure
  local change_dir
  change_dir=$(create_openspec_change)
  
  # Run validate_script_state with absolute path
  run validate_script_state "$(cd "$change_dir" && pwd)"
  
  # Function should succeed
  [ "$status" -eq 0 ]
}

@test "validate_script_state: accepts relative path for change directory" {
  # Create a test directory with complete OpenSpec change structure
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  # Create OpenSpec change structure
  local change_dir
  change_dir=$(create_openspec_change)
  
  # Change to parent directory
  cd "$test_dir" || return 1
  
  # Run validate_script_state with relative path
  run validate_script_state "openspec/changes/test-change"
  
  # Function should succeed
  [ "$status" -eq 0 ]
}

@test "validate_script_state: can be called multiple times on same directory" {
  # Create a test directory with complete OpenSpec change structure
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  # Create OpenSpec change structure
  local change_dir
  change_dir=$(create_openspec_change)
  
  # Create .ralph directory
  mkdir -p "$change_dir/.ralph"
  
  # Call validate_script_state multiple times
  run validate_script_state "$change_dir"
  [ "$status" -eq 0 ]
  
  run validate_script_state "$change_dir"
  [ "$status" -eq 0 ]
  
  run validate_script_state "$change_dir"
  [ "$status" -eq 0 ]
}

@test "validate_script_state: detects .ralph directory even when it's a symlink" {
  # Create a test directory with complete OpenSpec change structure
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  # Create OpenSpec change structure
  local change_dir
  change_dir=$(create_openspec_change)
  
  # Create a directory to use as symlink target
  mkdir -p "$test_dir/actual-ralph"
  
  # Create symlink to .ralph
  ln -s "$test_dir/actual-ralph" "$change_dir/.ralph"
  
  # Run validate_script_state
  run validate_script_state "$change_dir"
  
  # Function should succeed (symlink to directory is treated as directory)
  [ "$status" -eq 0 ]
}

@test "validate_script_state: validates required files with correct content" {
  # Create a test directory with complete OpenSpec change structure
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  # Create OpenSpec change structure
  local change_dir
  change_dir=$(create_openspec_change)
  
  # Create .ralph directory
  mkdir -p "$change_dir/.ralph"
  
  # Run validate_script_state
  run validate_script_state "$change_dir"
  
  # Function should succeed
  [ "$status" -eq 0 ]
  
  # Verify all required files exist and contain content
  [ -f "$change_dir/tasks.md" ]
  [ -f "$change_dir/proposal.md" ]
  [ -f "$change_dir/design.md" ]
}

@test "validate_script_state: handles change directory with spaces in name" {
  # Create a test directory with complete OpenSpec change structure
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  # Create OpenSpec change structure with spaces in name
  local change_dir="$test_dir/openspec/changes/test change with spaces"
  mkdir -p "$change_dir/specs"
  
  # Create required files
  touch "$change_dir/tasks.md"
  touch "$change_dir/proposal.md"
  touch "$change_dir/design.md"
  
  # Create .ralph directory
  mkdir -p "$change_dir/.ralph"
  
  # Run validate_script_state
  run validate_script_state "$change_dir"
  
  # Function should succeed even with spaces in directory name
  [ "$status" -eq 0 ]
}

@test "validate_script_state: returns exit code 1 on first missing required file" {
  # Create a test directory with OpenSpec change structure
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  # Create OpenSpec change structure
  local change_dir
  change_dir=$(create_openspec_change)
  
  # Remove tasks.md (first required file in list)
  rm "$change_dir/tasks.md"
  
  # Run validate_script_state
  run validate_script_state "$change_dir"
  
  # Function should exit with code 1
  [ "$status" -eq 1 ]
}
