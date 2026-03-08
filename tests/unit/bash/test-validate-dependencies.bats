#!/usr/bin/env bats

# Test suite for validate_dependencies() function (internal mini Ralph runtime)
# Tests CLI dependency validation against node + mini-ralph-cli.js instead of
# the removed @th0rgal/ralph-wiggum / Bun-based external ralph CLI.

setup() {
  load '../../helpers/test-common'
  source tests/helpers/test-functions.sh
}

teardown() {
  cleanup_test_dir
}

# ---------------------------------------------------------------------------
# resolve_ralph_command
# ---------------------------------------------------------------------------

@test "validate_dependencies: succeeds when node and mini-ralph-cli.js are present" {
  local test_dir
  test_dir=$(setup_test_dir)

  # Ensure resolve_ralph_command can find node (it's always available in CI)
  # and create a stub mini-ralph-cli.js so the path check passes.
  local stub_cli="$test_dir/mini-ralph-cli-stub.js"
  touch "$stub_cli"

  MINI_RALPH_CLI="$stub_cli"

  run resolve_ralph_command
  [ "$status" -eq 0 ]
}

@test "validate_dependencies: resolve_ralph_command fails when MINI_RALPH_CLI file does not exist" {
  MINI_RALPH_CLI="/nonexistent/path/mini-ralph-cli.js"

  run resolve_ralph_command
  [ "$status" -eq 1 ]
}

@test "validate_dependencies: resolve_ralph_command fails when node is not in PATH" {
  # Temporarily override PATH to hide node
  local test_dir
  test_dir=$(setup_test_dir)
  local stub_cli="$test_dir/mini-ralph-cli.js"
  touch "$stub_cli"

  MINI_RALPH_CLI="$stub_cli"

  run bash -c "
    source tests/helpers/test-functions.sh
    MINI_RALPH_CLI='$stub_cli'
    PATH='' resolve_ralph_command
  "
  [ "$status" -eq 1 ]
}

# ---------------------------------------------------------------------------
# validate_dependencies — success path
# ---------------------------------------------------------------------------

@test "validate_dependencies: succeeds when all dependencies are present" {
  local test_dir
  test_dir=$(setup_test_dir)
  local project_root="$PWD"

  local stub_cli="$test_dir/mini-ralph-cli.js"
  touch "$stub_cli"

  # Create fake opencode and jq scripts in a temp bin dir added to PATH
  local fake_bin="$test_dir/fake-bin"
  mkdir -p "$fake_bin"
  printf '#!/bin/sh\nexit 0\n' > "$fake_bin/opencode"
  printf '#!/bin/sh\nexit 0\n' > "$fake_bin/jq"
  chmod +x "$fake_bin/opencode" "$fake_bin/jq"

  run bash -c "
    cd '$project_root'
    export PATH='$fake_bin:$PATH'
    source tests/helpers/test-functions.sh
    MINI_RALPH_CLI='$stub_cli'
    validate_dependencies
  "

  [ "$status" -eq 0 ]
}

# ---------------------------------------------------------------------------
# validate_dependencies — missing internal runtime
# ---------------------------------------------------------------------------

@test "validate_dependencies: fails when mini-ralph-cli.js is missing" {
  run bash -c "
    source tests/helpers/test-functions.sh
    MINI_RALPH_CLI='/nonexistent/mini-ralph-cli.js'
    validate_dependencies
  "
  [ "$status" -eq 1 ]
  [[ "$output" == *"mini Ralph runtime not found"* ]] || [[ "$output" == *"not found"* ]]
}

@test "validate_dependencies: error message mentions MINI_RALPH_CLI path" {
  run bash -c "
    source tests/helpers/test-functions.sh
    MINI_RALPH_CLI='/missing/path/mini-ralph-cli.js'
    validate_dependencies
  "
  [ "$status" -eq 1 ]
  [[ "$output" == *"/missing/path/mini-ralph-cli.js"* ]]
}

@test "validate_dependencies: error message mentions npm install hint" {
  run bash -c "
    source tests/helpers/test-functions.sh
    MINI_RALPH_CLI='/nonexistent/mini-ralph-cli.js'
    validate_dependencies
  "
  [ "$status" -eq 1 ]
  [[ "$output" == *"npm install"* ]]
}

# ---------------------------------------------------------------------------
# validate_dependencies — missing opencode
# ---------------------------------------------------------------------------

@test "validate_dependencies: fails when opencode CLI is missing" {
  local test_dir
  test_dir=$(setup_test_dir)
  local stub_cli="$test_dir/mini-ralph-cli.js"
  touch "$stub_cli"

  # Put a fake opencode script that exits non-zero before the real one in PATH,
  # so 'command -v opencode' finds it but it's treated as absent by validate_dependencies.
  # Actually validate_dependencies uses 'command -v opencode' to detect presence.
  # We need a PATH where opencode does NOT exist at all.
  # Strategy: use a controlled PATH with only essential dirs but omitting opencode locations.
  local fake_bin="$test_dir/fake-bin"
  mkdir -p "$fake_bin"
  # jq is present (as fake)
  printf '#!/bin/sh\nexit 0\n' > "$fake_bin/jq"
  chmod +x "$fake_bin/jq"
  # node must be present; create a symlink to the real node
  ln -sf "$(command -v node)" "$fake_bin/node"
  # Essential system tools
  for cmd in bash sh dirname basename pwd mkdir rm ln mktemp cat grep sed date find stat readlink; do
    local real_cmd
    real_cmd=$(command -v "$cmd" 2>/dev/null || true)
    if [[ -n "$real_cmd" ]]; then
      ln -sf "$real_cmd" "$fake_bin/$cmd" 2>/dev/null || true
    fi
  done

  run bash -c "
    export PATH='$fake_bin'
    source tests/helpers/test-functions.sh
    MINI_RALPH_CLI='$stub_cli'
    validate_dependencies
  "
  [ "$status" -eq 1 ]
  [[ "$output" == *"opencode"* ]]
}

@test "validate_dependencies: opencode error message includes install hint" {
  local test_dir
  test_dir=$(setup_test_dir)
  local stub_cli="$test_dir/mini-ralph-cli.js"
  touch "$stub_cli"

  local fake_bin="$test_dir/fake-bin"
  mkdir -p "$fake_bin"
  printf '#!/bin/sh\nexit 0\n' > "$fake_bin/jq"
  chmod +x "$fake_bin/jq"
  ln -sf "$(command -v node)" "$fake_bin/node"
  for cmd in bash sh dirname basename pwd mkdir rm ln mktemp cat grep sed date find stat readlink; do
    local real_cmd
    real_cmd=$(command -v "$cmd" 2>/dev/null || true)
    if [[ -n "$real_cmd" ]]; then
      ln -sf "$real_cmd" "$fake_bin/$cmd" 2>/dev/null || true
    fi
  done

  run bash -c "
    export PATH='$fake_bin'
    source tests/helpers/test-functions.sh
    MINI_RALPH_CLI='$stub_cli'
    validate_dependencies
  "
  [ "$status" -eq 1 ]
  [[ "$output" == *"opencode-ai"* ]] || [[ "$output" == *"npm install"* ]]
}

# ---------------------------------------------------------------------------
# validate_dependencies — missing jq
# ---------------------------------------------------------------------------

@test "validate_dependencies: fails when jq CLI is missing" {
  local test_dir
  test_dir=$(setup_test_dir)
  local stub_cli="$test_dir/mini-ralph-cli.js"
  touch "$stub_cli"

  local fake_bin="$test_dir/fake-bin"
  mkdir -p "$fake_bin"
  # opencode is present (as fake)
  printf '#!/bin/sh\nexit 0\n' > "$fake_bin/opencode"
  chmod +x "$fake_bin/opencode"
  ln -sf "$(command -v node)" "$fake_bin/node"
  for cmd in bash sh dirname basename pwd mkdir rm ln mktemp cat grep sed date find stat readlink; do
    local real_cmd
    real_cmd=$(command -v "$cmd" 2>/dev/null || true)
    if [[ -n "$real_cmd" ]]; then
      ln -sf "$real_cmd" "$fake_bin/$cmd" 2>/dev/null || true
    fi
  done

  run bash -c "
    export PATH='$fake_bin'
    source tests/helpers/test-functions.sh
    MINI_RALPH_CLI='$stub_cli'
    validate_dependencies
  "
  [ "$status" -eq 1 ]
  [[ "$output" == *"jq"* ]]
}

# ---------------------------------------------------------------------------
# validate_dependencies — no mention of old external ralph
# ---------------------------------------------------------------------------

@test "validate_dependencies: does not reference @th0rgal/ralph-wiggum in output" {
  run bash -c "
    source tests/helpers/test-functions.sh
    MINI_RALPH_CLI='/nonexistent/mini-ralph-cli.js'
    validate_dependencies 2>&1 || true
  "
  [[ "$output" != *"@th0rgal/ralph-wiggum"* ]]
}

@test "validate_dependencies: does not reference bun in output" {
  run bash -c "
    source tests/helpers/test-functions.sh
    MINI_RALPH_CLI='/nonexistent/mini-ralph-cli.js'
    validate_dependencies 2>&1 || true
  "
  [[ "$output" != *"bun"* ]]
}

@test "validate_dependencies: does not reference RALPH_CMD in output" {
  run bash -c "
    source tests/helpers/test-functions.sh
    MINI_RALPH_CLI='/nonexistent/mini-ralph-cli.js'
    validate_dependencies 2>&1 || true
  "
  [[ "$output" != *"RALPH_CMD"* ]]
}

# ---------------------------------------------------------------------------
# validate_dependencies — idempotent / multiple calls
# ---------------------------------------------------------------------------

@test "validate_dependencies: can be called multiple times safely" {
  local test_dir
  test_dir=$(setup_test_dir)
  local stub_cli="$test_dir/mini-ralph-cli.js"
  touch "$stub_cli"

  # Create fake bin with both opencode and jq
  local fake_bin="$test_dir/fake-bin"
  mkdir -p "$fake_bin"
  printf '#!/bin/sh\nexit 0\n' > "$fake_bin/opencode"
  printf '#!/bin/sh\nexit 0\n' > "$fake_bin/jq"
  chmod +x "$fake_bin/opencode" "$fake_bin/jq"

  run bash -c "
    export PATH='$fake_bin:$PATH'
    source tests/helpers/test-functions.sh
    MINI_RALPH_CLI='$stub_cli'
    validate_dependencies && validate_dependencies && validate_dependencies
  "
  [ "$status" -eq 0 ]
}
