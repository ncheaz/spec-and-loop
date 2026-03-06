#!/usr/bin/env bats

# Test suite for create_prompt_template() function
# Tests prompt template generation with placeholders

setup() {
  load '../../helpers/test-common'
  source scripts/ralph-run.sh
}

teardown() {
  cleanup_test_dir
}

@test "create_prompt_template: creates template file" {
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  local change_dir="$test_dir/openspec/changes/test-change"
  local template_file="$test_dir/template.txt"
  
  mkdir -p "$change_dir/specs"
  
  run create_prompt_template "$change_dir" "$template_file"
  
  [ "$status" -eq 0 ]
  [ -f "$template_file" ]
  
  cd - > /dev/null
  rm -rf "$test_dir"
}

@test "create_prompt_template: includes change directory in template" {
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  local change_dir="$test_dir/openspec/changes/test-change"
  local template_file="$test_dir/template.txt"
  
  mkdir -p "$change_dir/specs"
  
  run create_prompt_template "$change_dir" "$template_file"
  
  [ "$status" -eq 0 ]
  
  local abs_change_dir
  abs_change_dir=$(get_realpath "$change_dir")
  
  grep -q "$abs_change_dir" "$template_file"
  
  cd - > /dev/null
  rm -rf "$test_dir"
}

@test "create_prompt_template: includes Ralph iteration placeholders" {
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  local change_dir="$test_dir/openspec/changes/test-change"
  local template_file="$test_dir/template.txt"
  
  mkdir -p "$change_dir/specs"
  
  run create_prompt_template "$change_dir" "$template_file"
  
  [ "$status" -eq 0 ]
  
  grep -q "{{iteration}}" "$template_file"
  grep -q "{{max_iterations}}" "$template_file"
  
  cd - > /dev/null
  rm -rf "$test_dir"
}

@test "create_prompt_template: includes task list placeholder" {
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  local change_dir="$test_dir/openspec/changes/test-change"
  local template_file="$test_dir/template.txt"
  
  mkdir -p "$change_dir/specs"
  
  run create_prompt_template "$change_dir" "$template_file"
  
  [ "$status" -eq 0 ]
  
  grep -q "{{tasks}}" "$template_file"
  
  cd - > /dev/null
  rm -rf "$test_dir"
}

@test "create_prompt_template: includes context placeholder" {
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  local change_dir="$test_dir/openspec/changes/test-change"
  local template_file="$test_dir/template.txt"
  
  mkdir -p "$change_dir/specs"
  
  run create_prompt_template "$change_dir" "$template_file"
  
  [ "$status" -eq 0 ]
  
  grep -q "{{context}}" "$template_file"
  
  cd - > /dev/null
  rm -rf "$test_dir"
}

@test "create_prompt_template: includes promise placeholders" {
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  local change_dir="$test_dir/openspec/changes/test-change"
  local template_file="$test_dir/template.txt"
  
  mkdir -p "$change_dir/specs"
  
  run create_prompt_template "$change_dir" "$template_file"
  
  [ "$status" -eq 0 ]
  
  grep -q "{{task_promise}}" "$template_file"
  grep -q "{{completion_promise}}" "$template_file"
  
  cd - > /dev/null
  rm -rf "$test_dir"
}

@test "create_prompt_template: includes OpenSpec artifacts context section" {
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  local change_dir="$test_dir/openspec/changes/test-change"
  local template_file="$test_dir/template.txt"
  
  mkdir -p "$change_dir/specs"
  
  run create_prompt_template "$change_dir" "$template_file"
  
  [ "$status" -eq 0 ]
  
  grep -q "## OpenSpec Artifacts Context" "$template_file"
  
  cd - > /dev/null
  rm -rf "$test_dir"
}

@test "create_prompt_template: includes instructions section" {
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  local change_dir="$test_dir/openspec/changes/test-change"
  local template_file="$test_dir/template.txt"
  
  mkdir -p "$change_dir/specs"
  
  run create_prompt_template "$change_dir" "$template_file"
  
  [ "$status" -eq 0 ]
  
  grep -q "## Instructions" "$template_file"
  
  cd - > /dev/null
  rm -rf "$test_dir"
}

@test "create_prompt_template: includes critical rules section" {
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  local change_dir="$test_dir/openspec/changes/test-change"
  local template_file="$test_dir/template.txt"
  
  mkdir -p "$change_dir/specs"
  
  run create_prompt_template "$change_dir" "$template_file"
  
  [ "$status" -eq 0 ]
  
  grep -q "## Critical Rules" "$template_file"
  
  cd - > /dev/null
  rm -rf "$test_dir"
}

@test "create_prompt_template: includes git commit format section" {
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  local change_dir="$test_dir/openspec/changes/test-change"
  local template_file="$test_dir/template.txt"
  
  mkdir -p "$change_dir/specs"
  
  run create_prompt_template "$change_dir" "$template_file"
  
  [ "$status" -eq 0 ]
  
  grep -q "## CRITICAL: Git Commit Format" "$template_file"
  
  cd - > /dev/null
  rm -rf "$test_dir"
}

@test "create_prompt_template: includes Ralph Wiggum header" {
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  local change_dir="$test_dir/openspec/changes/test-change"
  local template_file="$test_dir/template.txt"
  
  mkdir -p "$change_dir/specs"
  
  run create_prompt_template "$change_dir" "$template_file"
  
  [ "$status" -eq 0 ]
  
  grep -q "# Ralph Wiggum Task Execution" "$template_file"
  
  cd - > /dev/null
  rm -rf "$test_dir"
}

@test "create_prompt_template: uses absolute path for change directory" {
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  local change_dir="openspec/changes/test-change"
  local template_file="$test_dir/template.txt"
  
  mkdir -p "$change_dir/specs"
  
  run create_prompt_template "$change_dir" "$template_file"
  
  [ "$status" -eq 0 ]
  
  local abs_change_dir
  abs_change_dir=$(get_realpath "$change_dir")
  
  grep -q "^Change directory: $abs_change_dir" "$template_file"
  
  cd - > /dev/null
  rm -rf "$test_dir"
}

@test "create_prompt_template: replaces change directory placeholder" {
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  local change_dir="$test_dir/openspec/changes/test-change"
  local template_file="$test_dir/template.txt"
  
  mkdir -p "$change_dir/specs"
  
  run create_prompt_template "$change_dir" "$template_file"
  
  [ "$status" -eq 0 ]
  
  ! grep -q "{{change_dir}}" "$template_file"
  
  cd - > /dev/null
  rm -rf "$test_dir"
}

@test "create_prompt_template: handles relative change directory" {
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  local change_dir="openspec/changes/test-change"
  local template_file="$test_dir/template.txt"
  
  mkdir -p "$change_dir/specs"
  
  run create_prompt_template "$change_dir" "$template_file"
  
  [ "$status" -eq 0 ]
  [ -f "$template_file" ]
  
  cd - > /dev/null
  rm -rf "$test_dir"
}

@test "create_prompt_template: handles change directory with special characters" {
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  local change_dir="$test_dir/openspec/changes/test-change with spaces"
  local template_file="$test_dir/template.txt"
  
  mkdir -p "$change_dir/specs"
  
  run create_prompt_template "$change_dir" "$template_file"
  
  [ "$status" -eq 0 ]
  [ -f "$template_file" ]
  
  local abs_change_dir
  abs_change_dir=$(get_realpath "$change_dir")
  
  grep -q "$abs_change_dir" "$template_file"
  
  cd - > /dev/null
  rm -rf "$test_dir"
}

@test "create_prompt_template: can overwrite existing template file" {
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  local change_dir="$test_dir/openspec/changes/test-change"
  local template_file="$test_dir/template.txt"
  
  mkdir -p "$change_dir/specs"
  
  echo "old template content" > "$template_file"
  
  run create_prompt_template "$change_dir" "$template_file"
  
  [ "$status" -eq 0 ]
  
  ! grep -q "old template content" "$template_file"
  
  cd - > /dev/null
  rm -rf "$test_dir"
}

@test "create_prompt_template: logs verbose message during creation" {
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  local change_dir="$test_dir/openspec/changes/test-change"
  local template_file="$test_dir/template.txt"
  
  mkdir -p "$change_dir/specs"
  
  run create_prompt_template "$change_dir" "$template_file"
  
  [ "$status" -eq 0 ]
  
  [[ "$output" == *"Prompt template created"* ]] || true
  
  cd - > /dev/null
  rm -rf "$test_dir"
}

@test "create_prompt_template: template file is readable" {
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  local change_dir="$test_dir/openspec/changes/test-change"
  local template_file="$test_dir/template.txt"
  
  mkdir -p "$change_dir/specs"
  
  run create_prompt_template "$change_dir" "$template_file"
  
  [ "$status" -eq 0 ]
  
  local content
  content=$(cat "$template_file")
  [ -n "$content" ]
  
  cd - > /dev/null
  rm -rf "$test_dir"
}
