#!/usr/bin/env bats

# Test suite for validate_dependencies() function
# Tests CLI dependency validation logic

setup() {
  # Load the main script to access the validate_dependencies function
  load '../../helpers/test-common'
  source scripts/ralph-run.sh
}

teardown() {
  cleanup_test_dir
}

@test "validate_dependencies: succeeds when all dependencies are present" {
  # Create a test directory
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1

  # Mock all required CLIs as available
  command() {
    if [[ "$1" == "-v" ]]; then
      # Simulate that commands are found
      shift
      if [[ "$1" == "ralph" || "$1" == "opencode" ]]; then
        return 0
      fi
    fi
    command command "$@"
  }
  export -f command

  # Run validate_dependencies - should succeed without exiting
  run validate_dependencies
  
  # Function should complete without error
  [ "$status" -eq 0 ]
  
  # Output should contain validation success message
  [[ "$output" == *"All dependencies validated"* ]] || true
}

@test "validate_dependencies: fails when ralph CLI is missing" {
  # Create a test directory
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1

  # Mock command -v to simulate ralph not found
  command() {
    if [[ "$1" == "-v" ]]; then
      shift
      if [[ "$1" == "ralph" ]]; then
        return 1  # ralph not found
      elif [[ "$1" == "opencode" ]]; then
        return 0  # opencode found
      fi
    fi
    command command "$@"
  }
  export -f command

  # Run validate_dependencies - should exit with error
  run bash -c 'source scripts/ralph-run.sh && validate_dependencies'
  
  # Function should exit with code 1
  [ "$status" -eq 1 ]
  
  # Output should contain error message about missing ralph
  [[ "$output" == *"ralph CLI not found"* ]] || true
}

@test "validate_dependencies: fails when opencode CLI is missing" {
  # Create a test directory
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1

  # Mock command -v to simulate opencode not found
  command() {
    if [[ "$1" == "-v" ]]; then
      shift
      if [[ "$1" == "ralph" ]]; then
        return 0  # ralph found
      elif [[ "$1" == "opencode" ]]; then
        return 1  # opencode not found
      fi
    fi
    command command "$@"
  }
  export -f command

  # Run validate_dependencies - should exit with error
  run bash -c 'source scripts/ralph-run.sh && validate_dependencies'
  
  # Function should exit with code 1
  [ "$status" -eq 1 ]
  
  # Output should contain error message about missing opencode
  [[ "$output" == *"opencode CLI not found"* ]] || true
}

@test "validate_dependencies: shows helpful error message for missing ralph with installation hint" {
  # Create a test directory
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1

  # Mock command -v to simulate ralph not found
  command() {
    if [[ "$1" == "-v" ]]; then
      shift
      if [[ "$1" == "ralph" ]]; then
        return 1
      elif [[ "$1" == "opencode" ]]; then
        return 0
      fi
    fi
    command command "$@"
  }
  export -f command

  # Run validate_dependencies
  run bash -c 'source scripts/ralph-run.sh && validate_dependencies'
  
  # Should suggest installing ralph
  [[ "$output" == *"npm install -g"* ]] || true
  [[ "$output" == *"@th0rgal/ralph-wiggum"* ]] || true
}

@test "validate_dependencies: shows helpful error message for missing opencode with installation hint" {
  # Create a test directory
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1

  # Mock command -v to simulate opencode not found
  command() {
    if [[ "$1" == "-v" ]]; then
      shift
      if [[ "$1" == "ralph" ]]; then
        return 0
      elif [[ "$1" == "opencode" ]]; then
        return 1
      fi
    fi
    command command "$@"
  }
  export -f command

  # Run validate_dependencies
  run bash -c 'source scripts/ralph-run.sh && validate_dependencies'
  
  # Should suggest installing opencode
  [[ "$output" == *"npm install -g"* ]] || true
  [[ "$output" == *"opencode"* ]] || true
}

@test "validate_dependencies: uses command -v to check for ralph" {
  # Create a test directory
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1

  # Track command calls
  local command_called=false
  local checked_commands=()

  command() {
    if [[ "$1" == "-v" ]]; then
      command_called=true
      shift
      checked_commands+=("$1")
      if [[ "$1" == "ralph" || "$1" == "opencode" ]]; then
        return 0
      fi
    fi
    command command "$@"
  }
  export -f command

  # Run validate_dependencies
  run validate_dependencies
  
  # Verify command -v was called
  [ "$command_called" = true ]
  
  # Verify ralph was checked
  [[ " ${checked_commands[*]} " == *" ralph "* ]] || true
}

@test "validate_dependencies: uses command -v to check for opencode" {
  # Create a test directory
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1

  # Track command calls
  local command_called=false
  local checked_commands=()

  command() {
    if [[ "$1" == "-v" ]]; then
      command_called=true
      shift
      checked_commands+=("$1")
      if [[ "$1" == "ralph" || "$1" == "opencode" ]]; then
        return 0
      fi
    fi
    command command "$@"
  }
  export -f command

  # Run validate_dependencies
  run validate_dependencies
  
  # Verify command -v was called
  [ "$command_called" = true ]
  
  # Verify opencode was checked
  [[ " ${checked_commands[*]} " == *" opencode "* ]] || true
}

@test "validate_dependencies: logs verbose message when finding ralph" {
  # Create a test directory
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1

  # Mock all CLIs as available
  command() {
    if [[ "$1" == "-v" ]]; then
      shift
      if [[ "$1" == "ralph" || "$1" == "opencode" ]]; then
        return 0
      fi
    fi
    command command "$@"
  }
  export -f command

  # Run validate_dependencies
  run validate_dependencies
  
  # Should log that ralph was found
  [[ "$output" == *"Found: ralph"* ]] || true
}

@test "validate_dependencies: logs verbose message when finding opencode" {
  # Create a test directory
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1

  # Mock all CLIs as available
  command() {
    if [[ "$1" == "-v" ]]; then
      shift
      if [[ "$1" == "ralph" || "$1" == "opencode" ]]; then
        return 0
      fi
    fi
    command command "$@"
  }
  export -f command

  # Run validate_dependencies
  run validate_dependencies
  
  # Should log that opencode was found
  [[ "$output" == *"Found: opencode"* ]] || true
}

@test "validate_dependencies: can be called multiple times without errors" {
  # Create a test directory
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1

  # Mock all CLIs as available
  command() {
    if [[ "$1" == "-v" ]]; then
      shift
      if [[ "$1" == "ralph" || "$1" == "opencode" ]]; then
        return 0
      fi
    fi
    command command "$@"
  }
  export -f command

  # Call validate_dependencies multiple times
  run validate_dependencies
  [ "$status" -eq 0 ]
  
  run validate_dependencies
  [ "$status" -eq 0 ]
  
  run validate_dependencies
  [ "$status" -eq 0 ]
}

@test "validate_dependencies: validates ralph before opencode" {
  # Create a test directory
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1

  # Track command calls in order
  local checked_commands=()

  command() {
    if [[ "$1" == "-v" ]]; then
      shift
      checked_commands+=("$1")
      return 0
    fi
    command command "$@"
  }
  export -f command

  # Run validate_dependencies
  run validate_dependencies
  
  # Verify ralph is checked before opencode
  [ "${checked_commands[0]}" = "ralph" ]
  [ "${checked_commands[1]}" = "opencode" ]
}

@test "validate_dependencies: logs verbose validation message at start" {
  # Create a test directory
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1

  # Mock all CLIs as available
  command() {
    if [[ "$1" == "-v" ]]; then
      shift
      if [[ "$1" == "ralph" || "$1" == "opencode" ]]; then
        return 0
      fi
    fi
    command command "$@"
  }
  export -f command

  # Run validate_dependencies
  run validate_dependencies
  
  # Should log validation start message (may be in verbose mode)
  [[ "$output" == *"Validating dependencies"* ]] || true
}
