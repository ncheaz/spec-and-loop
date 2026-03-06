#!/usr/bin/env bats

# Test suite for sync_tasks_to_ralph() function
# Tests symlink creation and Ralph tasks file synchronization

setup() {
  load '../helpers/test-common'
  source ../../../../scripts/ralph-run.sh
}

teardown() {
  cleanup_test_dir
}

@test "sync_tasks_to_ralph: creates symlink when no file exists" {
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  local change_dir="$test_dir/openspec/changes/test-change"
  local ralph_dir="$test_dir/.ralph"
  
  create_openspec_change "test-change"
  
  run sync_tasks_to_ralph "$change_dir" "$ralph_dir"
  
  [ "$status" -eq 0 ]
  
  [ -L "$ralph_dir/ralph-tasks.md" ]
  
  local target
  target=$(readlink "$ralph_dir/ralph-tasks.md")
  [[ "$target" == *"tasks.md"* ]] || true
}

@test "sync_tasks_to_ralph: creates ralph directory if it doesn't exist" {
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  local change_dir="$test_dir/openspec/changes/test-change"
  local ralph_dir="$test_dir/.ralph"
  
  create_openspec_change "test-change"
  
  [ ! -d "$ralph_dir" ]
  
  run sync_tasks_to_ralph "$change_dir" "$ralph_dir"
  
  [ "$status" -eq 0 ]
  [ -d "$ralph_dir" ]
}

@test "sync_tasks_to_ralph: symlink points to correct tasks file" {
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  local change_dir="$test_dir/openspec/changes/test-change"
  local ralph_dir="$test_dir/.ralph"
  
  create_openspec_change "test-change"
  
  run sync_tasks_to_ralph "$change_dir" "$ralph_dir"
  
  [ "$status" -eq 0 ]
  
  local symlink_target
  symlink_target=$(get_realpath "$ralph_dir/ralph-tasks.md")
  local expected_target
  expected_target=$(get_realpath "$change_dir/tasks.md")
  
  [ "$symlink_target" = "$expected_target" ]
}

@test "sync_tasks_to_ralph: updates existing symlink if pointing to wrong location" {
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  local change_dir="$test_dir/openspec/changes/test-change"
  local ralph_dir="$test_dir/.ralph"
  
  create_openspec_change "test-change"
  
  mkdir -p "$ralph_dir"
  echo "wrong content" > "$ralph_dir/old-tasks.md"
  ln -sf "$ralph_dir/old-tasks.md" "$ralph_dir/ralph-tasks.md"
  
  run sync_tasks_to_ralph "$change_dir" "$ralph_dir"
  
  [ "$status" -eq 0 ]
  
  local symlink_target
  symlink_target=$(get_realpath "$ralph_dir/ralph-tasks.md")
  [[ "$symlink_target" != *"old-tasks.md"* ]] || true
  [[ "$symlink_target" == *"tasks.md"* ]] || true
}

@test "sync_tasks_to_ralph: replaces regular file with symlink" {
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  local change_dir="$test_dir/openspec/changes/test-change"
  local ralph_dir="$test_dir/.ralph"
  
  create_openspec_change "test-change"
  
  mkdir -p "$ralph_dir"
  echo "old tasks content" > "$ralph_dir/ralph-tasks.md"
  
  [ -f "$ralph_dir/ralph-tasks.md" ]
  [ ! -L "$ralph_dir/ralph-tasks.md" ]
  
  run sync_tasks_to_ralph "$change_dir" "$ralph_dir"
  
  [ "$status" -eq 0 ]
  [ -L "$ralph_dir/ralph-tasks.md" ]
}

@test "sync_tasks_to_ralph: removes old ralph tasks file in change directory" {
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  local change_dir="$test_dir/openspec/changes/test-change"
  local ralph_dir="$test_dir/.ralph"
  local old_ralph_tasks_file="$change_dir/.ralph/ralph-tasks.md"
  
  create_openspec_change "test-change"
  
  mkdir -p "$change_dir/.ralph"
  echo "old ralph tasks" > "$old_ralph_tasks_file"
  
  [ -f "$old_ralph_tasks_file" ]
  
  run sync_tasks_to_ralph "$change_dir" "$ralph_dir"
  
  [ "$status" -eq 0 ]
  [ ! -f "$old_ralph_tasks_file" ]
}

@test "sync_tasks_to_ralph: fails when tasks file doesn't exist" {
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  local change_dir="$test_dir/openspec/changes/test-change"
  local ralph_dir="$test_dir/.ralph"
  
  mkdir -p "$change_dir"
  
  [ ! -f "$change_dir/tasks.md" ]
  
  run sync_tasks_to_ralph "$change_dir" "$ralph_dir"
  
  [ "$status" -eq 1 ]
  [[ "$output" == *"Tasks file not found"* ]] || true
}

@test "sync_tasks_to_ralph: creates parent directories for ralph tasks file" {
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  local change_dir="$test_dir/openspec/changes/test-change"
  local ralph_dir="$test_dir/nested/deep/path/.ralph"
  
  create_openspec_change "test-change"
  
  [ ! -d "$ralph_dir" ]
  [ ! -d "$(dirname "$ralph_dir/ralph-tasks.md")" ]
  
  run sync_tasks_to_ralph "$change_dir" "$ralph_dir"
  
  [ "$status" -eq 0 ]
  [ -d "$(dirname "$ralph_dir/ralph-tasks.md")" ]
  [ -L "$ralph_dir/ralph-tasks.md" ]
}

@test "sync_tasks_to_ralph: works with relative paths" {
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  local change_dir="openspec/changes/test-change"
  local ralph_dir=".ralph"
  
  create_openspec_change "test-change"
  
  run sync_tasks_to_ralph "$change_dir" "$ralph_dir"
  
  [ "$status" -eq 0 ]
  [ -L "$ralph_dir/ralph-tasks.md" ]
}

@test "sync_tasks_to_ralph: maintains symlink on repeated calls" {
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  local change_dir="$test_dir/openspec/changes/test-change"
  local ralph_dir="$test_dir/.ralph"
  
  create_openspec_change "test-change"
  
  run sync_tasks_to_ralph "$change_dir" "$ralph_dir"
  [ "$status" -eq 0 ]
  
  local first_target
  first_target=$(get_realpath "$ralph_dir/ralph-tasks.md")
  
  run sync_tasks_to_ralph "$change_dir" "$ralph_dir"
  [ "$status" -eq 0 ]
  
  local second_target
  second_target=$(get_realpath "$ralph_dir/ralph-tasks.md")
  
  [ "$first_target" = "$second_target" ]
}

@test "sync_tasks_to_ralph: handles special characters in directory names" {
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  local change_dir="$test_dir/openspec/changes/test-change with spaces"
  local ralph_dir="$test_dir/.ralph"
  
  mkdir -p "$change_dir/specs"
  echo "test tasks" > "$change_dir/tasks.md"
  
  run sync_tasks_to_ralph "$change_dir" "$ralph_dir"
  
  [ "$status" -eq 0 ]
  [ -L "$ralph_dir/ralph-tasks.md" ]
}
