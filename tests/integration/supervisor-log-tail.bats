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

@test "supervisor log-tail audit records a true read with bounded bytes" {
  prepare_supervisor_workspace
  export MOCK_OPENCODE_CHANGE_NAME="supervisor-demo-change"
  export MOCK_OPENCODE_SCENARIO="log_read"

  run bash "$SCRIPT_PATH" --change supervisor-demo-change --max-iterations 2 --no-commit

  [ "$status" -eq 0 ]
  jq -e 'map(select(.iteration == 1 and .supervisorReadLogs == true and (.supervisorReadLogsBytes > 0) and (.supervisorReadLogsBytes <= 8192))) | length == 1' \
    "openspec/changes/supervisor-demo-change/.ralph/ralph-history.json" >/dev/null
}

@test "supervisor log-tail opt-out records false even when a tool-use trace is emitted" {
  prepare_supervisor_workspace
  export MOCK_OPENCODE_CHANGE_NAME="supervisor-demo-change"
  export MOCK_OPENCODE_SCENARIO="log_read_opt_out"

  run env RALPH_SELF_HEAL_LOG_ACCESS=0 bash "$SCRIPT_PATH" --change supervisor-demo-change --max-iterations 2 --no-commit

  [ "$status" -eq 0 ]
  jq -e 'map(select(.iteration == 1 and .supervisorReadLogs == false and .supervisorReadLogsBytes == 0)) | length == 1' \
    "openspec/changes/supervisor-demo-change/.ralph/ralph-history.json" >/dev/null
}
