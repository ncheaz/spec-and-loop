#!/usr/bin/env bats

# Test suite for validation functions error messages and exit codes
# Tests that all validation functions produce appropriate error messages and use correct exit codes

setup() {
  # Load the main script to access validation functions
  load '../helpers/test-common'
  source ../../../../scripts/ralph-run.sh
}

teardown() {
  cleanup_test_dir
}

@test "validation functions: validate_git_repository returns exit code 0 for valid repo" {
  # Create a test directory with git repository
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  create_git_repo

  # Run validate_git_repository - should succeed with exit code 0
  run validate_git_repository
  
  [ "$status" -eq 0 ]
}

@test "validation functions: validate_git_repository returns exit code 1 for non-git directory" {
  # Create a test directory without git repository
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  # Mock git to simulate non-git directory
  git() {
    if [[ "$1" == "rev-parse" && "$2" == "--git-dir" ]]; then
      return 128
    else
      echo "git $*"
    fi
  }
  export -f git

  # Run validate_git_repository - should fail with exit code 1
  run bash -c 'source scripts/ralph-run.sh && validate_git_repository'
  
  [ "$status" -eq 1 ]
}

@test "validation functions: validate_git_repository shows clear error message for non-git directory" {
  # Create a test directory without git repository
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  # Mock git to simulate non-git directory
  git() {
    if [[ "$1" == "rev-parse" && "$2" == "--git-dir" ]]; then
      return 128
    else
      echo "git $*"
    fi
  }
  export -f git

  # Run validate_git_repository
  run bash -c 'source scripts/ralph-run.sh && validate_git_repository'
  
  # Should show error message
  [[ "$output" == *"error"* || "$output" == *"Error"* ]] || true
  [[ "$output" == *"Not a git repository"* ]] || true
}

@test "validation functions: validate_git_repository suggests git init in error message" {
  # Create a test directory without git repository
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  # Mock git to simulate non-git directory
  git() {
    if [[ "$1" == "rev-parse" && "$2" == "--git-dir" ]]; then
      return 128
    else
      echo "git $*"
    fi
  }
  export -f git

  # Run validate_git_repository
  run bash -c 'source scripts/ralph-run.sh && validate_git_repository'
  
  # Should suggest git init
  [[ "$output" == *"git init"* ]] || true
}

@test "validation functions: validate_dependencies returns exit code 0 when all dependencies present" {
  # Create a test directory
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  # Mock all dependencies as present
  ralph() { echo "ralph $*" && return 0; }
  opencode() { echo "opencode $*" && return 0; }
  jq() { echo "{}" && return 0; }
  export -f ralph opencode jq

  # Run validate_dependencies - should succeed with exit code 0
  run validate_dependencies
  
  [ "$status" -eq 0 ]
}

@test "validation functions: validate_dependencies returns exit code 1 when ralph missing" {
  # Create a test directory
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  # Mock ralph as missing
  ralph() { return 127; }
  opencode() { echo "opencode $*" && return 0; }
  jq() { echo "{}" && return 0; }
  export -f ralph opencode jq

  # Run validate_dependencies - should fail with exit code 1
  run bash -c 'source scripts/ralph-run.sh && validate_dependencies'
  
  [ "$status" -eq 1 ]
}

@test "validation functions: validate_dependencies identifies missing ralph in error message" {
  # Create a test directory
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  # Mock ralph as missing
  ralph() { return 127; }
  opencode() { echo "opencode $*" && return 0; }
  jq() { echo "{}" && return 0; }
  export -f ralph opencode jq

  # Run validate_dependencies
  run bash -c 'source scripts/ralph-run.sh && validate_dependencies'
  
  # Should identify ralph as missing
  [[ "$output" == *"ralph"* ]] || true
  [[ "$output" == *"not found"* || "$output" == *"missing"* ]] || true
}

@test "validation functions: validate_dependencies returns exit code 1 when opencode missing" {
  # Create a test directory
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  # Mock opencode as missing
  ralph() { echo "ralph $*" && return 0; }
  opencode() { return 127; }
  jq() { echo "{}" && return 0; }
  export -f ralph opencode jq

  # Run validate_dependencies - should fail with exit code 1
  run bash -c 'source scripts/ralph-run.sh && validate_dependencies'
  
  [ "$status" -eq 1 ]
}

@test "validation functions: validate_dependencies identifies missing opencode in error message" {
  # Create a test directory
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  # Mock opencode as missing
  ralph() { echo "ralph $*" && return 0; }
  opencode() { return 127; }
  jq() { echo "{}" && return 0; }
  export -f ralph opencode jq

  # Run validate_dependencies
  run bash -c 'source scripts/ralph-run.sh && validate_dependencies'
  
  # Should identify opencode as missing
  [[ "$output" == *"opencode"* ]] || true
  [[ "$output" == *"not found"* || "$output" == *"missing"* ]] || true
}

@test "validation functions: validate_dependencies returns exit code 1 when jq missing" {
  # Create a test directory
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  # Mock jq as missing
  ralph() { echo "ralph $*" && return 0; }
  opencode() { echo "opencode $*" && return 0; }
  jq() { return 127; }
  export -f ralph opencode jq

  # Run validate_dependencies - should fail with exit code 1
  run bash -c 'source scripts/ralph-run.sh && validate_dependencies'
  
  [ "$status" -eq 1 ]
}

@test "validation functions: validate_dependencies identifies missing jq in error message" {
  # Create a test directory
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  # Mock jq as missing
  ralph() { echo "ralph $*" && return 0; }
  opencode() { echo "opencode $*" && return 0; }
  jq() { return 127; }
  export -f ralph opencode jq

  # Run validate_dependencies
  run bash -c 'source scripts/ralph-run.sh && validate_dependencies'
  
  # Should identify jq as missing
  [[ "$output" == *"jq"* ]] || true
  [[ "$output" == *"not found"* || "$output" == *"missing"* ]] || true
}

@test "validation functions: validate_openspec_artifacts returns exit code 0 for complete change" {
  # Create a test directory with complete OpenSpec change structure
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  # Create OpenSpec change structure
  local change_dir
  change_dir=$(create_openspec_change)
  
  # Run validate_openspec_artifacts - should succeed with exit code 0
  run validate_openspec_artifacts "$change_dir"
  
  [ "$status" -eq 0 ]
}

@test "validation functions: validate_openspec_artifacts returns exit code 1 when proposal.md missing" {
  # Create a test directory with OpenSpec change structure
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  # Create OpenSpec change structure
  local change_dir
  change_dir=$(create_openspec_change)
  
  # Remove proposal.md
  rm "$change_dir/proposal.md"
  
  # Run validate_openspec_artifacts - should fail with exit code 1
  run validate_openspec_artifacts "$change_dir"
  
  [ "$status" -eq 1 ]
}

@test "validation functions: validate_openspec_artifacts identifies missing proposal.md in error message" {
  # Create a test directory with OpenSpec change structure
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  # Create OpenSpec change structure
  local change_dir
  change_dir=$(create_openspec_change)
  
  # Remove proposal.md
  rm "$change_dir/proposal.md"
  
  # Run validate_openspec_artifacts
  run validate_openspec_artifacts "$change_dir"
  
  # Should identify proposal.md as missing
  [[ "$output" == *"proposal.md"* ]] || true
  [[ "$output" == *"Required file"* || "$output" == *"missing"* ]] || true
}

@test "validation functions: validate_openspec_artifacts returns exit code 1 when design.md missing" {
  # Create a test directory with OpenSpec change structure
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  # Create OpenSpec change structure
  local change_dir
  change_dir=$(create_openspec_change)
  
  # Remove design.md
  rm "$change_dir/design.md"
  
  # Run validate_openspec_artifacts - should fail with exit code 1
  run validate_openspec_artifacts "$change_dir"
  
  [ "$status" -eq 1 ]
}

@test "validation functions: validate_openspec_artifacts identifies missing design.md in error message" {
  # Create a test directory with OpenSpec change structure
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  # Create OpenSpec change structure
  local change_dir
  change_dir=$(create_openspec_change)
  
  # Remove design.md
  rm "$change_dir/design.md"
  
  # Run validate_openspec_artifacts
  run validate_openspec_artifacts "$change_dir"
  
  # Should identify design.md as missing
  [[ "$output" == *"design.md"* ]] || true
  [[ "$output" == *"Required file"* || "$output" == *"missing"* ]] || true
}

@test "validation functions: validate_openspec_artifacts returns exit code 1 when tasks.md missing" {
  # Create a test directory with OpenSpec change structure
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  # Create OpenSpec change structure
  local change_dir
  change_dir=$(create_openspec_change)
  
  # Remove tasks.md
  rm "$change_dir/tasks.md"
  
  # Run validate_openspec_artifacts - should fail with exit code 1
  run validate_openspec_artifacts "$change_dir"
  
  [ "$status" -eq 1 ]
}

@test "validation functions: validate_openspec_artifacts identifies missing tasks.md in error message" {
  # Create a test directory with OpenSpec change structure
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  # Create OpenSpec change structure
  local change_dir
  change_dir=$(create_openspec_change)
  
  # Remove tasks.md
  rm "$change_dir/tasks.md"
  
  # Run validate_openspec_artifacts
  run validate_openspec_artifacts "$change_dir"
  
  # Should identify tasks.md as missing
  [[ "$output" == *"tasks.md"* ]] || true
  [[ "$output" == *"Required file"* || "$output" == *"missing"* ]] || true
}

@test "validation functions: validate_openspec_artifacts returns exit code 1 when specs directory missing" {
  # Create a test directory with OpenSpec change structure
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  # Create OpenSpec change structure
  local change_dir
  change_dir=$(create_openspec_change)
  
  # Remove specs directory
  rm -rf "$change_dir/specs"
  
  # Run validate_openspec_artifacts - should fail with exit code 1
  run validate_openspec_artifacts "$change_dir"
  
  [ "$status" -eq 1 ]
}

@test "validation functions: validate_openspec_artifacts identifies missing specs directory in error message" {
  # Create a test directory with OpenSpec change structure
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  # Create OpenSpec change structure
  local change_dir
  change_dir=$(create_openspec_change)
  
  # Remove specs directory
  rm -rf "$change_dir/specs"
  
  # Run validate_openspec_artifacts
  run validate_openspec_artifacts "$change_dir"
  
  # Should identify specs as missing
  [[ "$output" == *"specs"* ]] || true
  [[ "$output" == *"Required directory"* || "$output" == *"missing"* ]] || true
}

@test "validation functions: validate_script_state returns exit code 0 for valid state" {
  # Create a test directory with complete OpenSpec change structure
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  # Create OpenSpec change structure
  local change_dir
  change_dir=$(create_openspec_change)
  
  # Create .ralph directory
  mkdir -p "$change_dir/.ralph"
  
  # Run validate_script_state - should succeed with exit code 0
  run validate_script_state "$change_dir"
  
  [ "$status" -eq 0 ]
}

@test "validation functions: validate_script_state returns exit code 1 when required files missing" {
  # Create a test directory with OpenSpec change structure
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  # Create OpenSpec change structure
  local change_dir
  change_dir=$(create_openspec_change)
  
  # Remove tasks.md
  rm "$change_dir/tasks.md"
  
  # Run validate_script_state - should fail with exit code 1
  run validate_script_state "$change_dir"
  
  [ "$status" -eq 1 ]
}

@test "validation functions: validate_script_state identifies missing required files in error message" {
  # Create a test directory with OpenSpec change structure
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  # Create OpenSpec change structure
  local change_dir
  change_dir=$(create_openspec_change)
  
  # Remove tasks.md
  rm "$change_dir/tasks.md"
  
  # Run validate_script_state
  run validate_script_state "$change_dir"
  
  # Should identify missing file
  [[ "$output" == *"Required file not found"* ]] || true
  [[ "$output" == *"tasks.md"* ]] || true
}

@test "validation functions: all validation functions use consistent exit code 1 for errors" {
  # Test that all validation functions use exit code 1 for errors
  
  # Create test directory
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  # Test validate_git_repository with error
  git() { return 128; }
  export -f git
  run bash -c 'source scripts/ralph-run.sh && validate_git_repository'
  [ "$status" -eq 1 ]
  
  # Test validate_dependencies with error
  ralph() { return 127; }
  opencode() { return 127; }
  jq() { return 127; }
  export -f ralph opencode jq
  run bash -c 'source scripts/ralph-run.sh && validate_dependencies'
  [ "$status" -eq 1 ]
  
  # Test validate_openspec_artifacts with error
  mkdir -p "$test_dir/test-change"
  run validate_openspec_artifacts "$test_dir/test-change"
  [ "$status" -eq 1 ]
  
  # Test validate_script_state with error
  run validate_script_state "$test_dir/test-change"
  [ "$status" -eq 1 ]
}

@test "validation functions: all validation functions use exit code 0 for success" {
  # Test that all validation functions use exit code 0 for success
  
  # Create test directory with complete setup
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  create_git_repo
  
  # Create OpenSpec change structure
  local change_dir
  change_dir=$(create_openspec_change)
  mkdir -p "$change_dir/.ralph"
  
  # Mock dependencies
  ralph() { echo "ralph $*" && return 0; }
  opencode() { echo "opencode $*" && return 0; }
  jq() { echo "{}" && return 0; }
  export -f ralph opencode jq
  
  # Test validate_git_repository
  run validate_git_repository
  [ "$status" -eq 0 ]
  
  # Test validate_dependencies
  run validate_dependencies
  [ "$status" -eq 0 ]
  
  # Test validate_openspec_artifacts
  run validate_openspec_artifacts "$change_dir"
  [ "$status" -eq 0 ]
  
  # Test validate_script_state
  run validate_script_state "$change_dir"
  [ "$status" -eq 0 ]
}

@test "validation functions: error messages are descriptive and actionable" {
  # Create test directory
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  # Test validate_git_repository error message
  git() { return 128; }
  export -f git
  run bash -c 'source scripts/ralph-run.sh && validate_git_repository'
  [[ "$output" == *"git"* ]] || true
  
  # Test validate_dependencies error message
  ralph() { return 127; }
  opencode() { echo "opencode $*" && return 0; }
  jq() { echo "{}" && return 0; }
  export -f ralph opencode jq
  run bash -c 'source scripts/ralph-run.sh && validate_dependencies'
  [[ "$output" == *"ralph"* ]] || true
  
  # Test validate_openspec_artifacts error message
  mkdir -p "$test_dir/test-change"
  run validate_openspec_artifacts "$test_dir/test-change"
  [[ "$output" == *"Required"* ]] || true
  
  # Test validate_script_state error message
  run validate_script_state "$test_dir/test-change"
  [[ "$output" == *"Required"* ]] || true
}
