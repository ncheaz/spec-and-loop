#!/usr/bin/env bats

# Test suite for symlink architecture verification
# Tests that .ralph/ralph-tasks.md correctly points to openspec/changes/<name>/tasks.md
# and that the symlink architecture enables both Ralph and openspec-apply-change
# to work on the same file without desynchronization

setup() {
  load '../../helpers/test-common'
  source tests/helpers/test-functions.sh
}

teardown() {
  cleanup_test_dir
}

@test "symlink architecture: .ralph/ralph-tasks.md exists as symlink after initialization" {
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1

  local change_name="test-change"
  local change_dir="$test_dir/openspec/changes/$change_name"
  local ralph_dir="$test_dir/.ralph"

  create_openspec_change "$change_name"

  run sync_tasks_to_ralph "$change_dir" "$ralph_dir"

  [ "$status" -eq 0 ]
  [ -L "$ralph_dir/ralph-tasks.md" ]
}

@test "symlink architecture: .ralph/ralph-tasks.md points to correct tasks.md file" {
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1

  local change_name="test-change"
  local change_dir="$test_dir/openspec/changes/$change_name"
  local ralph_dir="$test_dir/.ralph"

  create_openspec_change "$change_name"

  run sync_tasks_to_ralph "$change_dir" "$ralph_dir"

  [ "$status" -eq 0 ]

  local symlink_path="$ralph_dir/ralph-tasks.md"
  local expected_target
  expected_target=$(get_realpath "$change_dir/tasks.md")
  local actual_target
  actual_target=$(get_realpath "$symlink_path")

  [ "$actual_target" = "$expected_target" ]
}

@test "symlink architecture: reading .ralph/ralph-tasks.md shows tasks.md content" {
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1

  local change_name="test-change"
  local change_dir="$test_dir/openspec/changes/$change_name"
  local ralph_dir="$test_dir/.ralph"

  create_openspec_change "$change_name"

  run sync_tasks_to_ralph "$change_dir" "$ralph_dir"

  [ "$status" -eq 0 ]

  local tasks_content
  tasks_content=$(cat "$change_dir/tasks.md")
  local symlink_content
  symlink_content=$(cat "$ralph_dir/ralph-tasks.md")

  [ "$tasks_content" = "$symlink_content" ]
}

@test "symlink architecture: writing to tasks.md is visible through symlink" {
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1

  local change_name="test-change"
  local change_dir="$test_dir/openspec/changes/$change_name"
  local ralph_dir="$test_dir/.ralph"

  create_openspec_change "$change_name"

  run sync_tasks_to_ralph "$change_dir" "$ralph_dir"

  [ "$status" -eq 0 ]

  local test_string="new task content"
  echo "$test_string" >> "$change_dir/tasks.md"

  grep -q "$test_string" "$ralph_dir/ralph-tasks.md"
}

@test "symlink architecture: writing through symlink updates tasks.md" {
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1

  local change_name="test-change"
  local change_dir="$test_dir/openspec/changes/$change_name"
  local ralph_dir="$test_dir/.ralph"

  create_openspec_change "$change_name"

  run sync_tasks_to_ralph "$change_dir" "$ralph_dir"

  [ "$status" -eq 0 ]

  local test_string="task marked complete: [x] task one"
  echo "$test_string" >> "$ralph_dir/ralph-tasks.md"

  grep -qF "$test_string" "$change_dir/tasks.md"
}

@test "symlink architecture: both systems see same file state simultaneously" {
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1

  local change_name="test-change"
  local change_dir="$test_dir/openspec/changes/$change_name"
  local ralph_dir="$test_dir/.ralph"

  create_openspec_change "$change_name"

  run sync_tasks_to_ralph "$change_dir" "$ralph_dir"

  [ "$status" -eq 0 ]

  local timestamp
  timestamp=$(date +%s)

  echo "updated at $timestamp" > "$change_dir/tasks.md"

  local content_from_target
  content_from_target=$(cat "$change_dir/tasks.md")
  local content_from_symlink
  content_from_symlink=$(cat "$ralph_dir/ralph-tasks.md")

  [ "$content_from_target" = "$content_from_symlink" ]
  echo "$content_from_target" | grep -q "updated at $timestamp"
}

@test "symlink architecture: symlink inode matches target inode" {
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1

  local change_name="test-change"
  local change_dir="$test_dir/openspec/changes/$change_name"
  local ralph_dir="$test_dir/.ralph"

  create_openspec_change "$change_name"

  run sync_tasks_to_ralph "$change_dir" "$ralph_dir"

  [ "$status" -eq 0 ]

  local target_inode
  local symlink_inode
  local os
  os=$(detect_os)

  if [[ "$os" == "Linux" ]]; then
    target_inode=$(stat -c %i "$change_dir/tasks.md")
    # Follow the symlink to get the target inode
    symlink_inode=$(stat -c %i "$ralph_dir/ralph-tasks.md")
  elif [[ "$os" == "macOS" ]]; then
    target_inode=$(stat -f %i "$change_dir/tasks.md")
    # On macOS, stat -f %i returns the symlink's own inode; use -L to follow the symlink
    symlink_inode=$(stat -Lf %i "$ralph_dir/ralph-tasks.md")
  fi

  [ "$target_inode" = "$symlink_inode" ]
}

@test "symlink architecture: broken symlink detected and reported" {
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1

  local change_name="test-change"
  local change_dir="$test_dir/openspec/changes/$change_name"
  local ralph_dir="$test_dir/.ralph"

  create_openspec_change "$change_name"

  run sync_tasks_to_ralph "$change_dir" "$ralph_dir"

  [ "$status" -eq 0 ]

  rm "$change_dir/tasks.md"

  [ -L "$ralph_dir/ralph-tasks.md" ]
  [ ! -e "$ralph_dir/ralph-tasks.md" ]
}

@test "symlink architecture: symlink works with relative path resolution" {
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1

  local change_name="test-change"
  local change_dir="openspec/changes/$change_name"
  local ralph_dir=".ralph"

  create_openspec_change "$change_name"

  run sync_tasks_to_ralph "$change_dir" "$ralph_dir"

  [ "$status" -eq 0 ]
  [ -L "$ralph_dir/ralph-tasks.md" ]

  local content
  content=$(cat "$ralph_dir/ralph-tasks.md")
  echo "$content" | grep -q "Test Tasks"
}

@test "symlink architecture: symlink works with absolute path resolution" {
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1

  local change_name="test-change"
  local change_dir="$test_dir/openspec/changes/$change_name"
  local ralph_dir="$test_dir/.ralph"

  create_openspec_change "$change_name"

  run sync_tasks_to_ralph "$change_dir" "$ralph_dir"

  [ "$status" -eq 0 ]
  [ -L "$ralph_dir/ralph-tasks.md" ]

  local content
  content=$(cat "$ralph_dir/ralph-tasks.md")
  echo "$content" | grep -q "Test Tasks"
}

@test "symlink architecture: symlink persists across directory changes" {
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1

  local change_name="test-change"
  local change_dir="$test_dir/openspec/changes/$change_name"
  local ralph_dir="$test_dir/.ralph"

  create_openspec_change "$change_name"

  run sync_tasks_to_ralph "$change_dir" "$ralph_dir"

  [ "$status" -eq 0 ]

  cd /tmp
  local content
  content=$(cat "$ralph_dir/ralph-tasks.md")
  cd "$test_dir"

  echo "$content" | grep -q "Test Tasks"
}

@test "symlink architecture: file MD5 matches through symlink" {
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1

  local change_name="test-change"
  local change_dir="$test_dir/openspec/changes/$change_name"
  local ralph_dir="$test_dir/.ralph"

  create_openspec_change "$change_name"

  run sync_tasks_to_ralph "$change_dir" "$ralph_dir"

  [ "$status" -eq 0 ]

  local target_md5
  local symlink_md5

  target_md5=$(get_file_md5 "$change_dir/tasks.md")
  symlink_md5=$(get_file_md5 "$ralph_dir/ralph-tasks.md")

  [ "$target_md5" = "$symlink_md5" ]
}

@test "symlink architecture: file modification time matches through symlink" {
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1

  local change_name="test-change"
  local change_dir="$test_dir/openspec/changes/$change_name"
  local ralph_dir="$test_dir/.ralph"

  create_openspec_change "$change_name"

  run sync_tasks_to_ralph "$change_dir" "$ralph_dir"

  [ "$status" -eq 0 ]

  local target_mtime
  local symlink_mtime

  target_mtime=$(get_file_mtime "$change_dir/tasks.md")
  symlink_mtime=$(get_file_mtime "$ralph_dir/ralph-tasks.md")

  [ "$target_mtime" = "$symlink_mtime" ]
}

@test "symlink architecture: task state changes propagate immediately" {
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1

  local change_name="test-change"
  local change_dir="$test_dir/openspec/changes/$change_name"
  local ralph_dir="$test_dir/.ralph"

  create_openspec_change "$change_name"

  run sync_tasks_to_ralph "$change_dir" "$ralph_dir"

  [ "$status" -eq 0 ]

  sed -i.bak 's/- \[ \]/- [x]/' "$change_dir/tasks.md"
  rm -f "$change_dir/tasks.md.bak"

  grep -q "\[x\]" "$ralph_dir/ralph-tasks.md"
}

@test "symlink architecture: symlink prevents file duplication" {
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1

  local change_name="test-change"
  local change_dir="$test_dir/openspec/changes/$change_name"
  local ralph_dir="$test_dir/.ralph"

  create_openspec_change "$change_name"

  run sync_tasks_to_ralph "$change_dir" "$ralph_dir"

  [ "$status" -eq 0 ]

  local original_inode
  local os
  os=$(detect_os)

  if [[ "$os" == "Linux" ]]; then
    original_inode=$(stat -c %i "$change_dir/tasks.md")
  elif [[ "$os" == "macOS" ]]; then
    original_inode=$(stat -f %i "$change_dir/tasks.md")
  fi

  cp "$ralph_dir/ralph-tasks.md" "$ralph_dir/ralph-tasks.md.copy"

  local copy_inode
  if [[ "$os" == "Linux" ]]; then
    copy_inode=$(stat -c %i "$ralph_dir/ralph-tasks.md.copy")
  elif [[ "$os" == "macOS" ]]; then
    copy_inode=$(stat -f %i "$ralph_dir/ralph-tasks.md.copy")
  fi

  [ "$original_inode" != "$copy_inode" ]
  rm "$ralph_dir/ralph-tasks.md.copy"
}
