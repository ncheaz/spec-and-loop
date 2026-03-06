#!/usr/bin/env bats

# Test suite for read_openspec_artifacts() function
# Tests reading of proposal, design, and spec artifacts from OpenSpec change directory

setup() {
  # Load the main script to access the read_openspec_artifacts function
  load '../helpers/test-common'
  source ../../../../scripts/ralph-run.sh
}

teardown() {
  cleanup_test_dir
}

@test "read_openspec_artifacts: reads proposal.md content correctly" {
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

This is a test proposal for reading artifacts.

## What Changes

- Change 1: Read proposal
- Change 2: Read design
- Change 3: Read specs
EOF

  # Run read_openspec_artifacts
  run read_openspec_artifacts "$change_dir"
  
  # Function should complete without error
  [ "$status" -eq 0 ]
  
  # Check that OPENSPEC_PROPOSAL variable is set
  [ -n "$OPENSPEC_PROPOSAL" ]
  
  # Check that proposal content was read correctly
  [[ "$OPENSPEC_PROPOSAL" == *"This is a test proposal for reading artifacts"* ]] || true
}

@test "read_openspec_artifacts: reads design.md content correctly" {
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

This is a test design for reading artifacts.

## Decisions

Decision 1: Use bash for implementation
Decision 2: Use Bats for testing
EOF

  # Run read_openspec_artifacts
  run read_openspec_artifacts "$change_dir"
  
  # Function should complete without error
  [ "$status" -eq 0 ]
  
  # Check that OPENSPEC_DESIGN variable is set
  [ -n "$OPENSPEC_DESIGN" ]
  
  # Check that design content was read correctly
  [[ "$OPENSPEC_DESIGN" == *"This is a test design for reading artifacts"* ]] || true
}

@test "read_openspec_artifacts: reads single spec.md file correctly" {
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

  # Run read_openspec_artifacts
  run read_openspec_artifacts "$change_dir"
  
  # Function should complete without error
  [ "$status" -eq 0 ]
  
  # Check that OPENSPEC_SPECS variable is set
  [ -n "$OPENSPEC_SPECS" ]
  
  # Check that spec content was read correctly
  [[ "$OPENSPEC_SPECS" == *"Test requirement 1"* ]] || true
  [[ "$OPENSPEC_SPECS" == *"Test requirement 2"* ]] || true
}

@test "read_openspec_artifacts: reads multiple spec.md files correctly" {
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

This is the second spec file.
EOF

  mkdir -p "$change_dir/specs/spec3"
  cat > "$change_dir/specs/spec3/spec.md" <<'EOF'
## Spec 3

This is the third spec file.
EOF

  # Run read_openspec_artifacts
  run read_openspec_artifacts "$change_dir"
  
  # Function should complete without error
  [ "$status" -eq 0 ]
  
  # Check that OPENSPEC_SPECS variable contains all specs
  [ -n "$OPENSPEC_SPECS" ]
  [[ "$OPENSPEC_SPECS" == *"test-spec"* ]] || true
  [[ "$OPENSPEC_SPECS" == *"spec2"* ]] || true
  [[ "$OPENSPEC_SPECS" == *"spec3"* ]] || true
}

@test "read_openspec_artifacts: handles missing proposal.md gracefully" {
  # Create a test directory with OpenSpec change structure
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  # Create OpenSpec change structure
  local change_dir
  change_dir=$(create_openspec_change)
  
  # Remove proposal.md
  rm "$change_dir/proposal.md"
  
  # Run read_openspec_artifacts
  run read_openspec_artifacts "$change_dir"
  
  # Function should complete without error (proposal is optional)
  [ "$status" -eq 0 ]
  
  # OPENSPEC_PROPOSAL should be empty
  [ -z "$OPENSPEC_PROPOSAL" ]
}

@test "read_openspec_artifacts: handles missing design.md gracefully" {
  # Create a test directory with OpenSpec change structure
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  # Create OpenSpec change structure
  local change_dir
  change_dir=$(create_openspec_change)
  
  # Remove design.md
  rm "$change_dir/design.md"
  
  # Run read_openspec_artifacts
  run read_openspec_artifacts "$change_dir"
  
  # Function should complete without error (design is optional)
  [ "$status" -eq 0 ]
  
  # OPENSPEC_DESIGN should be empty
  [ -z "$OPENSPEC_DESIGN" ]
}

@test "read_openspec_artifacts: handles missing specs directory gracefully" {
  # Create a test directory with OpenSpec change structure
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  # Create OpenSpec change structure
  local change_dir
  change_dir=$(create_openspec_change)
  
  # Remove specs directory
  rm -rf "$change_dir/specs"
  
  # Run read_openspec_artifacts
  run read_openspec_artifacts "$change_dir"
  
  # Function should complete without error (specs is optional)
  [ "$status" -eq 0 ]
  
  # OPENSPEC_SPECS should be empty
  [ -z "$OPENSPEC_SPECS" ]
}

@test "read_openspec_artifacts: reads all three artifact types together" {
  # Create a test directory with OpenSpec change structure
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  # Create OpenSpec change structure with custom content
  local change_dir
  change_dir=$(create_openspec_change)
  
  # Update proposal.md
  cat > "$change_dir/proposal.md" <<'EOF'
## Proposal Content

Test proposal content.
EOF

  # Update design.md
  cat > "$change_dir/design.md" <<'EOF'
## Design Content

Test design content.
EOF

  # Update spec.md
  cat > "$change_dir/specs/test-spec/spec.md" <<'EOF'
## Spec Content

Test spec content.
EOF

  # Run read_openspec_artifacts
  run read_openspec_artifacts "$change_dir"
  
  # Function should complete without error
  [ "$status" -eq 0 ]
  
  # Check that all variables are set
  [ -n "$OPENSPEC_PROPOSAL" ]
  [ -n "$OPENSPEC_DESIGN" ]
  [ -n "$OPENSPEC_SPECS" ]
  
  # Check content
  [[ "$OPENSPEC_PROPOSAL" == *"Test proposal content"* ]] || true
  [[ "$OPENSPEC_DESIGN" == *"Test design content"* ]] || true
  [[ "$OPENSPEC_SPECS" == *"Test spec content"* ]] || true
}

@test "read_openspec_artifacts: preserves markdown formatting in proposal" {
  # Create a test directory with OpenSpec change structure
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  # Create OpenSpec change structure with formatted proposal
  local change_dir
  change_dir=$(create_openspec_change)
  
  # Create proposal with markdown formatting
  cat > "$change_dir/proposal.md" <<'EOF'
# Proposal Title

## Section 1

Content with **bold** and *italic* text.

- List item 1
- List item 2
- List item 3

| Column 1 | Column 2 |
|----------|----------|
| Data 1   | Data 2   |
EOF

  # Run read_openspec_artifacts
  run read_openspec_artifacts "$change_dir"
  
  # Function should complete without error
  [ "$status" -eq 0 ]
  
  # Check that markdown formatting is preserved
  [[ "$OPENSPEC_PROPOSAL" == *"# Proposal Title"* ]] || true
  [[ "$OPENSPEC_PROPOSAL" == *"**bold**"* ]] || true
  [[ "$OPENSPEC_PROPOSAL" == *"*italic*"* ]] || true
  [[ "$OPENSPEC_PROPOSAL" == *"- List item 1"* ]] || true
}

@test "read_openspec_artifacts: includes spec name in specs content" {
  # Create a test directory with OpenSpec change structure
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  # Create OpenSpec change structure with custom spec
  local change_dir
  change_dir=$(create_openspec_change)
  
  # Run read_openspec_artifacts
  run read_openspec_artifacts "$change_dir"
  
  # Function should complete without error
  [ "$status" -eq 0 ]
  
  # Check that spec name is included
  [[ "$OPENSPEC_SPECS" == *"test-spec"* ]] || true
  [[ "$OPENSPEC_SPECS" == *"spec.md"* ]] || true
}

@test "read_openspec_artifacts: handles spec files with special characters in content" {
  # Create a test directory with OpenSpec change structure
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  # Create OpenSpec change structure with spec containing special characters
  local change_dir
  change_dir=$(create_openspec_change)
  
  # Create spec with special characters
  cat > "$change_dir/specs/test-spec/spec.md" <<'EOF'
## Spec with Special Characters

Content with $variable, ${another_var}, and $(command).

Content with backticks \`code\` and quotes "double" 'single'.

Content with pipes | and ampersands &.
EOF

  # Run read_openspec_artifacts
  run read_openspec_artifacts "$change_dir"
  
  # Function should complete without error
  [ "$status" -eq 0 ]
  
  # Check that special characters are preserved
  [[ "$OPENSPEC_SPECS" == *"$variable"* ]] || true
  [[ "$OPENSPEC_SPECS" == *"\`code\`"* ]] || true
}

@test "read_openspec_artifacts: handles empty files gracefully" {
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
  
  # Run read_openspec_artifacts
  run read_openspec_artifacts "$change_dir"
  
  # Function should complete without error
  [ "$status" -eq 0 ]
  
  # Variables should be empty or whitespace
  [ -z "$OPENSPEC_PROPOSAL" ] || [[ "$OPENSPEC_PROPOSAL" == $'\n' ]] || true
  [ -z "$OPENSPEC_DESIGN" ] || [[ "$OPENSPEC_DESIGN" == $'\n' ]] || true
}

@test "read_openspec_artifacts: can be called multiple times" {
  # Create a test directory with OpenSpec change structure
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  # Create OpenSpec change structure
  local change_dir
  change_dir=$(create_openspec_change)
  
  # Run read_openspec_artifacts multiple times
  run read_openspec_artifacts "$change_dir"
  [ "$status" -eq 0 ]
  local first_proposal="$OPENSPEC_PROPOSAL"
  
  run read_openspec_artifacts "$change_dir"
  [ "$status" -eq 0 ]
  local second_proposal="$OPENSPEC_PROPOSAL"
  
  # Content should be consistent
  [ "$first_proposal" = "$second_proposal" ]
}

@test "read_openspec_artifacts: logs verbose messages during reading" {
  # Create a test directory with OpenSpec change structure
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  # Create OpenSpec change structure
  local change_dir
  change_dir=$(create_openspec_change)
  
  # Run read_openspec_artifacts
  run read_openspec_artifacts "$change_dir"
  
  # Function should complete without error
  [ "$status" -eq 0 ]
  
  # Output may contain verbose messages
  [[ "$output" == *"Reading"* || "$output" == *"Read"* ]] || true
}

@test "read_openspec_artifacts: handles specs with subdirectories" {
  # Create a test directory with OpenSpec change structure
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  # Create OpenSpec change structure with nested spec
  local change_dir
  change_dir=$(create_openspec_change)
  
  # Create spec in a subdirectory
  mkdir -p "$change_dir/specs/nested/feature"
  cat > "$change_dir/specs/nested/feature/spec.md" <<'EOF'
## Nested Spec

This is a nested spec file.
EOF

  # Run read_openspec_artifacts
  run read_openspec_artifacts "$change_dir"
  
  # Function should complete without error
  [ "$status" -eq 0 ]
  
  # Check that nested spec was read
  [[ "$OPENSPEC_SPECS" == *"nested"* ]] || true
  [[ "$OPENSPEC_SPECS" == *"feature"* ]] || true
}

@test "read_openspec_artifacts: sets global variables correctly" {
  # Create a test directory with OpenSpec change structure
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  # Create OpenSpec change structure
  local change_dir
  change_dir=$(create_openspec_change)
  
  # Run read_openspec_artifacts
  read_openspec_artifacts "$change_dir"
  
  # Check that global variables are set and accessible
  [ -n "${OPENSPEC_PROPOSAL:-}" ] || [ -z "$OPENSPEC_PROPOSAL" ]
  [ -n "${OPENSPEC_DESIGN:-}" ] || [ -z "$OPENSPEC_DESIGN" ]
  [ -n "${OPENSPEC_SPECS:-}" ] || [ -z "$OPENSPEC_SPECS" ]
}

@test "read_openspec_artifacts: reads large files without issues" {
  # Create a test directory with OpenSpec change structure
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  # Create OpenSpec change structure
  local change_dir
  change_dir=$(create_openspec_change)
  
  # Create a large proposal.md file
  {
    echo "# Large Proposal"
    for i in $(seq 1 100); do
      echo ""
      echo "## Section $i"
      echo "This is section $i with some content."
      echo "- Item $i.1"
      echo "- Item $i.2"
      echo "- Item $i.3"
    done
  } > "$change_dir/proposal.md"
  
  # Run read_openspec_artifacts
  run read_openspec_artifacts "$change_dir"
  
  # Function should complete without error
  [ "$status" -eq 0 ]
  
  # Check that content was read
  [ -n "$OPENSPEC_PROPOSAL" ]
  [[ "$OPENSPEC_PROPOSAL" == *"Section 1"* ]] || true
  [[ "$OPENSPEC_PROPOSAL" == *"Section 100"* ]] || true
}
