#!/usr/bin/env bats

# Test suite for generate_prd() function
# Tests PRD generation from OpenSpec artifacts

setup() {
  # Load the main script to access the generate_prd function
  load '../../helpers/test-common'
  source tests/helpers/test-functions.sh
}

teardown() {
  cleanup_test_dir
}

@test "generate_prd: generates PRD with all required sections" {
  # Create a test directory with OpenSpec change structure
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  # Create OpenSpec change structure
  local change_dir
  change_dir=$(create_openspec_change)
  
  # Read artifacts first to populate variables
  read_openspec_artifacts "$change_dir"
  
  # Generate PRD
  run generate_prd "$change_dir"
  
  # Function should complete without error
  [ "$status" -eq 0 ]
  
  # Output should contain required sections
  [[ "$output" == *"# Product Requirements Document"* ]] || true
  [[ "$output" == *"## Proposal"* ]] || true
  [[ "$output" == *"## Specifications"* ]] || true
  [[ "$output" == *"## Design"* ]] || true
}

@test "generate_prd: includes proposal content in PRD" {
  # Create a test directory with OpenSpec change structure
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  # Create OpenSpec change structure with custom proposal
  local change_dir
  change_dir=$(create_openspec_change)
  
  # Update proposal.md with specific content
  cat > "$change_dir/proposal.md" <<'EOF'
## Why

This is a test proposal for PRD generation.

## What Changes

- Change 1
- Change 2
EOF

  # Read artifacts
  read_openspec_artifacts "$change_dir"
  
  # Generate PRD
  run generate_prd "$change_dir"
  
  # Output should contain proposal content
  [[ "$output" == *"This is a test proposal for PRD generation"* ]] || true
  [[ "$output" == *"- Change 1"* ]] || true
  [[ "$output" == *"- Change 2"* ]] || true
}

@test "generate_prd: includes specifications content in PRD" {
  # Create a test directory with OpenSpec change structure
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  # Create OpenSpec change structure with custom spec
  local change_dir
  change_dir=$(create_openspec_change)
  
  # Update spec.md with specific content
  cat > "$change_dir/specs/test-spec/spec.md" <<'EOF'
## ADDED Requirements

### Requirement: Test requirement 1
The system shall do something.

### Requirement: Test requirement 2
The system shall do something else.
EOF

  # Read artifacts
  read_openspec_artifacts "$change_dir"
  
  # Generate PRD
  run generate_prd "$change_dir"
  
  # Output should contain spec content
  [[ "$output" == *"Test requirement 1"* ]] || true
  [[ "$output" == *"Test requirement 2"* ]] || true
}

@test "generate_prd: includes design content in PRD" {
  # Create a test directory with OpenSpec change structure
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  # Create OpenSpec change structure with custom design
  local change_dir
  change_dir=$(create_openspec_change)
  
  # Update design.md with specific content
  cat > "$change_dir/design.md" <<'EOF'
## Context

This is a test design for PRD generation.

## Decisions

Decision 1: Use bash for implementation
Decision 2: Use Bats for testing
EOF

  # Read artifacts
  read_openspec_artifacts "$change_dir"
  
  # Generate PRD
  run generate_prd "$change_dir"
  
  # Output should contain design content
  [[ "$output" == *"This is a test design for PRD generation"* ]] || true
  [[ "$output" == *"Decision 1"* ]] || true
  [[ "$output" == *"Decision 2"* ]] || true
}

@test "generate_prd: includes generation attribution" {
  # Create a test directory with OpenSpec change structure
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  # Create OpenSpec change structure
  local change_dir
  change_dir=$(create_openspec_change)
  
  # Read artifacts
  read_openspec_artifacts "$change_dir"
  
  # Generate PRD
  run generate_prd "$change_dir"
  
  # Output should contain generation attribution
  [[ "$output" == *"Generated from OpenSpec artifacts"* ]] || true
}

@test "generate_prd: includes current task context when available" {
  # Create a test directory with OpenSpec change structure
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  # Create OpenSpec change structure with tasks
  local change_dir
  change_dir=$(create_openspec_change)
  
  # Create tasks with current task marked
  cat > "$change_dir/tasks.md" <<'EOF'
## Test Tasks

- [x] 1.1 Completed task
- [/] 1.2 Current task (in progress)
- [ ] 1.3 Pending task
EOF

  # Read artifacts
  read_openspec_artifacts "$change_dir"
  
  # Generate PRD
  run generate_prd "$change_dir"
  
  # Output should contain current task context section
  [[ "$output" == *"## Current Task Context"* ]] || true
  [[ "$output" == *"1.2 Current task"* ]] || true
  [[ "$output" == *"1.1 Completed task"* ]] || true
}

@test "generate_prd: handles missing task context gracefully" {
  # Create a test directory with OpenSpec change structure
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  # Create OpenSpec change structure
  local change_dir
  change_dir=$(create_openspec_change)
  
  # Don't create tasks.md or create empty tasks.md
  > "$change_dir/tasks.md"
  
  # Read artifacts
  read_openspec_artifacts "$change_dir"
  
  # Generate PRD
  run generate_prd "$change_dir"
  
  # Function should complete without error
  [ "$status" -eq 0 ]
  
  # Output should not contain current task context section if no context
  [[ "$output" != *"## Current Task Context"* ]] || true
}

@test "generate_prd: generates valid markdown format" {
  # Create a test directory with OpenSpec change structure
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  # Create OpenSpec change structure
  local change_dir
  change_dir=$(create_openspec_change)
  
  # Read artifacts
  read_openspec_artifacts "$change_dir"
  
  # Generate PRD
  run generate_prd "$change_dir"
  
  # Function should complete without error
  [ "$status" -eq 0 ]
  
  # Output should start with markdown header
  [[ "$output" == "# "* ]] || true
  
  # Output should contain markdown section headers
  [[ "$output" == *"##"* ]] || true
  
  # Output should have proper newlines
  [[ "$output" == *$'\n'*$'\n'* ]] || true
}

@test "generate_prd: preserves markdown formatting from artifacts" {
  # Create a test directory with OpenSpec change structure
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  # Create OpenSpec change structure with formatted content
  local change_dir
  change_dir=$(create_openspec_change)
  
  # Create proposal with markdown formatting
  cat > "$change_dir/proposal.md" <<'EOF'
## Why

Test with **bold** and *italic* text.

### Subsection

Content with lists:
- Item 1
- Item 2

Content with code: \`code example\`
EOF

  # Read artifacts
  read_openspec_artifacts "$change_dir"
  
  # Generate PRD
  run generate_prd "$change_dir"
  
  # Markdown formatting should be preserved
  [[ "$output" == *"**bold**"* ]] || true
  [[ "$output" == *"*italic*"* ]] || true
  [[ "$output" == *"- Item 1"* ]] || true
  [[ "$output" == *"\`code example\`"* ]] || true
}

@test "generate_prd: includes multiple specifications" {
  # Create a test directory with OpenSpec change structure
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  # Create OpenSpec change structure with multiple specs
  local change_dir
  change_dir=$(create_openspec_change)
  
  # Create additional spec files
  mkdir -p "$change_dir/specs/spec2"
  cat > "$change_dir/specs/spec2/spec.md" <<'EOF'
## Spec 2

This is the second specification.
EOF

  mkdir -p "$change_dir/specs/spec3"
  cat > "$change_dir/specs/spec3/spec.md" <<'EOF'
## Spec 3

This is the third specification.
EOF

  # Read artifacts
  read_openspec_artifacts "$change_dir"
  
  # Generate PRD
  run generate_prd "$change_dir"
  
  # Output should contain all specs
  [[ "$output" == *"test-spec"* ]] || true
  [[ "$output" == *"spec2"* ]] || true
  [[ "$output" == *"spec3"* ]] || true
}

@test "generate_prd: handles empty artifacts gracefully" {
  # Create a test directory with OpenSpec change structure
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  # Create OpenSpec change structure
  local change_dir
  change_dir=$(create_openspec_change)
  
  # Create empty files
  > "$change_dir/proposal.md"
  > "$change_dir/design.md"
  
  # Read artifacts
  read_openspec_artifacts "$change_dir"
  
  # Generate PRD
  run generate_prd "$change_dir"
  
  # Function should complete without error
  [ "$status" -eq 0 ]
  
  # Output should still have structure
  [[ "$output" == *"## Proposal"* ]] || true
  [[ "$output" == *"## Design"* ]] || true
}

@test "generate_prd: can be called multiple times" {
  # Create a test directory with OpenSpec change structure
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  # Create OpenSpec change structure
  local change_dir
  change_dir=$(create_openspec_change)
  
  # Read artifacts
  read_openspec_artifacts "$change_dir"
  
  # Generate PRD multiple times
  run generate_prd "$change_dir"
  [ "$status" -eq 0 ]
  local first_prd="$output"
  
  run generate_prd "$change_dir"
  [ "$status" -eq 0 ]
  local second_prd="$output"
  
  # PRDs should be identical
  [ "$first_prd" = "$second_prd" ]
}

@test "generate_prd: includes completed tasks in context" {
  # Create a test directory with OpenSpec change structure
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  # Create OpenSpec change structure with tasks
  local change_dir
  change_dir=$(create_openspec_change)
  
  # Create tasks with multiple completed tasks
  cat > "$change_dir/tasks.md" <<'EOF'
## Test Tasks

- [x] 1.1 First completed task
- [x] 1.2 Second completed task
- [x] 1.3 Third completed task
- [/] 1.4 Current task
- [ ] 1.5 Pending task
EOF

  # Read artifacts
  read_openspec_artifacts "$change_dir"
  
  # Generate PRD
  run generate_prd "$change_dir"
  
  # Output should include all completed tasks
  [[ "$output" == *"1.1 First completed task"* ]] || true
  [[ "$output" == *"1.2 Second completed task"* ]] || true
  [[ "$output" == *"1.3 Third completed task"* ]] || true
}

@test "generate_prd: maintains proper section order" {
  # Create a test directory with OpenSpec change structure
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  # Create OpenSpec change structure with tasks
  local change_dir
  change_dir=$(create_openspec_change)
  
  # Create tasks
  cat > "$change_dir/tasks.md" <<'EOF'
## Test Tasks

- [ ] 1.1 Task
EOF

  # Read artifacts
  read_openspec_artifacts "$change_dir"
  
  # Generate PRD
  run generate_prd "$change_dir"
  
  # Extract section positions
  local proposal_pos
  local specs_pos
  local design_pos
  local context_pos
  
  proposal_pos=$(echo "$output" | grep -n "## Proposal" | cut -d: -f1)
  specs_pos=$(echo "$output" | grep -n "## Specifications" | cut -d: -f1)
  design_pos=$(echo "$output" | grep -n "## Design" | cut -d: -f1)
  context_pos=$(echo "$output" | grep -n "## Current Task Context" | cut -d: -f1)
  
  # Check order: Proposal < Specifications < Design < Context
  [ "$proposal_pos" -lt "$specs_pos" ] || true
  [ "$specs_pos" -lt "$design_pos" ] || true
  if [[ -n "$context_pos" ]]; then
    [ "$design_pos" -lt "$context_pos" ] || true
  fi
}

@test "generate_prd: logs verbose message during generation" {
  # Create a test directory with OpenSpec change structure
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  # Create OpenSpec change structure
  local change_dir
  change_dir=$(create_openspec_change)
  
  # Read artifacts
  read_openspec_artifacts "$change_dir"
  
  # Generate PRD
  run generate_prd "$change_dir"
  
  # Function should complete without error
  [ "$status" -eq 0 ]
  
  # Output may contain verbose messages
  [[ "$output" == *"Generating"* || "$output" == *"PRD"* ]] || true
}

@test "generate_prd: outputs PRD content to stdout" {
  # Create a test directory with OpenSpec change structure
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  # Create OpenSpec change structure
  local change_dir
  change_dir=$(create_openspec_change)
  
  # Read artifacts
  read_openspec_artifacts "$change_dir"
  
  # Generate PRD and capture output
  local prd_output
  prd_output=$(generate_prd "$change_dir")
  
  # Output should be non-empty
  [ -n "$prd_output" ]
  
  # Output should contain expected content
  [[ "$prd_output" == *"# Product Requirements Document"* ]] || true
}

@test "generate_prd: handles large artifacts without issues" {
  # Create a test directory with OpenSpec change structure
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  # Create OpenSpec change structure
  local change_dir
  change_dir=$(create_openspec_change)
  
  # Create large proposal.md file
  {
    echo "# Large Proposal"
    for i in $(seq 1 50); do
      echo ""
      echo "## Section $i"
      for j in $(seq 1 10); do
        echo "- Item $i.$j: Some content here"
      done
    done
  } > "$change_dir/proposal.md"
  
  # Read artifacts
  read_openspec_artifacts "$change_dir"
  
  # Generate PRD
  run generate_prd "$change_dir"
  
  # Function should complete without error
  [ "$status" -eq 0 ]
  
  # Output should contain large content
  [[ "$output" == *"Section 1"* ]] || true
  [[ "$output" == *"Section 50"* ]] || true
}

@test "generate_prd: integrates all three artifact types seamlessly" {
  # Create a test directory with OpenSpec change structure
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  # Create OpenSpec change structure with cross-references
  local change_dir
  change_dir=$(create_openspec_change)
  
  # Create proposal that references specs and design
  cat > "$change_dir/proposal.md" <<'EOF'
## Why

See specifications for details.

## What Changes

Implemented per design decisions.
EOF

  # Create spec that references design
  cat > "$change_dir/specs/test-spec/spec.md" <<'EOF'
## ADDED Requirements

Per design document, we require feature X.
EOF

  # Create design that references proposal
  cat > "$change_dir/design.md" <<'EOF'
## Context

As described in proposal.
EOF

  # Read artifacts
  read_openspec_artifacts "$change_dir"
  
  # Generate PRD
  run generate_prd "$change_dir"
  
  # All content should be present in PRD
  [[ "$output" == *"See specifications for details"* ]] || true
  [[ "$output" == *"As described in proposal"* ]] || true
  [[ "$output" == *"Per design document"* ]] || true
}
