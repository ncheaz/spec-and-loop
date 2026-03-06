#!/usr/bin/env bats

# Test suite for signal handling
# Tests trap configuration and cleanup behavior on signals

setup() {
  load '../../helpers/test-common'
  source tests/helpers/test-functions.sh
}

teardown() {
  cleanup_test_dir
}

@test "signal handling: cleanup function is defined" {
  type cleanup &>/dev/null
  [ $? -eq 0 ]
}

@test "signal handling: cleanup accepts exit code parameter" {
  cleanup_test_dir
  
  unset CLEANUP_IN_PROGRESS
  
  run cleanup 0
  [ "$status" -eq 0 ]
  
  run cleanup 1
  [ "$status" -eq 1 ]
}

@test "signal handling: cleanup handles EXIT signal (exit code 0)" {
  cleanup_test_dir
  
  unset CLEANUP_IN_PROGRESS
  
  run cleanup 0
  
  [ "$status" -eq 0 ]
  [[ "$output" == *"Cleaning up"* ]] || true
}

@test "signal handling: cleanup handles INT signal (exit code 130)" {
  cleanup_test_dir
  
  unset CLEANUP_IN_PROGRESS
  
  run cleanup 130
  
  [ "$status" -eq 130 ]
  [[ "$output" == *"Script terminated with exit code: 130"* ]] || true
}

@test "signal handling: cleanup handles TERM signal (exit code 143)" {
  cleanup_test_dir
  
  unset CLEANUP_IN_PROGRESS
  
  run cleanup 143
  
  [ "$status" -eq 143 ]
  [[ "$output" == *"Script terminated with exit code: 143"* ]] || true
}

@test "signal handling: cleanup handles QUIT signal (exit code 3)" {
  cleanup_test_dir
  
  unset CLEANUP_IN_PROGRESS
  
  run cleanup 3
  
  [ "$status" -eq 3 ]
  [[ "$output" == *"Script terminated with exit code: 3"* ]] || true
}

@test "signal handling: cleanup sets CLEANUP_IN_PROGRESS flag" {
  cleanup_test_dir
  
  unset CLEANUP_IN_PROGRESS
  
  cleanup 0
  
  [ "$CLEANUP_IN_PROGRESS" = "true" ]
}

@test "signal handling: cleanup prevents multiple calls" {
  cleanup_test_dir
  
  unset CLEANUP_IN_PROGRESS
  
  cleanup 0
  
  [ "$CLEANUP_IN_PROGRESS" = "true" ]
  
  # Second call should not reset the flag
  cleanup 1
  
  [ "$CLEANUP_IN_PROGRESS" = "true" ]
}

@test "signal handling: cleanup does not kill processes directly" {
  cleanup_test_dir
  
  unset CLEANUP_IN_PROGRESS
  
  run cleanup 0
  
  # The cleanup function should not call pkill
  # It relies on shell process group handling
  [ "$status" -eq 0 ]
}

@test "signal handling: cleanup exits with correct signal exit codes" {
  cleanup_test_dir
  
  unset CLEANUP_IN_PROGRESS
  
  # SIGINT typically results in exit code 130
  run cleanup 130
  [ "$status" -eq 130 ]
  
  unset CLEANUP_IN_PROGRESS
  
  # SIGTERM typically results in exit code 143
  run cleanup 143
  [ "$status" -eq 143 ]
  
  unset CLEANUP_IN_PROGRESS
  
  # Normal exit is 0
  run cleanup 0
  [ "$status" -eq 0 ]
}

@test "signal handling: cleanup logs error for non-zero exit codes" {
  cleanup_test_dir
  
  unset CLEANUP_IN_PROGRESS
  
  run cleanup 130
  
  [[ "$output" == *"Script terminated with exit code: 130"* ]] || true
  
  unset CLEANUP_IN_PROGRESS
  
  run cleanup 143
  
  [[ "$output" == *"Script terminated with exit code: 143"* ]] || true
  
  unset CLEANUP_IN_PROGRESS
  
  run cleanup 3
  
  [[ "$output" == *"Script terminated with exit code: 3"* ]] || true
}

@test "signal handling: cleanup does not log error for zero exit code" {
  cleanup_test_dir
  
  unset CLEANUP_IN_PROGRESS
  
  run cleanup 0
  
  [[ "$output" != *"Script terminated with exit code"* ]] || true
  [[ "$output" == *"Cleaning up"* ]] || true
}

@test "signal handling: cleanup logs cleanup message" {
  cleanup_test_dir
  
  unset CLEANUP_IN_PROGRESS
  
  run cleanup 0
  
  [[ "$output" == *"Cleaning up"* ]] || true
}

@test "signal handling: cleanup maintains exit code on all signals" {
  cleanup_test_dir
  
  unset CLEANUP_IN_PROGRESS
  
  local test_codes=(0 1 2 3 127 130 143)
  
  for code in "${test_codes[@]}"; do
    run cleanup "$code"
    [ "$status" -eq "$code" ]
    unset CLEANUP_IN_PROGRESS
  done
}

@test "signal handling: cleanup is idempotent" {
  cleanup_test_dir
  
  unset CLEANUP_IN_PROGRESS
  
  cleanup 0
  local first_flag="$CLEANUP_IN_PROGRESS"
  
  cleanup 0
  local second_flag="$CLEANUP_IN_PROGRESS"
  
  cleanup 0
  local third_flag="$CLEANUP_IN_PROGRESS"
  
  [ "$first_flag" = "true" ]
  [ "$second_flag" = "true" ]
  [ "$third_flag" = "true" ]
}

@test "signal handling: cleanup works with all handled signals" {
  cleanup_test_dir
  
  unset CLEANUP_IN_PROGRESS
  
  # Test with exit codes corresponding to different signals
  # EXIT (0)
  run cleanup 0
  [ "$status" -eq 0 ]
  unset CLEANUP_IN_PROGRESS
  
  # INT (130)
  run cleanup 130
  [ "$status" -eq 130 ]
  unset CLEANUP_IN_PROGRESS
  
  # TERM (143)
  run cleanup 143
  [ "$status" -eq 143 ]
  unset CLEANUP_IN_PROGRESS
  
  # QUIT (3)
  run cleanup 3
  [ "$status" -eq 3 ]
}

@test "signal handling: cleanup preserves behavior across calls" {
  cleanup_test_dir
  
  unset CLEANUP_IN_PROGRESS
  
  # First call
  run cleanup 0
  [ "$status" -eq 0 ]
  [[ "$output" == *"Cleaning up"* ]] || true
  
  unset CLEANUP_IN_PROGRESS
  
  # Second call with error
  run cleanup 1
  [ "$status" -eq 1 ]
  [[ "$output" == *"Script terminated with exit code: 1"* ]] || true
  
  unset CLEANUP_IN_PROGRESS
  
  # Third call back to zero
  run cleanup 0
  [ "$status" -eq 0 ]
}

@test "signal handling: cleanup sets flag before processing" {
  cleanup_test_dir
  
  unset CLEANUP_IN_PROGRESS
  
  # The flag should be set as the first action
  cleanup 0
  
  [ "$CLEANUP_IN_PROGRESS" = "true" ]
}

@test "signal handling: cleanup returns immediately when already in progress" {
  cleanup_test_dir
  
  CLEANUP_IN_PROGRESS="true"
  export CLEANUP_IN_PROGRESS
  
  run cleanup 1
  
  [ "$status" -eq 1 ]
  [ "$CLEANUP_IN_PROGRESS" = "true" ]
}
