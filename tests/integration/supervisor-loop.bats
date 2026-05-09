#!/usr/bin/env bats

load '../helpers/test-common'

PROJECT_ROOT=""
SCRIPT_PATH=""
MOCK_BIN_DIR=""

setup() {
  PROJECT_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"
  SCRIPT_PATH="$PROJECT_ROOT/scripts/ralph-run.sh"

  local test_dir
  test_dir=$(setup_test_dir)
  export TEST_DIR="$test_dir"

  # shellcheck disable=SC1090
  source "$PROJECT_ROOT/tests/fixtures/supervisor/integration/common.bash"

  install_supervisor_mock_opencode
  cd "$test_dir" || return 1
}

teardown() {
  cd / || true
  cleanup_test_dir
}

@test "supervisor crash recovery restores tasks.md" {
  prepare_supervisor_workspace
  export MOCK_OPENCODE_CHANGE_NAME="supervisor-demo-change"
  export MOCK_OPENCODE_SCENARIO="happy_path"

  local change_dir="openspec/changes/supervisor-demo-change"
  local tasks_file="$change_dir/tasks.md"
  local orig_file="$tasks_file.supervisor-orig"
  local ralph_dir="$change_dir/.ralph"

  mkdir -p "$ralph_dir"
  mv "$tasks_file" "$orig_file"
  printf '%s\n' 'stale patched content' > "$tasks_file"

  run bash "$SCRIPT_PATH" --change supervisor-demo-change --max-iterations 2 --no-commit

  [ "$status" -eq 0 ]
  [ -f "$tasks_file" ]
  [ ! -f "$orig_file" ]
  grep -q "Repair the blocked task via supervisor patch" "$tasks_file"
  [[ "$output" == *"supervisor recovery: removed stale tasks file"* ]]
  [[ "$output" == *"supervisor recovery: restored tasks file from rollback"* ]]
}

@test "supervisor resolves structural blocker on first try" {
  prepare_supervisor_workspace
  export MOCK_OPENCODE_CHANGE_NAME="supervisor-demo-change"
  export MOCK_OPENCODE_SCENARIO="happy_path"

  run bash "$SCRIPT_PATH" --change supervisor-demo-change --max-iterations 2 --no-commit

  [ "$status" -eq 0 ]
  grep -Eq '<!-- supervised-edit: iter=1 .* hash=[0-9a-f]{8} -->' "openspec/changes/supervisor-demo-change/tasks.md"
  grep -q '## Supervisor edits' "openspec/changes/supervisor-demo-change/.ralph/HANDOFF.md"
  jq -e 'map(select(.type == "supervisorEdit" and .validatorOk == true)) | length == 1' \
    "openspec/changes/supervisor-demo-change/.ralph/ralph-history.json" >/dev/null
}
