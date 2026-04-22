#!/usr/bin/env bats

# Test suite for PRD task context omission
# Tests that generated PRD does NOT include ## Current Task Context or
# ## Completed Tasks for Git Commit, but DOES include ## Proposal, ## Specifications,
# ## Design — regardless of tasks.md checkbox state.

setup() {
  # Load the main script
  load '../../helpers/test-common'
  source tests/helpers/test-functions.sh
}

teardown() {
  cleanup_test_dir
}

@test "prd omits task context: does not include Current Task Context when task marked in progress" {
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1

  local change_dir
  change_dir=$(create_openspec_change)

  cat > "$change_dir/tasks.md" <<'EOF'
## Test Tasks

- [x] 1.1 Completed task
- [/] 1.2 Current task (in progress)
- [ ] 1.3 Pending task
EOF

  read_openspec_artifacts "$change_dir"
  local prd
  prd=$(generate_prd "$change_dir")

  # PRD must NOT contain task context sections
  [[ "$prd" != *"## Current Task Context"* ]]
  [[ "$prd" != *"## Completed Tasks for Git Commit"* ]]

  # PRD must still contain core artifact sections
  [[ "$prd" == *"## Proposal"* ]]
  [[ "$prd" == *"## Specifications"* ]]
  [[ "$prd" == *"## Design"* ]]
}

@test "prd omits task context: does not include completed tasks section with multiple completed" {
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1

  local change_dir
  change_dir=$(create_openspec_change)

  cat > "$change_dir/tasks.md" <<'EOF'
## Test Tasks

- [x] 1.1 First completed task
- [x] 1.2 Second completed task
- [x] 1.3 Third completed task
- [/] 1.4 Current task
- [ ] 1.5 Pending task
EOF

  read_openspec_artifacts "$change_dir"
  local prd
  prd=$(generate_prd "$change_dir")

  [[ "$prd" != *"## Current Task Context"* ]]
  [[ "$prd" != *"## Completed Tasks for Git Commit"* ]]

  [[ "$prd" == *"## Proposal"* ]]
  [[ "$prd" == *"## Specifications"* ]]
  [[ "$prd" == *"## Design"* ]]
}

@test "prd omits task context: does not include context with pending tasks only" {
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1

  local change_dir
  change_dir=$(create_openspec_change)

  cat > "$change_dir/tasks.md" <<'EOF'
## Test Tasks

- [x] 1.1 Completed task
- [/] 1.2 Current task
- [ ] 1.3 Pending task 1
- [ ] 1.4 Pending task 2
- [ ] 1.5 Pending task 3
EOF

  read_openspec_artifacts "$change_dir"
  local prd
  prd=$(generate_prd "$change_dir")

  [[ "$prd" != *"## Current Task Context"* ]]
  [[ "$prd" != *"## Completed Tasks for Git Commit"* ]]

  [[ "$prd" == *"## Proposal"* ]]
  [[ "$prd" == *"## Specifications"* ]]
  [[ "$prd" == *"## Design"* ]]
}

@test "prd omits task context: does not include context with tasks from multiple sections" {
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1

  local change_dir
  change_dir=$(create_openspec_change)

  cat > "$change_dir/tasks.md" <<'EOF'
## 1. Infrastructure Setup

- [x] 1.1 Setup task 1
- [x] 1.2 Setup task 2

## 2. Implementation

- [x] 2.1 Implement feature A
- [/] 2.2 Implement feature B
- [ ] 2.3 Implement feature C

## 3. Testing

- [x] 3.1 Write unit tests
- [ ] 3.2 Write integration tests
EOF

  read_openspec_artifacts "$change_dir"
  local prd
  prd=$(generate_prd "$change_dir")

  [[ "$prd" != *"## Current Task Context"* ]]
  [[ "$prd" != *"## Completed Tasks for Git Commit"* ]]

  [[ "$prd" == *"## Proposal"* ]]
  [[ "$prd" == *"## Specifications"* ]]
  [[ "$prd" == *"## Design"* ]]
}

@test "prd omits task context: does not include context with single completed task" {
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1

  local change_dir
  change_dir=$(create_openspec_change)

  cat > "$change_dir/tasks.md" <<'EOF'
## Test Tasks

- [x] 1.1 Only completed task
- [/] 1.2 Current task
EOF

  read_openspec_artifacts "$change_dir"
  local prd
  prd=$(generate_prd "$change_dir")

  [[ "$prd" != *"## Current Task Context"* ]]
  [[ "$prd" != *"## Completed Tasks for Git Commit"* ]]

  [[ "$prd" == *"## Proposal"* ]]
  [[ "$prd" == *"## Specifications"* ]]
  [[ "$prd" == *"## Design"* ]]
}

@test "prd omits task context: does not include context when no tasks are marked in progress" {
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1

  local change_dir
  change_dir=$(create_openspec_change)

  cat > "$change_dir/tasks.md" <<'EOF'
## Test Tasks

- [x] 1.1 Completed task
- [ ] 1.2 Pending task
- [ ] 1.3 Another pending task
EOF

  read_openspec_artifacts "$change_dir"
  local prd
  prd=$(generate_prd "$change_dir")

  [[ "$prd" != *"## Current Task Context"* ]]
  [[ "$prd" != *"## Completed Tasks for Git Commit"* ]]

  [[ "$prd" == *"## Proposal"* ]]
  [[ "$prd" == *"## Specifications"* ]]
  [[ "$prd" == *"## Design"* ]]
}

@test "prd omits task context: does not include context when tasks.md is empty" {
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1

  local change_dir
  change_dir=$(create_openspec_change)

  > "$change_dir/tasks.md"

  read_openspec_artifacts "$change_dir"
  local prd
  prd=$(generate_prd "$change_dir")

  [ -n "$prd" ]

  [[ "$prd" != *"## Current Task Context"* ]]
  [[ "$prd" != *"## Completed Tasks for Git Commit"* ]]

  [[ "$prd" == *"## Proposal"* ]]
  [[ "$prd" == *"## Specifications"* ]]
  [[ "$prd" == *"## Design"* ]]
}

@test "prd omits task context: does not include context with first task in progress" {
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1

  local change_dir
  change_dir=$(create_openspec_change)

  cat > "$change_dir/tasks.md" <<'EOF'
## Test Tasks

- [/] 1.1 First task (in progress)
- [ ] 1.2 Pending task
EOF

  read_openspec_artifacts "$change_dir"
  local prd
  prd=$(generate_prd "$change_dir")

  [[ "$prd" != *"## Current Task Context"* ]]
  [[ "$prd" != *"## Completed Tasks for Git Commit"* ]]

  [[ "$prd" == *"## Proposal"* ]]
  [[ "$prd" == *"## Specifications"* ]]
  [[ "$prd" == *"## Design"* ]]
}

@test "prd omits task context: does not include context with detailed task descriptions" {
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1

  local change_dir
  change_dir=$(create_openspec_change)

  cat > "$change_dir/tasks.md" <<'EOF'
## Implementation Tasks

- [x] 1.1 Create user authentication module with JWT tokens and password hashing
- [/] 1.2 Implement user profile CRUD operations with database integration
- [ ] 1.3 Add email verification for new user accounts
EOF

  read_openspec_artifacts "$change_dir"
  local prd
  prd=$(generate_prd "$change_dir")

  [[ "$prd" != *"## Current Task Context"* ]]
  [[ "$prd" != *"## Completed Tasks for Git Commit"* ]]

  [[ "$prd" == *"## Proposal"* ]]
  [[ "$prd" == *"## Specifications"* ]]
  [[ "$prd" == *"## Design"* ]]
}

@test "prd omits task context: does not include context with many completed tasks" {
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1

  local change_dir
  change_dir=$(create_openspec_change)

  cat > "$change_dir/tasks.md" <<'EOF'
## Test Tasks

- [x] 1.1 Completed 1
- [x] 1.2 Completed 2
- [x] 1.3 Completed 3
- [x] 1.4 Completed 4
- [x] 1.5 Completed 5
- [/] 1.6 Current task
EOF

  read_openspec_artifacts "$change_dir"
  local prd
  prd=$(generate_prd "$change_dir")

  [[ "$prd" != *"## Current Task Context"* ]]
  [[ "$prd" != *"## Completed Tasks for Git Commit"* ]]

  [[ "$prd" == *"## Proposal"* ]]
  [[ "$prd" == *"## Specifications"* ]]
  [[ "$prd" == *"## Design"* ]]
}

@test "prd omits task context: does not include context with iteration header in tasks" {
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1

  local change_dir
  change_dir=$(create_openspec_change)

  cat > "$change_dir/tasks.md" <<'EOF'
# Ralph Wiggum Task Execution - Iteration 12 / 50

## Test Tasks

- [x] 1.1 Completed task
- [/] 1.2 Current task
EOF

  read_openspec_artifacts "$change_dir"
  local prd
  prd=$(generate_prd "$change_dir")

  [[ "$prd" != *"## Current Task Context"* ]]
  [[ "$prd" != *"## Completed Tasks for Git Commit"* ]]

  [[ "$prd" == *"## Proposal"* ]]
  [[ "$prd" == *"## Specifications"* ]]
  [[ "$prd" == *"## Design"* ]]
}

@test "prd omits task context: does not include context with tasks using subtasks" {
  local test_dir
  test_dir=$(setup_test_dir)
  cd "$test_dir" || return 1

  local change_dir
  change_dir=$(create_openspec_change)

  cat > "$change_dir/tasks.md" <<'EOF'
## Implementation

- [x] 2.1 Main task A
  - [x] 2.1.1 Subtask A1
  - [x] 2.1.2 Subtask A2
- [/] 2.2 Main task B
  - [ ] 2.2.1 Subtask B1
  - [ ] 2.2.2 Subtask B2
EOF

  read_openspec_artifacts "$change_dir"
  local prd
  prd=$(generate_prd "$change_dir")

  [[ "$prd" != *"## Current Task Context"* ]]
  [[ "$prd" != *"## Completed Tasks for Git Commit"* ]]

  [[ "$prd" == *"## Proposal"* ]]
  [[ "$prd" == *"## Specifications"* ]]
  [[ "$prd" == *"## Design"* ]]
}
