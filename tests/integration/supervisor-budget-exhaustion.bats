#!/usr/bin/env bats

load '../helpers/test-common'

PROJECT_ROOT=""
SCRIPT_PATH=""

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

@test "supervisor exhausts budget and writes attempts subsection" {
  prepare_supervisor_workspace
  export MOCK_OPENCODE_CHANGE_NAME="supervisor-demo-change"
  export MOCK_OPENCODE_SCENARIO="budget_exhaustion"

  run bash "$SCRIPT_PATH" --change supervisor-demo-change --max-iterations 1 --no-commit

  [ "$status" -ne 0 ]
  grep -q '### Supervisor attempts' "openspec/changes/supervisor-demo-change/.ralph/HANDOFF.md"
  grep -q -- '- try 1: patch_rejected_structural done_when_count_under_spec' "openspec/changes/supervisor-demo-change/.ralph/HANDOFF.md"
  grep -q -- '- try 2: patch_rejected_structural stop_and_hand_off_missing' "openspec/changes/supervisor-demo-change/.ralph/HANDOFF.md"
  grep -q -- '- try 3: patch_rejected_structural unknown_task_number' "openspec/changes/supervisor-demo-change/.ralph/HANDOFF.md"
  jq -e '.exitReason == "blocked_handoff"' "openspec/changes/supervisor-demo-change/.ralph/ralph-loop.state.json" >/dev/null
}
