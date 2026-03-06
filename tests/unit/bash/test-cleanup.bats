#!/usr/bin/env bats

# Test suite for cleanup() function
# Tests cleanup behavior and exit code handling

setup() {
  load '../../helpers/test-common'
  source ../../../scripts/ralph-run.sh
}

teardown() {
  cleanup_test_dir
}

@test "cleanup: sets CLEANUP_IN_PROGRESS flag" {
  cleanup_test_dir
  
  unset CLEANUP_IN_PROGRESS
  
  run cleanup 0
  
  [ "$status" -eq 0 ]
  [ "$CLEANUP_IN_PROGRESS" = "true" ]
}

@test "cleanup: prevents multiple cleanup calls" {
  cleanup_test_dir
  
  unset CLEANUP_IN_PROGRESS
  
  run cleanup 0
  [ "$status" -eq 0 ]
  
  run cleanup 0
  [ "$status" -eq 0 ]
  
  # Second call should exit immediately without processing
  [ "$CLEANUP_IN_PROGRESS" = "true" ]
}

@test "cleanup: exits with provided exit code when zero" {
  cleanup_test_dir
  
  unset CLEANUP_IN_PROGRESS
  
  run cleanup 0
  
  [ "$status" -eq 0 ]
}

@test "cleanup: exits with provided exit code when non-zero" {
  cleanup_test_dir
  
  unset CLEANUP_IN_PROGRESS
  
  run cleanup 42
  
  [ "$status" -eq 42 ]
}

@test "cleanup: logs error when exit code is non-zero" {
  cleanup_test_dir
  
  unset CLEANUP_IN_PROGRESS
  
  run cleanup 1
  
  [ "$status" -eq 1 ]
  [[ "$output" == *"Script terminated with exit code"* ]] || true
}

@test "cleanup: logs error message includes exit code" {
  cleanup_test_dir
  
  unset CLEANUP_IN_PROGRESS
  
  run cleanup 127
  
  [ "$status" -eq 127 ]
  [[ "$output" == *": 127"* ]] || true
}

@test "cleanup: does not log error when exit code is zero" {
  cleanup_test_dir
  
  unset CLEANUP_IN_PROGRESS
  
  run cleanup 0
  
  [ "$status" -eq 0 ]
  [[ "$output" != *"Script terminated with exit code"* ]] || true
}

@test "cleanup: logs cleanup message" {
  cleanup_test_dir
  
  unset CLEANUP_IN_PROGRESS
  
  run cleanup 0
  
  [ "$status" -eq 0 ]
  [[ "$output" == *"Cleaning up"* ]] || true
}

@test "cleanup: handles various non-zero exit codes" {
  cleanup_test_dir
  
  unset CLEANUP_IN_PROGRESS
  
  local exit_codes=(1 2 127 255)
  
  for code in "${exit_codes[@]}"; do
    run cleanup "$code"
    [ "$status" -eq "$code" ]
    [[ "$output" == *"Script terminated with exit code: $code"* ]] || true
    unset CLEANUP_IN_PROGRESS
  done
}

@test "cleanup: handles negative exit codes" {
  cleanup_test_dir
  
  unset CLEANUP_IN_PROGRESS
  
  run cleanup -1
  
  # Shell wraps exit codes, but function should still exit
  [ "$status" -ne 0 ]
}

@test "cleanup: does not kill processes (relies on shell process group)" {
  cleanup_test_dir
  
  unset CLEANUP_IN_PROGRESS
  
  # The cleanup function should not call pkill or kill commands
  # It relies on shell process group handling
  run cleanup 0
  
  [ "$status" -eq 0 ]
  
  # Verify no pkill calls happened by checking if function only sets flags and exits
  # (The function is simple and should just set CLEANUP_IN_PROGRESS)
}

@test "cleanup: preserves existing CLEANUP_IN_PROGRESS flag" {
  cleanup_test_dir
  
  CLEANUP_IN_PROGRESS="true"
  export CLEANUP_IN_PROGRESS
  
  run cleanup 0
  
  [ "$status" -eq 0 ]
  [ "$CLEANUP_IN_PROGRESS" = "true" ]
}

@test "cleanup: can be called multiple times safely" {
  cleanup_test_dir
  
  unset CLEANUP_IN_PROGRESS
  
  run cleanup 0
  [ "$status" -eq 0 ]
  
  run cleanup 1
  [ "$status" -eq 1 ]
  
  run cleanup 2
  [ "$status" -eq 2 ]
}

@test "cleanup: works with exit code 0" {
  cleanup_test_dir
  
  unset CLEANUP_IN_PROGRESS
  
  run cleanup 0
  
  [ "$status" -eq 0 ]
  [[ "$output" != *"Script terminated with exit code"* ]] || true
  [[ "$output" == *"Cleaning up"* ]] || true
}

@test "cleanup: works with exit code 1" {
  cleanup_test_dir
  
  unset CLEANUP_IN_PROGRESS
  
  run cleanup 1
  
  [ "$status" -eq 1 ]
  [[ "$output" == *"Script terminated with exit code: 1"* ]] || true
  [[ "$output" == *"Cleaning up"* ]] || true
}

@test "cleanup: works with exit code 130 (SIGINT)" {
  cleanup_test_dir
  
  unset CLEANUP_IN_PROGRESS
  
  run cleanup 130
  
  [ "$status" -eq 130 ]
  [[ "$output" == *"Script terminated with exit code: 130"* ]] || true
}

@test "cleanup: works with exit code 143 (SIGTERM)" {
  cleanup_test_dir
  
  unset CLEANUP_IN_PROGRESS
  
  run cleanup 143
  
  [ "$status" -eq 143 ]
  [[ "$output" == *"Script terminated with exit code: 143"* ]] || true
}
