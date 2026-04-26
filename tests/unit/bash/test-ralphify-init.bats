#!/usr/bin/env bats

# Test suite for ralphify_init() function
# Tests the one-time project ralphify setup command

PROJECT_ROOT=""
setup() {
  load '../../helpers/test-common'
  PROJECT_ROOT="$PWD"
  TEST_DIR=$(setup_test_dir)
}

teardown() {
  cleanup_test_dir
}

@test "ralphify_init: succeeds with valid git repo, openspec dir, and BP file" {
  local test_dir="$TEST_DIR"
  mkdir -p "$test_dir/openspec"
  echo "schema: spec-driven" > "$test_dir/openspec/config.yaml"
  mkdir -p "$test_dir/scripts/.."
  echo "# Ralph Best Practices" > "$test_dir/OPENSPEC-RALPH-BP.md"

  cd "$test_dir"
  git init -q
  git config user.email "test@example.com"
  git config user.name "Test User"
  touch README.md
  git add README.md
  git commit -q -m "init"

  run bash -c "
    cd '$test_dir'
    export SCRIPT_DIR='$test_dir/scripts'
    source '$PROJECT_ROOT/tests/helpers/test-functions.sh'
    ralphify_init
  "

  [ "$status" -eq 0 ]
}

@test "ralphify_init: writes Ralph Wiggum rules to config.yaml" {
  local test_dir="$TEST_DIR"
  mkdir -p "$test_dir/openspec"
  echo "schema: spec-driven" > "$test_dir/openspec/config.yaml"
  mkdir -p "$test_dir/scripts/.."
  echo "# Ralph Best Practices" > "$test_dir/OPENSPEC-RALPH-BP.md"

  cd "$test_dir"
  git init -q
  git config user.email "test@example.com"
  git config user.name "Test User"
  touch README.md
  git add README.md
  git commit -q -m "init"

  run bash -c "
    cd '$test_dir'
    export SCRIPT_DIR='$test_dir/scripts'
    source '$PROJECT_ROOT/tests/helpers/test-functions.sh'
    ralphify_init
  "

  grep -q "Ralph Wiggum" "$test_dir/openspec/config.yaml"
}

@test "ralphify_init: preserves existing config.yaml content" {
  local test_dir="$TEST_DIR"
  mkdir -p "$test_dir/openspec"
  echo "schema: spec-driven" > "$test_dir/openspec/config.yaml"
  mkdir -p "$test_dir/scripts/.."
  echo "# Ralph Best Practices" > "$test_dir/OPENSPEC-RALPH-BP.md"

  cd "$test_dir"
  git init -q
  git config user.email "test@example.com"
  git config user.name "Test User"
  touch README.md
  git add README.md
  git commit -q -m "init"

  run bash -c "
    cd '$test_dir'
    export SCRIPT_DIR='$test_dir/scripts'
    source '$PROJECT_ROOT/tests/helpers/test-functions.sh'
    ralphify_init
  "

  grep -q "schema: spec-driven" "$test_dir/openspec/config.yaml"
}

@test "ralphify_init: writes Ralph Wiggum Compliance section to AGENTS.md" {
  local test_dir="$TEST_DIR"
  mkdir -p "$test_dir/openspec"
  echo "schema: spec-driven" > "$test_dir/openspec/config.yaml"
  echo "# Existing content" > "$test_dir/AGENTS.md"
  mkdir -p "$test_dir/scripts/.."
  echo "# Ralph Best Practices" > "$test_dir/OPENSPEC-RALPH-BP.md"

  cd "$test_dir"
  git init -q
  git config user.email "test@example.com"
  git config user.name "Test User"
  touch README.md
  git add README.md
  git commit -q -m "init"

  run bash -c "
    cd '$test_dir'
    export SCRIPT_DIR='$test_dir/scripts'
    source '$PROJECT_ROOT/tests/helpers/test-functions.sh'
    ralphify_init
  "

  grep -q "Ralph Wiggum Compliance" "$test_dir/AGENTS.md"
  grep -q "Existing content" "$test_dir/AGENTS.md"
}

@test "ralphify_init: creates AGENTS.md if it does not exist" {
  local test_dir="$TEST_DIR"
  mkdir -p "$test_dir/openspec"
  echo "schema: spec-driven" > "$test_dir/openspec/config.yaml"
  mkdir -p "$test_dir/scripts/.."
  echo "# Ralph Best Practices" > "$test_dir/OPENSPEC-RALPH-BP.md"

  cd "$test_dir"
  git init -q
  git config user.email "test@example.com"
  git config user.name "Test User"
  touch README.md
  git add README.md
  git commit -q -m "init"
  rm -f "$test_dir/AGENTS.md"

  run bash -c "
    cd '$test_dir'
    export SCRIPT_DIR='$test_dir/scripts'
    source '$PROJECT_ROOT/tests/helpers/test-functions.sh'
    ralphify_init
  "

  [ -f "$test_dir/AGENTS.md" ]
  grep -q "Ralph Wiggum Compliance" "$test_dir/AGENTS.md"
}

@test "ralphify_init: does not duplicate config.yaml content on second run" {
  local test_dir="$TEST_DIR"
  mkdir -p "$test_dir/openspec"
  echo "schema: spec-driven" > "$test_dir/openspec/config.yaml"
  mkdir -p "$test_dir/scripts/.."
  echo "# Ralph Best Practices" > "$test_dir/OPENSPEC-RALPH-BP.md"

  cd "$test_dir"
  git init -q
  git config user.email "test@example.com"
  git config user.name "Test User"
  touch README.md
  git add README.md
  git commit -q -m "init"

  export SCRIPT_DIR="$test_dir/scripts"
  source "$PROJECT_ROOT/tests/helpers/test-functions.sh"

  ralphify_init
  local config_after_first
  config_after_first=$(cat "$test_dir/openspec/config.yaml")

  ralphify_init
  local config_after_second
  config_after_second=$(cat "$test_dir/openspec/config.yaml")

  [ "$config_after_first" = "$config_after_second" ]
}

@test "ralphify_init: does not duplicate AGENTS.md content on second run" {
  local test_dir="$TEST_DIR"
  mkdir -p "$test_dir/openspec"
  echo "schema: spec-driven" > "$test_dir/openspec/config.yaml"
  echo "# Existing" > "$test_dir/AGENTS.md"
  mkdir -p "$test_dir/scripts/.."
  echo "# Ralph Best Practices" > "$test_dir/OPENSPEC-RALPH-BP.md"

  cd "$test_dir"
  git init -q
  git config user.email "test@example.com"
  git config user.name "Test User"
  touch README.md
  git add README.md
  git commit -q -m "init"

  export SCRIPT_DIR="$test_dir/scripts"
  source "$PROJECT_ROOT/tests/helpers/test-functions.sh"

  ralphify_init
  local agents_after_first
  agents_after_first=$(cat "$test_dir/AGENTS.md")

  ralphify_init
  local agents_after_second
  agents_after_second=$(cat "$test_dir/AGENTS.md")

  [ "$agents_after_first" = "$agents_after_second" ]
}

@test "ralphify_init: fails when not in a git repository" {
  local test_dir="$TEST_DIR"
  mkdir -p "$test_dir/openspec"
  echo "schema: spec-driven" > "$test_dir/openspec/config.yaml"
  mkdir -p "$test_dir/scripts/.."
  echo "# Ralph Best Practices" > "$test_dir/OPENSPEC-RALPH-BP.md"

  run bash -c "
    cd '$test_dir'
    export SCRIPT_DIR='$test_dir/scripts'
    source '$PROJECT_ROOT/tests/helpers/test-functions.sh'
    ralphify_init
  "

  [ "$status" -eq 1 ]
  [[ "$output" == *"Not a git repository"* ]] || [[ "$output" == *"git init"* ]]
}

@test "ralphify_init: fails when openspec directory does not exist" {
  local test_dir="$TEST_DIR"
  mkdir -p "$test_dir/scripts/.."
  echo "# Ralph Best Practices" > "$test_dir/OPENSPEC-RALPH-BP.md"

  cd "$test_dir"
  git init -q
  git config user.email "test@example.com"
  git config user.name "Test User"
  touch README.md
  git add README.md
  git commit -q -m "init"

  run bash -c "
    cd '$test_dir'
    export SCRIPT_DIR='$test_dir/scripts'
    source '$PROJECT_ROOT/tests/helpers/test-functions.sh'
    ralphify_init
  "

  [ "$status" -eq 1 ]
  [[ "$output" == *"openspec"* ]]
}

@test "ralphify_init: fails when BP file is missing" {
  local test_dir="$TEST_DIR"
  mkdir -p "$test_dir/openspec"
  echo "schema: spec-driven" > "$test_dir/openspec/config.yaml"
  mkdir -p "$test_dir/scripts/.."

  cd "$test_dir"
  git init -q
  git config user.email "test@example.com"
  git config user.name "Test User"
  touch README.md
  git add README.md
  git commit -q -m "init"

  run bash -c "
    cd '$test_dir'
    export SCRIPT_DIR='$test_dir/scripts'
    source '$PROJECT_ROOT/tests/helpers/test-functions.sh'
    ralphify_init
  "

  [ "$status" -eq 1 ]
  [[ "$output" == *"OPENSPEC-RALPH-BP.md"* ]]
}

@test "ralphify_init: prints confirmation message on success" {
  local test_dir="$TEST_DIR"
  mkdir -p "$test_dir/openspec"
  echo "schema: spec-driven" > "$test_dir/openspec/config.yaml"
  mkdir -p "$test_dir/scripts/.."
  echo "# Ralph Best Practices" > "$test_dir/OPENSPEC-RALPH-BP.md"

  cd "$test_dir"
  git init -q
  git config user.email "test@example.com"
  git config user.name "Test User"
  touch README.md
  git add README.md
  git commit -q -m "init"

  run bash -c "
    cd '$test_dir'
    export SCRIPT_DIR='$test_dir/scripts'
    source '$PROJECT_ROOT/tests/helpers/test-functions.sh'
    ralphify_init
  "

  [ "$status" -eq 0 ]
  [[ "$output" == *"ralphified"* ]] || [[ "$output" == *"Ralph Wiggum"* ]]
}

@test "ralphify_init: writes rules section with proposal and tasks rules" {
  local test_dir="$TEST_DIR"
  mkdir -p "$test_dir/openspec"
  echo "schema: spec-driven" > "$test_dir/openspec/config.yaml"
  mkdir -p "$test_dir/scripts/.."
  echo "# Ralph Best Practices" > "$test_dir/OPENSPEC-RALPH-BP.md"

  cd "$test_dir"
  git init -q
  git config user.email "test@example.com"
  git config user.name "Test User"
  touch README.md
  git add README.md
  git commit -q -m "init"

  run bash -c "
    cd '$test_dir'
    export SCRIPT_DIR='$test_dir/scripts'
    source '$PROJECT_ROOT/tests/helpers/test-functions.sh'
    ralphify_init
  "

  [ "$status" -eq 0 ]
  grep -q "proposal:" "$test_dir/openspec/config.yaml"
  grep -q "tasks:" "$test_dir/openspec/config.yaml"
}
