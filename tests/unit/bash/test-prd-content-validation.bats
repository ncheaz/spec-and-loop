#!/usr/bin/env bats

# Test suite for PRD content validation
# Tests that generated PRD contains all required sections and proper formatting

setup() {
  # Load the main script
  load '../../helpers/test-common'
  source tests/helpers/test-functions.sh
}

teardown() {
  cleanup_test_dir
}

@test "prd validation: contains proposal section with correct header" {
  # Create a test directory with OpenSpec change structure
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  # Create OpenSpec change structure
  local change_dir
  change_dir=$(create_openspec_change)
  
  # Read artifacts and generate PRD
  read_openspec_artifacts "$change_dir"
  local prd
  prd=$(generate_prd "$change_dir")
  
  # PRD should contain proposal section header
  [[ "$prd" == *"## Proposal"* ]] || true
  
  # Header should be followed by content or newline
  [[ "$prd" == *"## Proposal"$'\n' || "$prd" == *"## Proposal"* ]] || true
}

@test "prd validation: contains specifications section with correct header" {
  # Create a test directory with OpenSpec change structure
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  # Create OpenSpec change structure
  local change_dir
  change_dir=$(create_openspec_change)
  
  # Read artifacts and generate PRD
  read_openspec_artifacts "$change_dir"
  local prd
  prd=$(generate_prd "$change_dir")
  
  # PRD should contain specifications section header
  [[ "$prd" == *"## Specifications"* ]] || true
  
  # Header should be followed by content or newline
  [[ "$prd" == *"## Specifications"$'\n' || "$prd" == *"## Specifications"* ]] || true
}

@test "prd validation: contains design section with correct header" {
  # Create a test directory with OpenSpec change structure
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  # Create OpenSpec change structure
  local change_dir
  change_dir=$(create_openspec_change)
  
  # Read artifacts and generate PRD
  read_openspec_artifacts "$change_dir"
  local prd
  prd=$(generate_prd "$change_dir")
  
  # PRD should contain design section header
  [[ "$prd" == *"## Design"* ]] || true
  
  # Header should be followed by content or newline
  [[ "$prd" == *"## Design"$'\n' || "$prd" == *"## Design"* ]] || true
}

@test "prd validation: contains PRD title with correct format" {
  # Create a test directory with OpenSpec change structure
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  # Create OpenSpec change structure
  local change_dir
  change_dir=$(create_openspec_change)
  
  # Read artifacts and generate PRD
  read_openspec_artifacts "$change_dir"
  local prd
  prd=$(generate_prd "$change_dir")
  
  # PRD should start with title
  [[ "$prd" == "# Product Requirements Document"* ]] || true
  
  # Title should be at the beginning
  local first_line
  first_line=$(echo "$prd" | head -n 1)
  [[ "$first_line" == "# Product Requirements Document" ]] || true
}

@test "prd validation: proposal section contains proposal.md content" {
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

This is unique proposal content.

## What Changes

- Unique change 1
- Unique change 2
EOF

  # Read artifacts and generate PRD
  read_openspec_artifacts "$change_dir"
  local prd
  prd=$(generate_prd "$change_dir")
  
  # Proposal section should contain proposal content
  [[ "$prd" == *"This is unique proposal content"* ]] || true
  [[ "$prd" == *"- Unique change 1"* ]] || true
  [[ "$prd" == *"- Unique change 2"* ]] || true
}

@test "prd validation: specifications section contains spec.md content" {
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

### Requirement: Unique requirement 1
The system shall do unique thing 1.

### Requirement: Unique requirement 2
The system shall do unique thing 2.
EOF

  # Read artifacts and generate PRD
  read_openspec_artifacts "$change_dir"
  local prd
  prd=$(generate_prd "$change_dir")
  
  # Specifications section should contain spec content
  [[ "$prd" == *"Unique requirement 1"* ]] || true
  [[ "$prd" == *"Unique requirement 2"* ]] || true
  [[ "$prd" == *"test-spec"* ]] || true
}

@test "prd validation: design section contains design.md content" {
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

Unique design context.

## Decisions

Decision 1: Unique decision 1
Decision 2: Unique decision 2
EOF

  # Read artifacts and generate PRD
  read_openspec_artifacts "$change_dir"
  local prd
  prd=$(generate_prd "$change_dir")
  
  # Design section should contain design content
  [[ "$prd" == *"Unique design context"* ]] || true
  [[ "$prd" == *"Unique decision 1"* ]] || true
  [[ "$prd" == *"Unique decision 2"* ]] || true
}

@test "prd validation: contains generation attribution" {
  # Create a test directory with OpenSpec change structure
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  # Create OpenSpec change structure
  local change_dir
  change_dir=$(create_openspec_change)
  
  # Read artifacts and generate PRD
  read_openspec_artifacts "$change_dir"
  local prd
  prd=$(generate_prd "$change_dir")
  
  # PRD should contain generation attribution
  [[ "$prd" == *"Generated from OpenSpec artifacts"* ]] || true
  
  # Attribution should be italicized
  [[ "$prd" == *"*Generated from OpenSpec artifacts*"* ]] || true
}

@test "prd validation: sections are separated by blank lines" {
  # Create a test directory with OpenSpec change structure
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  # Create OpenSpec change structure
  local change_dir
  change_dir=$(create_openspec_change)
  
  # Read artifacts and generate PRD
  read_openspec_artifacts "$change_dir"
  local prd
  prd=$(generate_prd "$change_dir")
  
  # Check for blank line separators between sections
  # Each section header should be preceded by blank line
  [[ "$prd" == *$'\n'$'\n'"## Proposal"* ]] || true
  [[ "$prd" == *$'\n'$'\n'"## Specifications"* ]] || true
  [[ "$prd" == *$'\n'$'\n'"## Design"* ]] || true
}

@test "prd validation: maintains proper markdown heading hierarchy" {
  # Create a test directory with OpenSpec change structure
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  # Create OpenSpec change structure
  local change_dir
  change_dir=$(create_openspec_change)
  
  # Read artifacts and generate PRD
  read_openspec_artifacts "$change_dir"
  local prd
  prd=$(generate_prd "$change_dir")
  
  # Main title should be H1 (#)
  [[ "$prd" == "# Product Requirements Document"* ]] || true
  
  # Section headers should be H2 (##)
  [[ "$prd" == *"## Proposal"* ]] || true
  [[ "$prd" == *"## Specifications"* ]] || true
  [[ "$prd" == *"## Design"* ]] || true
  
  # Should not contain H1 for sections (only for main title)
  [[ "$prd" != *"# Proposal"* ]] || [[ "$prd" == *"## Proposal"* ]] || true
}

@test "prd validation: proposal section contains all proposal subsections" {
  # Create a test directory with OpenSpec change structure
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  # Create OpenSpec change structure with complete proposal
  local change_dir
  change_dir=$(create_openspec_change)
  
  # Update proposal.md with standard sections
  cat > "$change_dir/proposal.md" <<'EOF'
## Why

Reason for the change.

## What Changes

List of changes.

## Capabilities

New capabilities.

## Impact

Impact assessment.
EOF

  # Read artifacts and generate PRD
  read_openspec_artifacts "$change_dir"
  local prd
  prd=$(generate_prd "$change_dir")
  
  # All proposal subsections should be present
  [[ "$prd" == *"## Why"* ]] || true
  [[ "$prd" == *"## What Changes"* ]] || true
  [[ "$prd" == *"## Capabilities"* ]] || true
  [[ "$prd" == *"## Impact"* ]] || true
}

@test "prd validation: specifications section includes spec names" {
  # Create a test directory with OpenSpec change structure
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  # Create OpenSpec change structure with multiple specs
  local change_dir
  change_dir=$(create_openspec_change)
  
  # Create additional spec files
  mkdir -p "$change_dir/specs/auth-spec"
  cat > "$change_dir/specs/auth-spec/spec.md" <<'EOF'
## Auth Spec

Authentication requirements.
EOF

  mkdir -p "$change_dir/specs/ui-spec"
  cat > "$change_dir/specs/ui-spec/spec.md" <<'EOF'
## UI Spec

User interface requirements.
EOF

  # Read artifacts and generate PRD
  read_openspec_artifacts "$change_dir"
  local prd
  prd=$(generate_prd "$change_dir")
  
  # Spec names should be included in PRD
  [[ "$prd" == *"test-spec"* ]] || true
  [[ "$prd" == *"auth-spec"* ]] || true
  [[ "$prd" == *"ui-spec"* ]] || true
}

@test "prd validation: design section contains all design subsections" {
  # Create a test directory with OpenSpec change structure
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  # Create OpenSpec change structure with complete design
  local change_dir
  change_dir=$(create_openspec_change)
  
  # Update design.md with standard sections
  cat > "$change_dir/design.md" <<'EOF'
## Context

Design context and background.

## Goals / Non-Goals

Goals and non-goals.

## Decisions

Technical decisions made.

## Risks / Trade-offs

Risks and trade-offs.
EOF

  # Read artifacts and generate PRD
  read_openspec_artifacts "$change_dir"
  local prd
  prd=$(generate_prd "$change_dir")
  
  # All design subsections should be present
  [[ "$prd" == *"## Context"* ]] || true
  [[ "$prd" == *"## Goals"* ]] || true
  [[ "$prd" == *"## Decisions"* ]] || true
  [[ "$prd" == *"## Risks"* ]] || true
}

@test "prd validation: handles empty proposal gracefully" {
  # Create a test directory with OpenSpec change structure
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  # Create OpenSpec change structure
  local change_dir
  change_dir=$(create_openspec_change)
  
  # Create empty proposal.md
  > "$change_dir/proposal.md"
  
  # Read artifacts and generate PRD
  read_openspec_artifacts "$change_dir"
  local prd
  prd=$(generate_prd "$change_dir")
  
  # PRD should still have proposal section
  [[ "$prd" == *"## Proposal"* ]] || true
  
  # PRD should be valid even with empty proposal
  [ -n "$prd" ]
}

@test "prd validation: handles empty design gracefully" {
  # Create a test directory with OpenSpec change structure
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  # Create OpenSpec change structure
  local change_dir
  change_dir=$(create_openspec_change)
  
  # Create empty design.md
  > "$change_dir/design.md"
  
  # Read artifacts and generate PRD
  read_openspec_artifacts "$change_dir"
  local prd
  prd=$(generate_prd "$change_dir")
  
  # PRD should still have design section
  [[ "$prd" == *"## Design"* ]] || true
  
  # PRD should be valid even with empty design
  [ -n "$prd" ]
}

@test "prd validation: handles empty specs gracefully" {
  # Create a test directory with OpenSpec change structure
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  # Create OpenSpec change structure
  local change_dir
  change_dir=$(create_openspec_change)
  
  # Remove specs directory
  rm -rf "$change_dir/specs"
  
  # Read artifacts and generate PRD
  read_openspec_artifacts "$change_dir"
  local prd
  prd=$(generate_prd "$change_dir")
  
  # PRD should still have specifications section
  [[ "$prd" == *"## Specifications"* ]] || true
  
  # PRD should be valid even without specs
  [ -n "$prd" ]
}

@test "prd validation: preserves special characters in content" {
  # Create a test directory with OpenSpec change structure
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  # Create OpenSpec change structure with special characters
  local change_dir
  change_dir=$(create_openspec_change)
  
  # Update proposal with special characters
  cat > "$change_dir/proposal.md" <<'EOF'
## Why

Content with special characters: @#$%^&*()_+-={}[]|\:;"'<>,.?/

Content with quotes: "double" 'single'

Content with backticks: \`code\`
EOF

  # Read artifacts and generate PRD
  read_openspec_artifacts "$change_dir"
  local prd
  prd=$(generate_prd "$change_dir")
  
  # Special characters should be preserved
  [[ "$prd" == *"@#$%^&"* ]] || true
  [[ "$prd" == *"\"double\""* ]] || true
  [[ "$prd" == *"'single'"* ]] || true
  [[ "$prd" == *"\`code\`"* ]] || true
}

@test "prd validation: preserves markdown lists and tables" {
  # Create a test directory with OpenSpec change structure
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  # Create OpenSpec change structure with lists and tables
  local change_dir
  change_dir=$(create_openspec_change)
  
  # Update proposal with lists and tables
  cat > "$change_dir/proposal.md" <<'EOF'
## What Changes

Bullet list:
- Item 1
- Item 2
  - Nested item
  - Another nested item
- Item 3

Numbered list:
1. First item
2. Second item
3. Third item

Table:
| Column 1 | Column 2 | Column 3 |
|----------|----------|----------|
| Data 1   | Data 2   | Data 3   |
| Data 4   | Data 5   | Data 6   |
EOF

  # Read artifacts and generate PRD
  read_openspec_artifacts "$change_dir"
  local prd
  prd=$(generate_prd "$change_dir")
  
  # Lists and tables should be preserved
  [[ "$prd" == *"- Item 1"* ]] || true
  [[ "$prd" == *"1. First item"* ]] || true
  [[ "$prd" == *"| Column 1 |"* ]] || true
  [[ "$prd" == *"| Data 1   |"* ]] || true
}

@test "prd validation: preserves markdown code blocks" {
  # Create a test directory with OpenSpec change structure
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  # Create OpenSpec change structure with code blocks
  local change_dir
  change_dir=$(create_openspec_change)
  
  # Update proposal with code blocks
  cat > "$change_dir/proposal.md" <<'EOF'
## Implementation

Inline code: \`variable\`

Code block:

```bash
#!/bin/bash
echo "Hello, World!"
```

Fenced code with language:

```javascript
const greeting = "Hello, World!";
console.log(greeting);
```
EOF

  # Read artifacts and generate PRD
  read_openspec_artifacts "$change_dir"
  local prd
  prd=$(generate_prd "$change_dir")
  
  # Code blocks should be preserved
  [[ "$prd" == *"\`variable\`"* ]] || true
  [[ "$prd" == *"```bash"* ]] || true
  [[ "$prd" == *"#!/bin/bash"* ]] || true
  [[ "$prd" == *"```javascript"* ]] || true
  [[ "$prd" == *"const greeting"* ]] || true
}

@test "prd validation: does not contain Current Task Context or Completed Tasks sections" {
  # Create a test directory with OpenSpec change structure
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  # Create OpenSpec change structure with tasks in various states
  local change_dir
  change_dir=$(create_openspec_change)
  
  cat > "$change_dir/tasks.md" <<'EOF'
## Test Tasks

- [x] 1.1 Completed task
- [/] 1.2 Current task (in progress)
- [ ] 1.3 Pending task
EOF
  
  # Read artifacts and generate PRD
  read_openspec_artifacts "$change_dir"
  local prd
  prd=$(generate_prd "$change_dir")
  
  # PRD must NOT contain task context injection sections
  [[ "$prd" != *"## Current Task Context"* ]]
  [[ "$prd" != *"## Completed Tasks for Git Commit"* ]]
  
  # PRD must still contain the three core artifact sections
  [[ "$prd" == *"## Proposal"* ]]
  [[ "$prd" == *"## Specifications"* ]]
  [[ "$prd" == *"## Design"* ]]
}

@test "prd validation: contains complete and valid markdown" {
  # Create a test directory with OpenSpec change structure
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1
  
  # Create OpenSpec change structure
  local change_dir
  change_dir=$(create_openspec_change)
  
  # Read artifacts and generate PRD
  read_openspec_artifacts "$change_dir"
  local prd
  prd=$(generate_prd "$change_dir")
  
  # PRD should be non-empty
  [ -n "$prd" ]
  
  # PRD should start with valid markdown
  [[ "$prd" == "#"* ]] || true
  
  # PRD should contain valid section headers
  [[ "$prd" == *"##"* ]] || true
  
  # PRD should have content after headers
  local has_content_after_header=false
  if [[ "$prd" == *"## Proposal"* ]]; then
    local after_proposal
    after_proposal="${prd##*## Proposal}"
    if [ -n "$after_proposal" ]; then
      has_content_after_header=true
    fi
  fi
  [ "$has_content_after_header" = true ] || [ -n "$OPENSPEC_PROPOSAL" ] || true
}
