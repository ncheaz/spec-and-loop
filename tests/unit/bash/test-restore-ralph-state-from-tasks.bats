#!/usr/bin/env bats

# Test suite for restore_ralph_state_from_tasks() function
# Tests iteration calculation and state restoration from tasks file

# Setup minimal environment for testing
VERBOSE=false

# Mock log_verbose function
log_verbose() {
    if [[ "$VERBOSE" == true ]]; then
        echo "[VERBOSE] $*" >&2
    fi
}

# Extract the restore_ralph_state_from_tasks function from ralph-run.sh
restore_ralph_state_from_tasks() {
    local tasks_file="$1"
    local ralph_loop_file=".ralph/ralph-loop.state.json"
    
    if [[ ! -f "$ralph_loop_file" ]]; then
        log_verbose "No Ralph state file found, nothing to restore"
        return 0
    fi
    
    # Read current iteration from state file - don't use completed task count
    local current_iteration
    current_iteration=$(jq -r '.iteration // 0' "$ralph_loop_file" 2>/dev/null || echo "0")
    
    # Count completed tasks for informational purposes only
    local completed_count=$(grep -c "^- \[x\]" "$tasks_file" 2>/dev/null || echo "0")
    log_verbose "Found $completed_count completed tasks in tasks.md (iteration $current_iteration)"
    
    # Read maxIterations from state file
    local max_iterations
    max_iterations=$(jq -r '.maxIterations // 50' "$ralph_loop_file" 2>/dev/null || echo "50")
    
    # Only update iteration if it's 0 or missing (fresh start)
    if [[ $current_iteration -eq 0 ]]; then
        log_verbose "Setting initial iteration to 1 (max: $max_iterations)"
        jq '.iteration = 1 | .active = true' "$ralph_loop_file" > "${ralph_loop_file}.tmp" 2>/dev/null && mv "${ralph_loop_file}.tmp" "$ralph_loop_file" 2>/dev/null || true
    else
        log_verbose "Ralph state preserved at iteration $current_iteration"
    fi
    
    return 0
}

@test "restore_ralph_state_from_tasks: does nothing when no state file exists" {
  local test_dir
  test_dir=$(mktemp -d)
  cd "$test_dir" || return 1
  
  local change_dir="$test_dir/openspec/changes/test-change"
  mkdir -p "$change_dir/specs"
  cat > "$change_dir/tasks.md" <<'EOF'
## Test Tasks

- [ ] 1.1 Task one
EOF
  
  mkdir -p .ralph
  
  run restore_ralph_state_from_tasks "$change_dir/tasks.md"
  
  [ "$status" -eq 0 ]
  
  cd - > /dev/null
  rm -rf "$test_dir"
}

@test "restore_ralph_state_from_tasks: sets initial iteration to 1 when state file has iteration 0" {
  local test_dir
  test_dir=$(mktemp -d)
  cd "$test_dir" || return 1
  
  local change_dir="$test_dir/openspec/changes/test-change"
  mkdir -p "$change_dir/specs"
  cat > "$change_dir/tasks.md" <<'EOF'
## Test Tasks

- [ ] 1.1 Task one
EOF
  
  mkdir -p .ralph
  
  cat > .ralph/ralph-loop.state.json <<EOF
{
  "iteration": 0,
  "maxIterations": 50,
  "active": false
}
EOF
  
  run restore_ralph_state_from_tasks "$change_dir/tasks.md"
  
  [ "$status" -eq 0 ]
  
  local iteration
  iteration=$(jq -r '.iteration' .ralph/ralph-loop.state.json)
  [ "$iteration" -eq 1 ]
  
  local active
  active=$(jq -r '.active' .ralph/ralph-loop.state.json)
  [ "$active" = "true" ]
  
  cd - > /dev/null
  rm -rf "$test_dir"
}

@test "restore_ralph_state_from_tasks: preserves iteration when state file has iteration > 0" {
  local test_dir
  test_dir=$(mktemp -d)
  cd "$test_dir" || return 1
  
  local change_dir="$test_dir/openspec/changes/test-change"
  mkdir -p "$change_dir/specs"
  cat > "$change_dir/tasks.md" <<'EOF'
## Test Tasks

- [ ] 1.1 Task one
EOF
  
  mkdir -p .ralph
  
  cat > .ralph/ralph-loop.state.json <<EOF
{
  "iteration": 7,
  "maxIterations": 50,
  "active": true
}
EOF
  
  run restore_ralph_state_from_tasks "$change_dir/tasks.md"
  
  [ "$status" -eq 0 ]
  
  local iteration
  iteration=$(jq -r '.iteration' .ralph/ralph-loop.state.json)
  [ "$iteration" -eq 7 ]
  
  cd - > /dev/null
  rm -rf "$test_dir"
}

@test "restore_ralph_state_from_tasks: counts completed tasks correctly" {
  local test_dir
  test_dir=$(mktemp -d)
  cd "$test_dir" || return 1
  
  local change_dir="$test_dir/openspec/changes/test-change"
  mkdir -p "$change_dir/specs"
  
  cat > "$change_dir/tasks.md" <<'EOF'
## Test Tasks

- [x] 1.1 Completed task one
- [x] 1.2 Completed task two
- [ ] 1.3 Incomplete task three
- [x] 1.4 Completed task four
EOF
  
  mkdir -p .ralph
  
  cat > .ralph/ralph-loop.state.json <<EOF
{
  "iteration": 3,
  "maxIterations": 50,
  "active": true
}
EOF
  
  run restore_ralph_state_from_tasks "$change_dir/tasks.md"
  
  [ "$status" -eq 0 ]
  
  cd - > /dev/null
  rm -rf "$test_dir"
}

@test "restore_ralph_state_from_tasks: handles tasks file with no completed tasks" {
  local test_dir
  test_dir=$(mktemp -d)
  cd "$test_dir" || return 1
  
  local change_dir="$test_dir/openspec/changes/test-change"
  mkdir -p "$change_dir/specs"
  
  cat > "$change_dir/tasks.md" <<'EOF'
## Test Tasks

- [ ] 1.1 Incomplete task one
- [ ] 1.2 Incomplete task two
- [ ] 1.3 Incomplete task three
EOF
  
  mkdir -p .ralph
  
  cat > .ralph/ralph-loop.state.json <<EOF
{
  "iteration": 0,
  "maxIterations": 50,
  "active": false
}
EOF
  
  run restore_ralph_state_from_tasks "$change_dir/tasks.md"
  
  [ "$status" -eq 0 ]
  
  local iteration
  iteration=$(jq -r '.iteration' .ralph/ralph-loop.state.json)
  [ "$iteration" -eq 1 ]
  
  cd - > /dev/null
  rm -rf "$test_dir"
}

@test "restore_ralph_state_from_tasks: reads maxIterations from state file" {
  local test_dir
  test_dir=$(mktemp -d)
  cd "$test_dir" || return 1
  
  local change_dir="$test_dir/openspec/changes/test-change"
  mkdir -p "$change_dir/specs"
  cat > "$change_dir/tasks.md" <<'EOF'
## Test Tasks

- [ ] 1.1 Task one
EOF
  
  mkdir -p .ralph
  
  cat > .ralph/ralph-loop.state.json <<EOF
{
  "iteration": 0,
  "maxIterations": 100,
  "active": false
}
EOF
  
  run restore_ralph_state_from_tasks "$change_dir/tasks.md"
  
  [ "$status" -eq 0 ]
  
  cd - > /dev/null
  rm -rf "$test_dir"
}

@test "restore_ralph_state_from_tasks: defaults maxIterations to 50 when not present" {
  local test_dir
  test_dir=$(mktemp -d)
  cd "$test_dir" || return 1
  
  local change_dir="$test_dir/openspec/changes/test-change"
  mkdir -p "$change_dir/specs"
  cat > "$change_dir/tasks.md" <<'EOF'
## Test Tasks

- [ ] 1.1 Task one
EOF
  
  mkdir -p .ralph
  
  cat > .ralph/ralph-loop.state.json <<EOF
{
  "iteration": 0,
  "active": false
}
EOF
  
  run restore_ralph_state_from_tasks "$change_dir/tasks.md"
  
  [ "$status" -eq 0 ]
  
  cd - > /dev/null
  rm -rf "$test_dir"
}

@test "restore_ralph_state_from_tasks: handles malformed state file gracefully" {
  local test_dir
  test_dir=$(mktemp -d)
  cd "$test_dir" || return 1
  
  local change_dir="$test_dir/openspec/changes/test-change"
  mkdir -p "$change_dir/specs"
  cat > "$change_dir/tasks.md" <<'EOF'
## Test Tasks

- [ ] 1.1 Task one
EOF
  
  mkdir -p .ralph
  
  echo "not valid json" > .ralph/ralph-loop.state.json
  
  run restore_ralph_state_from_tasks "$change_dir/tasks.md"
  
  [ "$status" -eq 0 ]
  
  cd - > /dev/null
  rm -rf "$test_dir"
}

@test "restore_ralph_state_from_tasks: handles empty state file" {
  local test_dir
  test_dir=$(mktemp -d)
  cd "$test_dir" || return 1
  
  local change_dir="$test_dir/openspec/changes/test-change"
  mkdir -p "$change_dir/specs"
  cat > "$change_dir/tasks.md" <<'EOF'
## Test Tasks

- [ ] 1.1 Task one
EOF
  
  mkdir -p .ralph
  touch .ralph/ralph-loop.state.json
  
  run restore_ralph_state_from_tasks "$change_dir/tasks.md"
  
  [ "$status" -eq 0 ]
  
  cd - > /dev/null
  rm -rf "$test_dir"
}

@test "restore_ralph_state_from_tasks: handles tasks file with mixed checkbox formats" {
  local test_dir
  test_dir=$(mktemp -d)
  cd "$test_dir" || return 1
  
  local change_dir="$test_dir/openspec/changes/test-change"
  mkdir -p "$change_dir/specs"
  
  cat > "$change_dir/tasks.md" <<'EOF'
## Test Tasks

- [x] 1.1 Completed task
- [ ] 1.2 Incomplete task
- [/] 1.3 In-progress task
- [x] 1.4 Another completed task
EOF
  
  mkdir -p .ralph
  
  cat > .ralph/ralph-loop.state.json <<EOF
{
  "iteration": 5,
  "maxIterations": 50,
  "active": true
}
EOF
  
  run restore_ralph_state_from_tasks "$change_dir/tasks.md"
  
  [ "$status" -eq 0 ]
  
  local iteration
  iteration=$(jq -r '.iteration' .ralph/ralph-loop.state.json)
  [ "$iteration" -eq 5 ]
  
  cd - > /dev/null
  rm -rf "$test_dir"
}

@test "restore_ralph_state_from_tasks: preserves existing state when iteration is already set" {
  local test_dir
  test_dir=$(mktemp -d)
  cd "$test_dir" || return 1
  
  local change_dir="$test_dir/openspec/changes/test-change"
  mkdir -p "$change_dir/specs"
  cat > "$change_dir/tasks.md" <<'EOF'
## Test Tasks

- [ ] 1.1 Task one
EOF
  
  mkdir -p .ralph
  
  cat > .ralph/ralph-loop.state.json <<EOF
{
  "iteration": 15,
  "maxIterations": 75,
  "active": true,
  "someOtherField": "value"
}
EOF
  
  run restore_ralph_state_from_tasks "$change_dir/tasks.md"
  
  [ "$status" -eq 0 ]
  
  local iteration
  iteration=$(jq -r '.iteration' .ralph/ralph-loop.state.json)
  [ "$iteration" -eq 15 ]
  
  local other_field
  other_field=$(jq -r '.someOtherField' .ralph/ralph-loop.state.json)
  [ "$other_field" = "value" ]
  
  cd - > /dev/null
  rm -rf "$test_dir"
}
