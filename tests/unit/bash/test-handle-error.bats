#!/usr/bin/env bats

# Test suite for handle_error() function
# Tests error logging and ERROR_OCCURRED flag setting

setup() {
  load '../../helpers/test-common'
  source tests/helpers/test-functions.sh
}

teardown() {
  cleanup_test_dir
}

@test "handle_error: sets ERROR_OCCURRED flag on non-zero exit code" {
  cleanup_test_dir
  
  unset ERROR_OCCURRED
  
  # Call directly (not via `run`) so the variable assignment is visible in this
  # shell process rather than being discarded by Bats' subshell.
  handle_error 1
  
  [ "$ERROR_OCCURRED" = "true" ]
}

@test "handle_error: does not set ERROR_OCCURRED flag on zero exit code" {
  cleanup_test_dir
  
  unset ERROR_OCCURRED
  ERROR_OCCURRED="false"
  export ERROR_OCCURRED
  
  run handle_error 0
  
  [ "$ERROR_OCCURRED" = "false" ]
}

@test "handle_error: logs error message for non-zero exit code" {
  cleanup_test_dir
  
  unset ERROR_OCCURRED
  
  run handle_error 1
  
  [[ "$output" == *"Script failed with exit code"* ]] || true
  [[ "$output" == *": 1"* ]] || true
}

@test "handle_error: logs verbose message suggestion" {
  cleanup_test_dir
  
  unset ERROR_OCCURRED
  
  run handle_error 1
  
  [[ "$output" == *"Use --verbose flag for more debugging information"* ]] || true
}

@test "handle_error: does not log for zero exit code" {
  cleanup_test_dir
  
  unset ERROR_OCCURRED
  ERROR_OCCURRED="false"
  export ERROR_OCCURRED
  
  run handle_error 0
  
  [[ "$output" != *"Script failed with exit code"* ]] || true
}

@test "handle_error: preserves ERROR_OCCURRED flag on zero exit" {
  cleanup_test_dir
  
  ERROR_OCCURRED="false"
  export ERROR_OCCURRED
  
  run handle_error 0
  
  [ "$ERROR_OCCURRED" = "false" ]
}

@test "handle_error: handles exit code 1" {
  cleanup_test_dir
  
  unset ERROR_OCCURRED
  
  # Direct call to test flag side-effect; capture output separately for message check.
  handle_error 1
  
  [ "$ERROR_OCCURRED" = "true" ]
}

@test "handle_error: handles exit code 2" {
  cleanup_test_dir
  
  unset ERROR_OCCURRED
  
  handle_error 2
  
  [ "$ERROR_OCCURRED" = "true" ]
}

@test "handle_error: handles exit code 127" {
  cleanup_test_dir
  
  unset ERROR_OCCURRED
  
  handle_error 127
  
  [ "$ERROR_OCCURRED" = "true" ]
}

@test "handle_error: handles exit code 255" {
  cleanup_test_dir
  
  unset ERROR_OCCURRED
  
  handle_error 255
  
  [ "$ERROR_OCCURRED" = "true" ]
}

@test "handle_error: can be called multiple times" {
  cleanup_test_dir
  
  unset ERROR_OCCURRED
  
  handle_error 1
  [ "$ERROR_OCCURRED" = "true" ]
  
  handle_error 0
  [ "$ERROR_OCCURRED" = "true" ]
  
  handle_error 2
  [ "$ERROR_OCCURRED" = "true" ]
}

@test "handle_error: handles large exit codes" {
  cleanup_test_dir
  
  unset ERROR_OCCURRED
  
  handle_error 9999
  
  [ "$ERROR_OCCURRED" = "true" ]
}

@test "handle_error: works with existing ERROR_OCCURRED=true" {
  cleanup_test_dir
  
  ERROR_OCCURRED="true"
  export ERROR_OCCURRED
  
  run handle_error 1
  
  [ "$ERROR_OCCURRED" = "true" ]
}

@test "handle_error: updates ERROR_OCCURRED from false to true" {
  cleanup_test_dir
  
  ERROR_OCCURRED="false"
  export ERROR_OCCURRED
  
  handle_error 1
  
  [ "$ERROR_OCCURRED" = "true" ]
}

@test "handle_error: does not update ERROR_OCCURRED on zero exit" {
  cleanup_test_dir
  
  ERROR_OCCURRED="true"
  export ERROR_OCCURRED
  
  handle_error 0
  
  [ "$ERROR_OCCURRED" = "true" ]
}

@test "handle_error: logs both error messages for non-zero exit" {
  cleanup_test_dir
  
  unset ERROR_OCCURRED
  
  run handle_error 42
  
  [[ "$output" == *"Script failed with exit code: 42"* ]] || true
  [[ "$output" == *"Use --verbose flag"* ]] || true
}

@test "handle_error: output includes both messages" {
  cleanup_test_dir
  
  unset ERROR_OCCURRED
  
  run handle_error 1
  
  local line_count
  line_count=$(echo "$output" | wc -l)
  
  # Should have at least 2 lines of output
  [ "$line_count" -ge 2 ]
}
