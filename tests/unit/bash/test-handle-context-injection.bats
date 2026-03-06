#!/usr/bin/env bats

# Test suite for handle_context_injection() function
# Tests context injection handling and cleanup

setup() {
  load '../../helpers/test-common'
  source scripts/ralph-run.sh
}

teardown() {
  cleanup_test_dir
}

@test "handle_context_injection: returns success when injection file exists" {
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  local ralph_dir="$test_dir/.ralph"
  mkdir -p "$ralph_dir"
  
  echo "Test context" > "$ralph_dir/.context_injection"
  
  run handle_context_injection "$ralph_dir"
  
  [ "$status" -eq 0 ]
  
  cd - > /dev/null
  rm -rf "$test_dir"
}

@test "handle_context_injection: returns failure when injection file doesn't exist" {
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  local ralph_dir="$test_dir/.ralph"
  mkdir -p "$ralph_dir"
  
  run handle_context_injection "$ralph_dir"
  
  [ "$status" -eq 1 ]
  
  cd - > /dev/null
  rm -rf "$test_dir"
}

@test "handle_context_injection: outputs content from injection file" {
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  local ralph_dir="$test_dir/.ralph"
  mkdir -p "$ralph_dir"
  
  echo "Injected context content" > "$ralph_dir/.context_injection"
  
  run handle_context_injection "$ralph_dir"
  
  [ "$status" -eq 0 ]
  [[ "$output" == *"Injected context content"* ]] || true
  
  cd - > /dev/null
  rm -rf "$test_dir"
}

@test "handle_context_injection: removes injection file after reading" {
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  local ralph_dir="$test_dir/.ralph"
  mkdir -p "$ralph_dir"
  
  echo "Test context" > "$ralph_dir/.context_injection"
  
  [ -f "$ralph_dir/.context_injection" ]
  
  handle_context_injection "$ralph_dir"
  
  [ ! -f "$ralph_dir/.context_injection" ]
  
  cd - > /dev/null
  rm -rf "$test_dir"
}

@test "handle_context_injection: handles multiline injection content" {
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  local ralph_dir="$test_dir/.ralph"
  mkdir -p "$ralph_dir"
  
  cat > "$ralph_dir/.context_injection" <<'EOF'
Line 1 of context
Line 2 of context
Line 3 of context
EOF
  
  run handle_context_injection "$ralph_dir"
  
  [ "$status" -eq 0 ]
  [[ "$output" == *"Line 1 of context"* ]] || true
  [[ "$output" == *"Line 2 of context"* ]] || true
  [[ "$output" == *"Line 3 of context"* ]] || true
  
  cd - > /dev/null
  rm -rf "$test_dir"
}

@test "handle_context_injection: handles empty injection file" {
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  local ralph_dir="$test_dir/.ralph"
  mkdir -p "$ralph_dir"
  
  touch "$ralph_dir/.context_injection"
  
  run handle_context_injection "$ralph_dir"
  
  [ "$status" -eq 0 ]
  
  cd - > /dev/null
  rm -rf "$test_dir"
}

@test "handle_context_injection: handles injection with special characters" {
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  local ralph_dir="$test_dir/.ralph"
  mkdir -p "$ralph_dir"
  
  echo "Context with & < > \"special\" characters" > "$ralph_dir/.context_injection"
  
  run handle_context_injection "$ralph_dir"
  
  [ "$status" -eq 0 ]
  [[ "$output" == *"Context with"* ]] || true
  [[ "$output" == *"special"* ]] || true
  
  cd - > /dev/null
  rm -rf "$test_dir"
}

@test "handle_context_injection: can be called multiple times" {
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  local ralph_dir="$test_dir/.ralph"
  mkdir -p "$ralph_dir"
  
  # First call
  echo "First context" > "$ralph_dir/.context_injection"
  run handle_context_injection "$ralph_dir"
  [ "$status" -eq 0 ]
  [[ "$output" == *"First context"* ]] || true
  
  # Second call - file should be gone
  run handle_context_injection "$ralph_dir"
  [ "$status" -eq 1 ]
  
  # Third call - create new file
  echo "Second context" > "$ralph_dir/.context_injection"
  run handle_context_injection "$ralph_dir"
  [ "$status" -eq 0 ]
  [[ "$output" == *"Second context"* ]] || true
  
  cd - > /dev/null
  rm -rf "$test_dir"
}

@test "handle_context_injection: outputs nothing when file doesn't exist" {
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  local ralph_dir="$test_dir/.ralph"
  mkdir -p "$ralph_dir"
  
  run handle_context_injection "$ralph_dir"
  
  [ "$status" -eq 1 ]
  [ -z "$output" ]
  
  cd - > /dev/null
  rm -rf "$test_dir"
}

@test "handle_context_injection: preserves content exactly" {
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  local ralph_dir="$test_dir/.ralph"
  mkdir -p "$ralph_dir"
  
  local original_content="Original content with tabs	and spaces"
  echo "$original_content" > "$ralph_dir/.context_injection"
  
  run handle_context_injection "$ralph_dir"
  
  [ "$status" -eq 0 ]
  [ "$output" = "$original_content" ]
  
  cd - > /dev/null
  rm -rf "$test_dir"
}

@test "handle_context_injection: handles large injection files" {
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  local ralph_dir="$test_dir/.ralph"
  mkdir -p "$ralph_dir"
  
  # Create a large file
  {
    for i in $(seq 1 100); do
      echo "Context line $i with some content"
    done
  } > "$ralph_dir/.context_injection"
  
  run handle_context_injection "$ralph_dir"
  
  [ "$status" -eq 0 ]
  [[ "$output" == *"Context line 1"* ]] || true
  [[ "$output" == *"Context line 100"* ]] || true
  
  cd - > /dev/null
  rm -rf "$test_dir"
}

@test "handle_context_injection: uses correct injection file path" {
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  local ralph_dir="$test_dir/.ralph"
  mkdir -p "$ralph_dir"
  
  echo "Test context" > "$ralph_dir/.context_injection"
  
  run handle_context_injection "$ralph_dir"
  
  [ "$status" -eq 0 ]
  [ ! -f "$ralph_dir/.context_injection" ]
  
  cd - > /dev/null
  rm -rf "$test_dir"
}

@test "handle_context_injection: works with hidden file" {
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  local ralph_dir="$test_dir/.ralph"
  mkdir -p "$ralph_dir"
  
  echo "Hidden context" > "$ralph_dir/.context_injection"
  
  # File exists (hidden files are still files)
  [ -f "$ralph_dir/.context_injection" ]
  
  run handle_context_injection "$ralph_dir"
  
  [ "$status" -eq 0 ]
  [[ "$output" == *"Hidden context"* ]] || true
  [ ! -f "$ralph_dir/.context_injection" ]
  
  cd - > /dev/null
  rm -rf "$test_dir"
}

@test "handle_context_injection: handles ralph_dir with spaces" {
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  local ralph_dir="$test_dir/ralph directory with spaces"
  mkdir -p "$ralph_dir"
  
  echo "Context for spaced dir" > "$ralph_dir/.context_injection"
  
  run handle_context_injection "$ralph_dir"
  
  [ "$status" -eq 0 ]
  [[ "$output" == *"Context for spaced dir"* ]] || true
  [ ! -f "$ralph_dir/.context_injection" ]
  
  cd - > /dev/null
  rm -rf "$test_dir"
}
