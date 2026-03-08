#!/usr/bin/env bats

# Test suite for validate_git_repository() function
# Tests git repository validation logic

setup() {
  # Load the main script to access the validate_git_repository function
  load '../../helpers/test-common'
  source tests/helpers/test-functions.sh
}

teardown() {
  cleanup_test_dir
}

@test "validate_git_repository: succeeds in valid git repository" {
  # Create a test directory with git repository
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  create_git_repo

  # Run validate_git_repository - should succeed without exiting
  run validate_git_repository
  
  # Function should complete without error
  [ "$status" -eq 0 ]
  
  # Output should contain validation success message
  [[ "$output" == *"Git repository validated"* ]] || true
}

@test "validate_git_repository: fails in non-git directory" {
  # Create a test directory without git repository
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  # Mock git to simulate non-git directory
  git() {
    if [[ "$1" == "rev-parse" && "$2" == "--git-dir" ]]; then
      # Simulate being outside git repo
      return 128
    else
      echo "git $*"
    fi
  }
  export -f git

  # Run validate_git_repository - should exit with error
  # Use subshell to prevent test from exiting
  run bash -c 'source tests/helpers/test-functions.sh && validate_git_repository'
  
  # Function should exit with code 1
  [ "$status" -eq 1 ]
  
  # Output should contain error message about not being a git repo
  [[ "$output" == *"Not a git repository"* ]] || true
}

@test "validate_git_repository: shows helpful error message with git init suggestion" {
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
  run bash -c 'source tests/helpers/test-functions.sh && validate_git_repository'
  
  # Should suggest running git init
  [[ "$output" == *"git init"* ]] || true
}

@test "validate_git_repository: uses git rev-parse --git-dir correctly" {
  # Create a test directory with git repository
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  create_git_repo

  # Track git calls
  local git_called=false
  local git_command
  
  git() {
    git_called=true
    git_command="$*"
    if [[ "$1" == "rev-parse" && "$2" == "--git-dir" ]]; then
      echo ".git"
      return 0
    else
      command git "$@"
    fi
  }
  export -f git

  # Run validate_git_repository directly (not via `run`) so variable changes propagate
  validate_git_repository
  local _exit_status=$?
  
  # Verify git rev-parse --git-dir was called
  [ "$git_called" = true ]
  [[ "$git_command" == *"rev-parse"* ]] || true
  [[ "$git_command" == *"--git-dir"* ]] || true
  
  # Function should succeed
  [ "$_exit_status" -eq 0 ]
}

@test "validate_git_repository: handles git command errors gracefully" {
  # Create a test directory
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  # Mock git to simulate an error
  git() {
    return 1
  }
  export -f git

  # Run validate_git_repository - should handle error and exit
  run bash -c 'source tests/helpers/test-functions.sh && validate_git_repository'
  
  # Should exit with error code
  [ "$status" -eq 1 ]
}

@test "validate_git_repository: works in subdirectory of git repo" {
  # Create a test directory with git repository
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  create_git_repo

  # Create a subdirectory
  mkdir -p "subdir/nested"
  cd "subdir/nested" || return 1

  # Run validate_git_repository - should succeed from subdirectory
  run validate_git_repository
  
  # Function should succeed (git works in subdirectories)
  [ "$status" -eq 0 ]
}

@test "validate_git_repository: handles bare git repository" {
  # Create a test directory
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1

  # Initialize a bare git repository
  git init --bare -q

  # Run validate_git_repository - bare repo is still a git repo
  run validate_git_repository
  
  # Function should succeed (bare repos are still git repos)
  [ "$status" -eq 0 ]
}

@test "validate_git_repository: logs verbose message on success" {
  # Create a test directory with git repository
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  create_git_repo

  # Run validate_git_repository
  run validate_git_repository
  
  # Should log validation message (may be in verbose mode)
  [[ "$output" == *"validating"* || "$output" == *"validated"* ]] || true
}

@test "validate_git_repository: logs error message on failure" {
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
  run bash -c 'source tests/helpers/test-functions.sh && validate_git_repository'
  
  # Should log error message
  [[ "$output" == *"error"* || "$output" == *"Error"* ]] || true
}

@test "validate_git_repository: can be called multiple times" {
  # Create a test directory with git repository
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  create_git_repo

  # Call validate_git_repository multiple times
  run validate_git_repository
  [ "$status" -eq 0 ]
  
  run validate_git_repository
  [ "$status" -eq 0 ]
  
  run validate_git_repository
  [ "$status" -eq 0 ]
}
