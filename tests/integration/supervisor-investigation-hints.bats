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

@test "investigation hints injected into next implementer prompt" {
  prepare_supervisor_workspace
  export MOCK_OPENCODE_CHANGE_NAME="supervisor-demo-change"
  export MOCK_OPENCODE_SCENARIO="hints_round_trip"

  run bash "$SCRIPT_PATH" --change supervisor-demo-change --max-iterations 2 --no-commit

  [ "$status" -eq 0 ]
  grep -q '## Supervisor Investigation Hints' "$TEST_DIR/mock-implementer-prompt.txt"
  grep -q 'openspec/changes/supervisor-demo-change/proposal.md' "$TEST_DIR/mock-implementer-prompt.txt"
  grep -q 'openspec/changes/supervisor-demo-change/design.md' "$TEST_DIR/mock-implementer-prompt.txt"
  grep -q 'openspec/changes/supervisor-demo-change/tasks.md' "$TEST_DIR/mock-implementer-prompt.txt"
  jq -e 'map(select(.iteration == 1 and (.supervisorHints | length) == 3 and (.supervisorHintsDropped | length) == 2)) | length == 1' \
    "openspec/changes/supervisor-demo-change/.ralph/ralph-history.json" >/dev/null
  jq -e 'map(select(.iteration == 1)) | .[0].supervisorHintsDropped | map(select(.reason == "out_of_tree")) | length == 2' \
    "openspec/changes/supervisor-demo-change/.ralph/ralph-history.json" >/dev/null
}
