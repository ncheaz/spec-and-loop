#!/usr/bin/env bats

# Test suite for execute_ralph_loop() function (internal mini Ralph runtime)
# Tests are deterministic: they stub `node "$MINI_RALPH_CLI"` via a fake node
# wrapper so no real OpenCode process or external Ralph package is invoked.

setup() {
  load '../../helpers/test-common'
  source tests/helpers/test-functions.sh
}

teardown() {
  cleanup_test_dir
}

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

# Create the minimal OpenSpec change directory structure that
# execute_ralph_loop depends on.
_make_change_dir() {
  local base="$1"
  local name="${2:-test-change}"
  local change_dir="$base/openspec/changes/$name"
  mkdir -p "$change_dir/specs"
  printf '%s\n' '# Proposal' > "$change_dir/proposal.md"
  printf '%s\n' '# Design'   > "$change_dir/design.md"
  printf '%s\n' '- [ ] Task one' > "$change_dir/tasks.md"
  printf '%s\n' '# Spec' > "$change_dir/specs/spec.md"
  echo "$change_dir"
}

# Build a fake node script that acts as the mini-ralph-cli.js stub.
# It just exits 0 (success) and writes a marker to stdout.
_fake_cli_exit0() {
  local path="$1"
  cat > "$path" << 'FAKECLI'
#!/usr/bin/env node
process.stdout.write('fake-mini-ralph: ok\n');
process.exit(0);
FAKECLI
  chmod +x "$path"
}

# Fake CLI that exits with a specific code
_fake_cli_exit() {
  local path="$1"
  local code="$2"
  cat > "$path" << FAKECLI
#!/usr/bin/env node
process.stdout.write('fake-mini-ralph: exit $code\n');
process.exit($code);
FAKECLI
  chmod +x "$path"
}

# ---------------------------------------------------------------------------
# execute_ralph_loop: basic success
# ---------------------------------------------------------------------------

@test "execute_ralph_loop: succeeds with a valid change directory" {
  local test_dir
  test_dir=$(setup_test_dir)
  local change_dir
  change_dir=$(_make_change_dir "$test_dir")
  local ralph_dir="$test_dir/.ralph"
  mkdir -p "$ralph_dir"

  local fake_cli="$test_dir/fake-mini-ralph-cli.js"
  _fake_cli_exit0 "$fake_cli"
  MINI_RALPH_CLI="$fake_cli"

  run execute_ralph_loop "$change_dir" "$ralph_dir" 1
  [ "$status" -eq 0 ]
}

@test "execute_ralph_loop: invokes node with MINI_RALPH_CLI" {
  local test_dir
  test_dir=$(setup_test_dir)
  local change_dir
  change_dir=$(_make_change_dir "$test_dir")
  local ralph_dir="$test_dir/.ralph"
  mkdir -p "$ralph_dir"

  # CLI writes its own argv[1] (the CLI path) so we can confirm node ran it
  local fake_cli="$test_dir/fake-cli.js"
  cat > "$fake_cli" << FAKECLI
#!/usr/bin/env node
process.stdout.write('invoked: ' + __filename + '\n');
process.exit(0);
FAKECLI
  chmod +x "$fake_cli"
  MINI_RALPH_CLI="$fake_cli"

  run execute_ralph_loop "$change_dir" "$ralph_dir" 1
  [ "$status" -eq 0 ]
  [[ "$output" == *"invoked:"* ]]
}

# ---------------------------------------------------------------------------
# execute_ralph_loop: exit code propagation
# ---------------------------------------------------------------------------

@test "execute_ralph_loop: returns exit code from node CLI (0 = success)" {
  local test_dir
  test_dir=$(setup_test_dir)
  local change_dir
  change_dir=$(_make_change_dir "$test_dir")
  local ralph_dir="$test_dir/.ralph"
  mkdir -p "$ralph_dir"

  _fake_cli_exit0 "$test_dir/fake-cli.js"
  MINI_RALPH_CLI="$test_dir/fake-cli.js"

  run execute_ralph_loop "$change_dir" "$ralph_dir" 1
  [ "$status" -eq 0 ]
}

@test "execute_ralph_loop: returns non-zero exit code from node CLI" {
  local test_dir
  test_dir=$(setup_test_dir)
  local change_dir
  change_dir=$(_make_change_dir "$test_dir")
  local ralph_dir="$test_dir/.ralph"
  mkdir -p "$ralph_dir"

  _fake_cli_exit "$test_dir/fake-cli.js" 7
  MINI_RALPH_CLI="$test_dir/fake-cli.js"

  run execute_ralph_loop "$change_dir" "$ralph_dir" 1
  [ "$status" -eq 7 ]
}

# ---------------------------------------------------------------------------
# execute_ralph_loop: pre-flight artifacts created in ralph_dir
# ---------------------------------------------------------------------------

@test "execute_ralph_loop: does NOT create prompt-template.md in ralph_dir" {
  local test_dir
  test_dir=$(setup_test_dir)
  local change_dir
  change_dir=$(_make_change_dir "$test_dir")
  local ralph_dir="$test_dir/.ralph"
  mkdir -p "$ralph_dir"

  _fake_cli_exit0 "$test_dir/fake-cli.js"
  MINI_RALPH_CLI="$test_dir/fake-cli.js"

  run execute_ralph_loop "$change_dir" "$ralph_dir" 1
  [ "$status" -eq 0 ]
  [ ! -f "$ralph_dir/prompt-template.md" ]
}

@test "execute_ralph_loop: does NOT create PRD.md in ralph_dir" {
  local test_dir
  test_dir=$(setup_test_dir)
  local change_dir
  change_dir=$(_make_change_dir "$test_dir")
  local ralph_dir="$test_dir/.ralph"
  mkdir -p "$ralph_dir"

  _fake_cli_exit0 "$test_dir/fake-cli.js"
  MINI_RALPH_CLI="$test_dir/fake-cli.js"

  run execute_ralph_loop "$change_dir" "$ralph_dir" 1
  [ "$status" -eq 0 ]
  [ ! -f "$ralph_dir/PRD.md" ]
}

@test "execute_ralph_loop: creates ralph-tasks.md symlink in ralph_dir" {
  local test_dir
  test_dir=$(setup_test_dir)
  local change_dir
  change_dir=$(_make_change_dir "$test_dir")
  local ralph_dir="$test_dir/.ralph"
  mkdir -p "$ralph_dir"

  _fake_cli_exit0 "$test_dir/fake-cli.js"
  MINI_RALPH_CLI="$test_dir/fake-cli.js"

  run execute_ralph_loop "$change_dir" "$ralph_dir" 1
  [ "$status" -eq 0 ]
  [ -L "$ralph_dir/ralph-tasks.md" ]
}

@test "execute_ralph_loop: ralph-tasks.md symlink points to change tasks.md" {
  local test_dir
  test_dir=$(setup_test_dir)
  local change_dir
  change_dir=$(_make_change_dir "$test_dir")
  local ralph_dir="$test_dir/.ralph"
  mkdir -p "$ralph_dir"

  _fake_cli_exit0 "$test_dir/fake-cli.js"
  MINI_RALPH_CLI="$test_dir/fake-cli.js"

  execute_ralph_loop "$change_dir" "$ralph_dir" 1

  local target
  target=$(readlink "$ralph_dir/ralph-tasks.md")
  [[ "$target" == *"tasks.md" ]]
}

@test "execute_ralph_loop: creates an output capture directory" {
  local test_dir
  test_dir=$(setup_test_dir)
  local change_dir
  change_dir=$(_make_change_dir "$test_dir")
  local ralph_dir="$test_dir/.ralph"
  mkdir -p "$ralph_dir"

  _fake_cli_exit0 "$test_dir/fake-cli.js"
  MINI_RALPH_CLI="$test_dir/fake-cli.js"

  run execute_ralph_loop "$change_dir" "$ralph_dir" 1
  [ "$status" -eq 0 ]
  # .output_dir file records the output capture path
  [ -f "$ralph_dir/.output_dir" ]
}

# ---------------------------------------------------------------------------
# execute_ralph_loop: CLI argument passing
# ---------------------------------------------------------------------------

@test "execute_ralph_loop: does NOT pass --prompt-file to the CLI" {
  local test_dir
  test_dir=$(setup_test_dir)
  local change_dir
  change_dir=$(_make_change_dir "$test_dir")
  local ralph_dir="$test_dir/.ralph"
  mkdir -p "$ralph_dir"

  local args_file="$test_dir/cli-args.txt"
  cat > "$test_dir/fake-cli.js" << FAKECLI
#!/usr/bin/env node
const fs = require('fs');
fs.writeFileSync('$args_file', process.argv.slice(2).join('\n') + '\n');
process.exit(0);
FAKECLI
  chmod +x "$test_dir/fake-cli.js"
  MINI_RALPH_CLI="$test_dir/fake-cli.js"

  execute_ralph_loop "$change_dir" "$ralph_dir" 1

  run grep -q -- "--prompt-file" "$args_file"
  [ "$status" -ne 0 ]
}

@test "execute_ralph_loop: passes --prompt-text to the CLI" {
  local test_dir
  test_dir=$(setup_test_dir)
  local change_dir
  change_dir=$(_make_change_dir "$test_dir")
  local ralph_dir="$test_dir/.ralph"
  mkdir -p "$ralph_dir"

  local args_file="$test_dir/cli-args.txt"
  cat > "$test_dir/fake-cli.js" << FAKECLI
#!/usr/bin/env node
const fs = require('fs');
fs.writeFileSync('$args_file', process.argv.slice(2).join('\n') + '\n');
process.exit(0);
FAKECLI
  chmod +x "$test_dir/fake-cli.js"
  MINI_RALPH_CLI="$test_dir/fake-cli.js"

  execute_ralph_loop "$change_dir" "$ralph_dir" 1

  run grep -q -- "--prompt-text" "$args_file"
  [ "$status" -eq 0 ]
}

@test "execute_ralph_loop: --prompt-text value starts with /opsx-apply" {
  local test_dir
  test_dir=$(setup_test_dir)
  local change_dir
  change_dir=$(_make_change_dir "$test_dir")
  local ralph_dir="$test_dir/.ralph"
  mkdir -p "$ralph_dir"

  local args_file="$test_dir/cli-args.txt"
  cat > "$test_dir/fake-cli.js" << FAKECLI
#!/usr/bin/env node
const fs = require('fs');
fs.writeFileSync('$args_file', process.argv.slice(2).join('\n') + '\n');
process.exit(0);
FAKECLI
  chmod +x "$test_dir/fake-cli.js"
  MINI_RALPH_CLI="$test_dir/fake-cli.js"

  execute_ralph_loop "$change_dir" "$ralph_dir" 1

  # Extract the value after --prompt-text and check it starts with /opsx-apply
  local prompt_text
  prompt_text=$(grep -A1 "^--prompt-text$" "$args_file" | tail -1)
  [[ "$prompt_text" == "/opsx-apply"* ]]
}

@test "execute_ralph_loop: does NOT pass --prompt-template to the CLI" {
  local test_dir
  test_dir=$(setup_test_dir)
  local change_dir
  change_dir=$(_make_change_dir "$test_dir")
  local ralph_dir="$test_dir/.ralph"
  mkdir -p "$ralph_dir"

  local args_file="$test_dir/cli-args.txt"
  cat > "$test_dir/fake-cli.js" << FAKECLI
#!/usr/bin/env node
const fs = require('fs');
fs.writeFileSync('$args_file', process.argv.slice(2).join('\n') + '\n');
process.exit(0);
FAKECLI
  chmod +x "$test_dir/fake-cli.js"
  MINI_RALPH_CLI="$test_dir/fake-cli.js"

  execute_ralph_loop "$change_dir" "$ralph_dir" 1

  run grep -q -- "--prompt-template" "$args_file"
  [ "$status" -ne 0 ]
}

@test "execute_ralph_loop: passes --max-iterations to the CLI" {
  local test_dir
  test_dir=$(setup_test_dir)
  local change_dir
  change_dir=$(_make_change_dir "$test_dir")
  local ralph_dir="$test_dir/.ralph"
  mkdir -p "$ralph_dir"

  local args_file="$test_dir/cli-args.txt"
  cat > "$test_dir/fake-cli.js" << FAKECLI
#!/usr/bin/env node
const fs = require('fs');
fs.writeFileSync('$args_file', process.argv.slice(2).join('\n') + '\n');
process.exit(0);
FAKECLI
  chmod +x "$test_dir/fake-cli.js"
  MINI_RALPH_CLI="$test_dir/fake-cli.js"

  execute_ralph_loop "$change_dir" "$ralph_dir" 15

  run grep -q -- "--max-iterations" "$args_file"
  [ "$status" -eq 0 ]
  run grep -q -- "15" "$args_file"
  [ "$status" -eq 0 ]
}

@test "execute_ralph_loop: passes --tasks-file to the CLI" {
  local test_dir
  test_dir=$(setup_test_dir)
  local change_dir
  change_dir=$(_make_change_dir "$test_dir")
  local ralph_dir="$test_dir/.ralph"
  mkdir -p "$ralph_dir"

  local args_file="$test_dir/cli-args.txt"
  cat > "$test_dir/fake-cli.js" << FAKECLI
#!/usr/bin/env node
const fs = require('fs');
fs.writeFileSync('$args_file', process.argv.slice(2).join('\n') + '\n');
process.exit(0);
FAKECLI
  chmod +x "$test_dir/fake-cli.js"
  MINI_RALPH_CLI="$test_dir/fake-cli.js"

  execute_ralph_loop "$change_dir" "$ralph_dir" 1

  run grep -q -- "--tasks-file" "$args_file"
  [ "$status" -eq 0 ]
}

@test "execute_ralph_loop: passes --tasks flag to the CLI" {
  local test_dir
  test_dir=$(setup_test_dir)
  local change_dir
  change_dir=$(_make_change_dir "$test_dir")
  local ralph_dir="$test_dir/.ralph"
  mkdir -p "$ralph_dir"

  local args_file="$test_dir/cli-args.txt"
  cat > "$test_dir/fake-cli.js" << FAKECLI
#!/usr/bin/env node
const fs = require('fs');
fs.writeFileSync('$args_file', process.argv.slice(2).join('\n') + '\n');
process.exit(0);
FAKECLI
  chmod +x "$test_dir/fake-cli.js"
  MINI_RALPH_CLI="$test_dir/fake-cli.js"

  execute_ralph_loop "$change_dir" "$ralph_dir" 1

  run grep -q -- "--tasks" "$args_file"
  [ "$status" -eq 0 ]
}

@test "execute_ralph_loop: passes --no-commit when no_commit=true" {
  local test_dir
  test_dir=$(setup_test_dir)
  local change_dir
  change_dir=$(_make_change_dir "$test_dir")
  local ralph_dir="$test_dir/.ralph"
  mkdir -p "$ralph_dir"

  local args_file="$test_dir/cli-args.txt"
  cat > "$test_dir/fake-cli.js" << FAKECLI
#!/usr/bin/env node
const fs = require('fs');
fs.writeFileSync('$args_file', process.argv.slice(2).join('\n') + '\n');
process.exit(0);
FAKECLI
  chmod +x "$test_dir/fake-cli.js"
  MINI_RALPH_CLI="$test_dir/fake-cli.js"

  execute_ralph_loop "$change_dir" "$ralph_dir" 1 true

  run grep -q -- "--no-commit" "$args_file"
  [ "$status" -eq 0 ]
}

@test "execute_ralph_loop: does NOT pass --no-commit by default" {
  local test_dir
  test_dir=$(setup_test_dir)
  local change_dir
  change_dir=$(_make_change_dir "$test_dir")
  local ralph_dir="$test_dir/.ralph"
  mkdir -p "$ralph_dir"

  local args_file="$test_dir/cli-args.txt"
  cat > "$test_dir/fake-cli.js" << FAKECLI
#!/usr/bin/env node
const fs = require('fs');
fs.writeFileSync('$args_file', process.argv.slice(2).join('\n') + '\n');
process.exit(0);
FAKECLI
  chmod +x "$test_dir/fake-cli.js"
  MINI_RALPH_CLI="$test_dir/fake-cli.js"

  execute_ralph_loop "$change_dir" "$ralph_dir" 1

  run grep -q -- "--no-commit" "$args_file"
  [ "$status" -ne 0 ]
}

# ---------------------------------------------------------------------------
# execute_ralph_loop: missing internal runtime
# ---------------------------------------------------------------------------

@test "execute_ralph_loop: returns 1 when MINI_RALPH_CLI does not exist" {
  local test_dir
  test_dir=$(setup_test_dir)
  local change_dir
  change_dir=$(_make_change_dir "$test_dir")
  local ralph_dir="$test_dir/.ralph"
  mkdir -p "$ralph_dir"

  MINI_RALPH_CLI="/nonexistent/mini-ralph-cli.js"

  run execute_ralph_loop "$change_dir" "$ralph_dir" 1
  [ "$status" -eq 1 ]
  [[ "$output" == *"not found"* ]]
}

@test "execute_ralph_loop: error message mentions MINI_RALPH_CLI on missing runtime" {
  local test_dir
  test_dir=$(setup_test_dir)
  local change_dir
  change_dir=$(_make_change_dir "$test_dir")
  local ralph_dir="$test_dir/.ralph"
  mkdir -p "$ralph_dir"

  MINI_RALPH_CLI="/missing/mini-ralph-cli.js"

  run execute_ralph_loop "$change_dir" "$ralph_dir" 1
  [ "$status" -eq 1 ]
  [[ "$output" == *"/missing/mini-ralph-cli.js"* ]]
}

# ---------------------------------------------------------------------------
# execute_ralph_loop: log messages
# ---------------------------------------------------------------------------

@test "execute_ralph_loop: logs start message" {
  local test_dir
  test_dir=$(setup_test_dir)
  local change_dir
  change_dir=$(_make_change_dir "$test_dir")
  local ralph_dir="$test_dir/.ralph"
  mkdir -p "$ralph_dir"

  _fake_cli_exit0 "$test_dir/fake-cli.js"
  MINI_RALPH_CLI="$test_dir/fake-cli.js"

  run execute_ralph_loop "$change_dir" "$ralph_dir" 1
  [ "$status" -eq 0 ]
  [[ "$output" == *"mini Ralph"* ]] || [[ "$output" == *"Starting"* ]]
}

@test "execute_ralph_loop: logs max iterations" {
  local test_dir
  test_dir=$(setup_test_dir)
  local change_dir
  change_dir=$(_make_change_dir "$test_dir")
  local ralph_dir="$test_dir/.ralph"
  mkdir -p "$ralph_dir"

  _fake_cli_exit0 "$test_dir/fake-cli.js"
  MINI_RALPH_CLI="$test_dir/fake-cli.js"

  run execute_ralph_loop "$change_dir" "$ralph_dir" 5
  [ "$status" -eq 0 ]
  [[ "$output" == *"5"* ]]
}

@test "execute_ralph_loop: does not reference ralph CLI (external) in output" {
  local test_dir
  test_dir=$(setup_test_dir)
  local change_dir
  change_dir=$(_make_change_dir "$test_dir")
  local ralph_dir="$test_dir/.ralph"
  mkdir -p "$ralph_dir"

  _fake_cli_exit0 "$test_dir/fake-cli.js"
  MINI_RALPH_CLI="$test_dir/fake-cli.js"

  run execute_ralph_loop "$change_dir" "$ralph_dir" 1
  [[ "$output" != *"@th0rgal/ralph-wiggum"* ]]
  [[ "$output" != *"RALPH_CMD"* ]]
}

@test "execute_ralph_loop: uses default max_iterations of 50 when not specified" {
  local test_dir
  test_dir=$(setup_test_dir)
  local change_dir
  change_dir=$(_make_change_dir "$test_dir")
  local ralph_dir="$test_dir/.ralph"
  mkdir -p "$ralph_dir"

  local args_file="$test_dir/cli-args.txt"
  cat > "$test_dir/fake-cli.js" << FAKECLI
#!/usr/bin/env node
const fs = require('fs');
fs.writeFileSync('$args_file', process.argv.slice(2).join('\n') + '\n');
process.exit(0);
FAKECLI
  chmod +x "$test_dir/fake-cli.js"
  MINI_RALPH_CLI="$test_dir/fake-cli.js"

  execute_ralph_loop "$change_dir" "$ralph_dir"

  run grep -q "50" "$args_file"
  [ "$status" -eq 0 ]
}
