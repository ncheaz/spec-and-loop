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

  MOCK_BIN_DIR="$test_dir/mock-bin"
  mkdir -p "$MOCK_BIN_DIR"

  cat > "$MOCK_BIN_DIR/opencode" <<'EOF'
#!/bin/bash
echo "Mock opencode"
exit 0
EOF
  chmod +x "$MOCK_BIN_DIR/opencode"

  export PATH="$MOCK_BIN_DIR:$PATH"
  cd "$test_dir" || return 1
}

teardown() {
  cd / || true
  cleanup_test_dir
}

@test "supervisor crash recovery restores tasks.md" {
  create_git_repo
  mkdir -p openspec
  cp "$PROJECT_ROOT/openspec/OPENSPEC-RALPH-BP.md" openspec/OPENSPEC-RALPH-BP.md
  cp "$PROJECT_ROOT/AGENTS.md" AGENTS.md
  cp -r "$PROJECT_ROOT/tests/fixtures/simple-feature" openspec/changes/

  local change_dir="openspec/changes/simple-feature"
  local tasks_file="$change_dir/tasks.md"
  local orig_file="$tasks_file.supervisor-orig"
  local ralph_dir="$change_dir/.ralph"

  mkdir -p "$ralph_dir"
  mv "$tasks_file" "$orig_file"
  printf '%s\n' 'stale patched content' > "$tasks_file"

  run bash "$SCRIPT_PATH" --change simple-feature --status

  [ "$status" -eq 0 ]
  [ -f "$tasks_file" ]
  [ ! -f "$orig_file" ]
  grep -q "simple workflow" "$tasks_file"
  [[ "$output" == *"supervisor recovery: removed stale tasks file"* ]]
  [[ "$output" == *"supervisor recovery: restored tasks file from rollback"* ]]
}
