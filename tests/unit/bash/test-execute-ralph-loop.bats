#!/usr/bin/env bats

# Test suite for execute_ralph_loop() function
# Tests Ralph CLI invocation and loop execution orchestration

setup() {
  load '../../helpers/test-common'
  source tests/helpers/test-functions.sh
}

teardown() {
  cleanup_test_dir
}

@test "execute_ralph_loop: requires ralph CLI to be installed" {
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  local change_dir="$test_dir/openspec/changes/test-change"
  local ralph_dir="$test_dir/.ralph"
  
  mkdir -p "$change_dir/specs" "$ralph_dir"
  
  create_openspec_change "test-change"
  
  mock ralph
  ralph() {
    echo "ralph command not found" >&2
    return 1
  }
  export -f ralph
  
  run execute_ralph_loop "$change_dir" "$ralph_dir" 1
  
  [ "$status" -eq 1 ]
  [[ "$output" == *"ralph CLI not found"* ]] || true
  
  cd - > /dev/null
  rm -rf "$test_dir"
}

@test "execute_ralph_loop: creates prompt template file" {
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  local change_dir="$test_dir/openspec/changes/test-change"
  local ralph_dir="$test_dir/.ralph"
  
  mkdir -p "$change_dir/specs" "$ralph_dir"
  
  create_openspec_change "test-change"
  
  mock ralph
  ralph() {
    echo "Mock ralph execution"
    return 0
  }
  export -f ralph
  
  run execute_ralph_loop "$change_dir" "$ralph_dir" 1
  
  [ "$status" -eq 0 ]
  [ -f "$ralph_dir/prompt-template.md" ]
  
  cd - > /dev/null
  rm -rf "$test_dir"
}

@test "execute_ralph_loop: generates PRD file" {
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  local change_dir="$test_dir/openspec/changes/test-change"
  local ralph_dir="$test_dir/.ralph"
  
  mkdir -p "$change_dir/specs" "$ralph_dir"
  
  create_openspec_change "test-change"
  
  mock ralph
  ralph() {
    echo "Mock ralph execution"
    return 0
  }
  export -f ralph
  
  run execute_ralph_loop "$change_dir" "$ralph_dir" 1
  
  [ "$status" -eq 0 ]
  [ -f "$ralph_dir/PRD.md" ]
  
  cd - > /dev/null
  rm -rf "$test_dir"
}

@test "execute_ralph_loop: creates task context file when tasks exist" {
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  local change_dir="$test_dir/openspec/changes/test-change"
  local ralph_dir="$test_dir/.ralph"
  
  mkdir -p "$change_dir/specs" "$ralph_dir"
  
  create_openspec_change "test-change"
  
  mock ralph
  ralph() {
    echo "Mock ralph execution"
    return 0
  }
  export -f ralph
  
  run execute_ralph_loop "$change_dir" "$ralph_dir" 1
  
  [ "$status" -eq 0 ]
  
  if [[ -f "$ralph_dir/.context_injection" ]]; then
    grep -q "## Current Task Context" "$ralph_dir/.context_injection"
  fi
  
  cd - > /dev/null
  rm -rf "$test_dir"
}

@test "execute_ralph_loop: syncs tasks to Ralph directory" {
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  local change_dir="$test_dir/openspec/changes/test-change"
  local ralph_dir="$test_dir/.ralph"
  
  mkdir -p "$change_dir/specs" "$ralph_dir"
  
  create_openspec_change "test-change"
  
  mock ralph
  ralph() {
    echo "Mock ralph execution"
    return 0
  }
  export -f ralph
  
  run execute_ralph_loop "$change_dir" "$ralph_dir" 1
  
  [ "$status" -eq 0 ]
  [ -L "$ralph_dir/ralph-tasks.md" ]
  
  cd - > /dev/null
  rm -rf "$test_dir"
}

@test "execute_ralph_loop: creates output directory for logs" {
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  local change_dir="$test_dir/openspec/changes/test-change"
  local ralph_dir="$test_dir/.ralph"
  
  mkdir -p "$change_dir/specs" "$ralph_dir"
  
  create_openspec_change "test-change"
  
  mock ralph
  ralph() {
    echo "Mock ralph execution"
    return 0
  }
  export -f ralph
  
  run execute_ralph_loop "$change_dir" "$ralph_dir" 1
  
  [ "$status" -eq 0 ]
  
  local output_dirs
  output_dirs=$(find "$ralph_dir" -type d -name "*output*")
  [ -n "$output_dirs" ]
  
  cd - > /dev/null
  rm -rf "$test_dir"
}

@test "execute_ralph_loop: captures stdout to log file" {
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  local change_dir="$test_dir/openspec/changes/test-change"
  local ralph_dir="$test_dir/.ralph"
  
  mkdir -p "$change_dir/specs" "$ralph_dir"
  
  create_openspec_change "test-change"
  
  mock ralph
  ralph() {
    echo "This is stdout output from Ralph"
    return 0
  }
  export -f ralph
  
  run execute_ralph_loop "$change_dir" "$ralph_dir" 1
  
  [ "$status" -eq 0 ]
  
  local stdout_logs
  stdout_logs=$(find "$ralph_dir" -name "*stdout*" -type f)
  [ -n "$stdout_logs" ]
  
  cd - > /dev/null
  rm -rf "$test_dir"
}

@test "execute_ralph_loop: captures stderr to log file" {
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  local change_dir="$test_dir/openspec/changes/test-change"
  local ralph_dir="$test_dir/.ralph"
  
  mkdir -p "$change_dir/specs" "$ralph_dir"
  
  create_openspec_change "test-change"
  
  mock ralph
  ralph() {
    echo "This is stderr output from Ralph" >&2
    return 0
  }
  export -f ralph
  
  run execute_ralph_loop "$change_dir" "$ralph_dir" 1
  
  [ "$status" -eq 0 ]
  
  local stderr_logs
  stderr_logs=$(find "$ralph_dir" -name "*stderr*" -type f)
  [ -n "$stderr_logs" ]
  
  cd - > /dev/null
  rm -rf "$test_dir"
}

@test "execute_ralph_loop: passes max_iterations to ralph CLI" {
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  local change_dir="$test_dir/openspec/changes/test-change"
  local ralph_dir="$test_dir/.ralph"
  local max_iter=15
  
  mkdir -p "$change_dir/specs" "$ralph_dir"
  
  create_openspec_change "test-change"
  
  local ralph_args
  mock ralph
  ralph() {
    ralph_args="$*"
    echo "Mock ralph execution"
    return 0
  }
  export -f ralph
  
  run execute_ralph_loop "$change_dir" "$ralph_dir" "$max_iter"
  
  [ "$status" -eq 0 ]
  [[ "$ralph_args" == *"--max-iterations $max_iter"* ]] || true
  
  cd - > /dev/null
  rm -rf "$test_dir"
}

@test "execute_ralph_loop: uses default max_iterations of 50 when not specified" {
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  local change_dir="$test_dir/openspec/changes/test-change"
  local ralph_dir="$test_dir/.ralph"
  
  mkdir -p "$change_dir/specs" "$ralph_dir"
  
  create_openspec_change "test-change"
  
  local ralph_args
  mock ralph
  ralph() {
    ralph_args="$*"
    echo "Mock ralph execution"
    return 0
  }
  export -f ralph
  
  run execute_ralph_loop "$change_dir" "$ralph_dir"
  
  [ "$status" -eq 0 ]
  [[ "$ralph_args" == *"--max-iterations 50"* ]] || true
  
  cd - > /dev/null
  rm -rf "$test_dir"
}

@test "execute_ralph_loop: passes prompt file to ralph CLI" {
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  local change_dir="$test_dir/openspec/changes/test-change"
  local ralph_dir="$test_dir/.ralph"
  
  mkdir -p "$change_dir/specs" "$ralph_dir"
  
  create_openspec_change "test-change"
  
  local ralph_args
  mock ralph
  ralph() {
    ralph_args="$*"
    echo "Mock ralph execution"
    return 0
  }
  export -f ralph
  
  run execute_ralph_loop "$change_dir" "$ralph_dir"
  
  [ "$status" -eq 0 ]
  [[ "$ralph_args" == *"--prompt-file"* ]] || true
  [[ "$ralph_args" == *"PRD.md"* ]] || true
  
  cd - > /dev/null
  rm -rf "$test_dir"
}

@test "execute_ralph_loop: passes prompt template to ralph CLI" {
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  local change_dir="$test_dir/openspec/changes/test-change"
  local ralph_dir="$test_dir/.ralph"
  
  mkdir -p "$change_dir/specs" "$ralph_dir"
  
  create_openspec_change "test-change"
  
  local ralph_args
  mock ralph
  ralph() {
    ralph_args="$*"
    echo "Mock ralph execution"
    return 0
  }
  export -f ralph
  
  run execute_ralph_loop "$change_dir" "$ralph_dir"
  
  [ "$status" -eq 0 ]
  [[ "$ralph_args" == *"--prompt-template"* ]] || true
  
  cd - > /dev/null
  rm -rf "$test_dir"
}

@test "execute_ralph_loop: passes agent flag to ralph CLI" {
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  local change_dir="$test_dir/openspec/changes/test-change"
  local ralph_dir="$test_dir/.ralph"
  
  mkdir -p "$change_dir/specs" "$ralph_dir"
  
  create_openspec_change "test-change"
  
  local ralph_args
  mock ralph
  ralph() {
    ralph_args="$*"
    echo "Mock ralph execution"
    return 0
  }
  export -f ralph
  
  run execute_ralph_loop "$change_dir" "$ralph_dir"
  
  [ "$status" -eq 0 ]
  [[ "$ralph_args" == *"--agent opencode"* ]] || true
  
  cd - > /dev/null
  rm -rf "$test_dir"
}

@test "execute_ralph_loop: passes tasks flag to ralph CLI" {
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  local change_dir="$test_dir/openspec/changes/test-change"
  local ralph_dir="$test_dir/.ralph"
  
  mkdir -p "$change_dir/specs" "$ralph_dir"
  
  create_openspec_change "test-change"
  
  local ralph_args
  mock ralph
  ralph() {
    ralph_args="$*"
    echo "Mock ralph execution"
    return 0
  }
  export -f ralph
  
  run execute_ralph_loop "$change_dir" "$ralph_dir"
  
  [ "$status" -eq 0 ]
  [[ "$ralph_args" == *"--tasks"* ]] || true
  
  cd - > /dev/null
  rm -rf "$test_dir"
}

@test "execute_ralph_loop: passes verbose-tools flag to ralph CLI" {
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  local change_dir="$test_dir/openspec/changes/test-change"
  local ralph_dir="$test_dir/.ralph"
  
  mkdir -p "$change_dir/specs" "$ralph_dir"
  
  create_openspec_change "test-change"
  
  local ralph_args
  mock ralph
  ralph() {
    ralph_args="$*"
    echo "Mock ralph execution"
    return 0
  }
  export -f ralph
  
  run execute_ralph_loop "$change_dir" "$ralph_dir"
  
  [ "$status" -eq 0 ]
  [[ "$ralph_args" == *"--verbose-tools"* ]] || true
  
  cd - > /dev/null
  rm -rf "$test_dir"
}

@test "execute_ralph_loop: logs informational messages" {
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  local change_dir="$test_dir/openspec/changes/test-change"
  local ralph_dir="$test_dir/.ralph"
  
  mkdir -p "$change_dir/specs" "$ralph_dir"
  
  create_openspec_change "test-change"
  
  mock ralph
  ralph() {
    echo "Mock ralph execution"
    return 0
  }
  export -f ralph
  
  run execute_ralph_loop "$change_dir" "$ralph_dir" 1
  
  [ "$status" -eq 0 ]
  
  [[ "$output" == *"Starting Ralph Wiggum loop"* ]] || true
  [[ "$output" == *"Max iterations: 1"* ]] || true
  [[ "$output" == *"Change directory"* ]] || true
  
  cd - > /dev/null
  rm -rf "$test_dir"
}

@test "execute_ralph_loop: restores Ralph state from tasks before execution" {
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  local change_dir="$test_dir/openspec/changes/test-change"
  local ralph_dir="$test_dir/.ralph"
  
  mkdir -p "$change_dir/specs" "$ralph_dir"
  
  create_openspec_change "test-change"
  
  mock ralph
  ralph() {
    echo "Mock ralph execution"
    return 0
  }
  export -f ralph
  
  run execute_ralph_loop "$change_dir" "$ralph_dir" 1
  
  [ "$status" -eq 0 ]
  [ -f "$ralph_dir/ralph-loop.state.json" ]
  
  cd - > /dev/null
  rm -rf "$test_dir"
}

@test "execute_ralph_loop: returns ralph CLI exit status" {
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  local change_dir="$test_dir/openspec/changes/test-change"
  local ralph_dir="$test_dir/.ralph"
  
  mkdir -p "$change_dir/specs" "$ralph_dir"
  
  create_openspec_change "test-change"
  
  mock ralph
  ralph() {
    echo "Mock ralph execution"
    return 42
  }
  export -f ralph
  
  run execute_ralph_loop "$change_dir" "$ralph_dir" 1
  
  [ "$status" -eq 42 ]
  
  cd - > /dev/null
  rm -rf "$test_dir"
}
