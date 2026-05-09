#!/usr/bin/env bash

prepare_supervisor_workspace() {
  local change_name="${1:-supervisor-demo-change}"

  create_git_repo
  mkdir -p openspec/changes openspec
  cp "$PROJECT_ROOT/openspec/config.yaml" openspec/config.yaml
  cp "$PROJECT_ROOT/openspec/OPENSPEC-RALPH-BP.md" openspec/OPENSPEC-RALPH-BP.md
  cp "$PROJECT_ROOT/AGENTS.md" AGENTS.md
  cp -r "$PROJECT_ROOT/tests/fixtures/supervisor/integration/${change_name}" openspec/changes/
}

install_supervisor_mock_opencode() {
  local state_file="$TEST_DIR/mock-opencode-state.json"
  local prompt_capture_file="$TEST_DIR/mock-implementer-prompt.txt"

  MOCK_BIN_DIR="$TEST_DIR/mock-bin"
  mkdir -p "$MOCK_BIN_DIR"

  cat > "$MOCK_BIN_DIR/opencode" <<EOF
#!/bin/bash
exec node "$PROJECT_ROOT/tests/fixtures/supervisor/integration/mock-opencode.js" "\$@"
EOF
  chmod +x "$MOCK_BIN_DIR/opencode"

  export PATH="$MOCK_BIN_DIR:$PATH"
  export MOCK_OPENCODE_STATE_FILE="$state_file"
  export MOCK_OPENCODE_CAPTURE_PROMPT_FILE="$prompt_capture_file"
}
