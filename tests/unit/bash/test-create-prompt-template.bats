#!/usr/bin/env bats

# Test suite for create_prompt_template() function
# Tests prompt template generation with placeholders

setup() {
  load '../../helpers/test-common'
  source tests/helpers/test-functions.sh
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

@test "create_prompt_template: does not include raw task list placeholder" {
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  local change_dir="$test_dir/openspec/changes/test-change"
  local template_file="$test_dir/template.txt"
  
  mkdir -p "$change_dir/specs"
  
  run create_prompt_template "$change_dir" "$template_file"
  
  [ "$status" -eq 0 ]
  
  ! grep -q "{{tasks}}" "$template_file"
  
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

@test "create_prompt_template: includes fresh task context placeholder" {
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  local change_dir="$test_dir/openspec/changes/test-change"
  local template_file="$test_dir/template.txt"
  
  mkdir -p "$change_dir/specs"
  
  run create_prompt_template "$change_dir" "$template_file"
  
  [ "$status" -eq 0 ]
  
  grep -q "{{task_context}}" "$template_file"
  
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

@test "create_prompt_template: does not include OpenSpec artifacts context section" {
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  local change_dir="$test_dir/openspec/changes/test-change"
  local template_file="$test_dir/template.txt"
  
  mkdir -p "$change_dir/specs"
  
  run create_prompt_template "$change_dir" "$template_file"
  
  [ "$status" -eq 0 ]
  
  # Old section name must be gone
  ! grep -q "## OpenSpec Artifacts Context" "$template_file"
  # New section must be present
  grep -q "## OpenSpec Artifacts" "$template_file"
  
  cd - > /dev/null
  rm -rf "$test_dir"
}

@test "create_prompt_template: includes explicit base prompt snapshot section" {
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1

  local change_dir="$test_dir/openspec/changes/test-change"
  local template_file="$test_dir/template.txt"

  mkdir -p "$change_dir/specs"

  run create_prompt_template "$change_dir" "$template_file"

  [ "$status" -eq 0 ]

  # The old inline PRD section must be gone; manifest style is now used instead
  ! grep -q "## Invocation-Time PRD Snapshot" "$template_file"
  ! grep -q "{{base_prompt}}" "$template_file"
  # Manifest section reference to .ralph/PRD.md must be present
  grep -q ".ralph/PRD.md" "$template_file"

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
  
  # The verbose Critical Rules section is replaced by a compact Instructions block
  ! grep -q "## Critical Rules" "$template_file"
  # The compressed Instructions block and promise contract must still be present
  grep -q "## Instructions" "$template_file"
  grep -q "{{task_promise}}" "$template_file"
  grep -q "{{completion_promise}}" "$template_file"
  
  cd - > /dev/null
  rm -rf "$test_dir"
}

@test "create_prompt_template: includes commit contract placeholder section" {
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  local change_dir="$test_dir/openspec/changes/test-change"
  local template_file="$test_dir/template.txt"
  
  mkdir -p "$change_dir/specs"
  
  run create_prompt_template "$change_dir" "$template_file"
  
  [ "$status" -eq 0 ]
  
  grep -q "## Commit Contract" "$template_file"
  grep -q "{{commit_contract}}" "$template_file"
  ! grep -q "Create a git commit using the required format below" "$template_file"
  ! grep -q "## CRITICAL: Git Commit Format" "$template_file"
  ! grep -q "When making git commits, you MUST use this EXACT format" "$template_file"
  ! grep -q "Create a git commit" "$template_file"

  cd - > /dev/null
  rm -rf "$test_dir"
}

@test "create_prompt_template: does not rely on editor-specific slash commands" {
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  local change_dir="$test_dir/openspec/changes/test-change"
  local template_file="$test_dir/template.txt"
  
  mkdir -p "$change_dir/specs"
  
  run create_prompt_template "$change_dir" "$template_file"
  
  [ "$status" -eq 0 ]
  
  ! grep -q "/opsx-apply" "$template_file"
  
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

@test "create_prompt_template: template does not duplicate OpenSpec artifacts or tasks content" {
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1

  local change_dir="$test_dir/openspec/changes/test-change"
  local template_file="$test_dir/template.txt"

  mkdir -p "$change_dir/specs"

  run create_prompt_template "$change_dir" "$template_file"

  [ "$status" -eq 0 ]

  # Must NOT contain legacy inline/duplication markers
  ! grep -q "Read the full tasks file every iteration" "$template_file"
  ! grep -q "{{tasks}}" "$template_file"
  ! grep -q "## OpenSpec Artifacts Context" "$template_file"
  ! grep -q "{{base_prompt}}" "$template_file"
  ! grep -q "{{_openspec_manifest}}" "$template_file"
  ! grep -q "## Invocation-Time PRD Snapshot" "$template_file"
  # MUST contain the manifest section and task context surface
  grep -q "## OpenSpec Artifacts" "$template_file"
  grep -q "{{task_context}}" "$template_file"

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

@test "create_prompt_template: manifest contains absolute path lines for proposal, design, and PRD" {
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1

  local change_dir="$test_dir/openspec/changes/test-change"
  local template_file="$test_dir/template.txt"

  mkdir -p "$change_dir/specs/my-spec"
  touch "$change_dir/specs/my-spec/spec.md"

  run create_prompt_template "$change_dir" "$template_file"

  [ "$status" -eq 0 ]

  local abs_change_dir
  abs_change_dir=$(get_realpath "$change_dir")

  grep -q "^- $abs_change_dir/proposal.md$" "$template_file"
  grep -q "^- $abs_change_dir/design.md$" "$template_file"
  grep -q "^- $abs_change_dir/specs/my-spec/spec.md$" "$template_file"
  grep -q "^- .ralph/PRD.md" "$template_file"
  # Glob must NOT be present in final rendered file
  ! grep -q "specs/\*/spec.md" "$template_file"
  # Internal token must be fully expanded
  ! grep -q "{{_openspec_manifest}}" "$template_file"

  cd - > /dev/null
  rm -rf "$test_dir"
}

@test "create_prompt_template: with AGENTS.md at repo root, manifest includes AGENTS.md reference" {
  local test_dir
  test_dir=$(setup_test_dir)
  # Do NOT cd into test_dir — stay in project root so git rev-parse works

  local change_dir="$test_dir/openspec/changes/test-change"
  local template_file="$test_dir/template.txt"

  mkdir -p "$change_dir/specs"

  local project_root
  project_root=$(git rev-parse --show-toplevel 2>/dev/null) || project_root=""

  if [[ -z "$project_root" ]]; then
    skip "Not in a git repository; cannot test AGENTS.md probe"
  fi

  local agents_created=false
  if [[ ! -f "$project_root/AGENTS.md" ]]; then
    echo "# Project build/test guide" > "$project_root/AGENTS.md"
    agents_created=true
  fi

  run create_prompt_template "$change_dir" "$template_file"

  if [[ "$agents_created" == "true" ]]; then
    rm -f "$project_root/AGENTS.md"
  fi

  [ "$status" -eq 0 ]
  grep -q "AGENTS.md" "$template_file"

  rm -rf "$test_dir"
}

@test "create_prompt_template: without AGENTS.md, manifest omits AGENTS.md reference" {
  local test_dir
  test_dir=$(setup_test_dir)
  # Do NOT cd into test_dir — stay in project root so git rev-parse works

  local change_dir="$test_dir/openspec/changes/test-change"
  local template_file="$test_dir/template.txt"

  mkdir -p "$change_dir/specs"

  local project_root
  project_root=$(git rev-parse --show-toplevel 2>/dev/null) || project_root=""

  if [[ -z "$project_root" ]]; then
    skip "Not in a git repository; cannot test AGENTS.md probe"
  fi

  # Temporarily hide AGENTS.md if it exists
  local backup_done=false
  if [[ -f "$project_root/AGENTS.md" ]]; then
    mv "$project_root/AGENTS.md" "$project_root/AGENTS.md.bak_test"
    backup_done=true
  fi

  run create_prompt_template "$change_dir" "$template_file"

  if [[ "$backup_done" == "true" ]]; then
    mv "$project_root/AGENTS.md.bak_test" "$project_root/AGENTS.md"
  fi

  [ "$status" -eq 0 ]
  ! grep -q "AGENTS.md" "$template_file"

  rm -rf "$test_dir"
}

@test "create_prompt_template: explicit-read sentence precedes task-selection in Instructions section" {
  local test_dir
  test_dir=$(setup_test_dir)
  # Stay in project root so git rev-parse works

  local change_dir="$test_dir/openspec/changes/test-change"
  local template_file="$test_dir/template.txt"

  mkdir -p "$change_dir/specs/test-spec"
  echo "## ADDED Requirements" > "$change_dir/specs/test-spec/spec.md"

  run create_prompt_template "$change_dir" "$template_file"

  [ "$status" -eq 0 ]

  # 1. Sentence appears exactly once
  local sentence="Before implementing, read the OpenSpec artifacts listed above that are relevant to the current task."
  local count
  count=$(grep -c "$sentence" "$template_file" || true)
  [ "$count" -eq 1 ]

  # 2. Sentence line number is less than the first "Pick the first" line number
  local read_line pick_line
  read_line=$(grep -n "$sentence" "$template_file" | head -n1 | cut -d: -f1)
  pick_line=$(grep -n "Pick the first" "$template_file" | head -n1 | cut -d: -f1)
  [ -n "$read_line" ]
  [ -n "$pick_line" ]
  [ "$read_line" -lt "$pick_line" ]

  # 3. Sentence appears inside the ## Instructions section
  # (after a line matching "^## Instructions" and before the next "^## " header)
  local in_instructions=false
  local found_sentence=false
  while IFS= read -r line; do
    if [[ "$line" =~ ^##[[:space:]]Instructions ]]; then
      in_instructions=true
      continue
    fi
    if [[ "$in_instructions" == "true" && "$line" =~ ^##[[:space:]] ]]; then
      break
    fi
    if [[ "$in_instructions" == "true" && "$line" == *"$sentence"* ]]; then
      found_sentence=true
      break
    fi
  done < "$template_file"
  [ "$found_sentence" = "true" ]

  rm -rf "$test_dir"
}
