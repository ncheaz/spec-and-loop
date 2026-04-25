#!/usr/bin/env bats

# Test suite for check_ralphified() function
# Tests the ralphified detection logic

setup() {
  load '../../helpers/test-common'
  source tests/helpers/test-functions.sh
  TEST_DIR=$(setup_test_dir)
}

teardown() {
  cleanup_test_dir
}

@test "check_ralphified: returns 0 when both config.yaml and AGENTS.md have Ralph markers" {
  cd "$TEST_DIR" || return 1
  mkdir -p openspec
  echo "# Ralph Wiggum configuration" > openspec/config.yaml
  echo "## Ralph Wiggum Compliance" > AGENTS.md

  run check_ralphified
  [ "$status" -eq 0 ]
}

@test "check_ralphified: returns 1 when config.yaml missing Ralph Wiggum" {
  cd "$TEST_DIR" || return 1
  mkdir -p openspec
  echo "schema: spec-driven" > openspec/config.yaml
  echo "## Ralph Wiggum Compliance" > AGENTS.md

  run check_ralphified
  [ "$status" -eq 1 ]
}

@test "check_ralphified: returns 1 when AGENTS.md missing Ralph Wiggum Compliance" {
  cd "$TEST_DIR" || return 1
  mkdir -p openspec
  echo "# Ralph Wiggum configuration" > openspec/config.yaml
  echo "# Just some content" > AGENTS.md

  run check_ralphified
  [ "$status" -eq 1 ]
}

@test "check_ralphified: returns 1 when neither file exists" {
  cd "$TEST_DIR" || return 1

  run check_ralphified
  [ "$status" -eq 1 ]
}

@test "check_ralphified: returns 1 when config.yaml does not exist" {
  cd "$TEST_DIR" || return 1
  echo "## Ralph Wiggum Compliance" > AGENTS.md

  run check_ralphified
  [ "$status" -eq 1 ]
}

@test "check_ralphified: returns 1 when AGENTS.md does not exist" {
  cd "$TEST_DIR" || return 1
  mkdir -p openspec
  echo "# Ralph Wiggum configuration" > openspec/config.yaml

  run check_ralphified
  [ "$status" -eq 1 ]
}

@test "check_ralphified: returns 1 when both files missing markers" {
  cd "$TEST_DIR" || return 1
  mkdir -p openspec
  echo "schema: spec-driven" > openspec/config.yaml
  echo "# Build instructions" > AGENTS.md

  run check_ralphified
  [ "$status" -eq 1 ]
}

@test "check_ralphified: detects Ralph Wiggum anywhere in config.yaml" {
  cd "$TEST_DIR" || return 1
  mkdir -p openspec
  cat > openspec/config.yaml <<'EOF'
schema: spec-driven
# Some comment about Ralph Wiggum method
context: stuff
EOF
  echo "## Ralph Wiggum Compliance" > AGENTS.md

  run check_ralphified
  [ "$status" -eq 0 ]
}

@test "check_ralphified: detects Ralph Wiggum Compliance heading in AGENTS.md" {
  cd "$TEST_DIR" || return 1
  mkdir -p openspec
  echo "# Ralph Wiggum config" > openspec/config.yaml
  cat > AGENTS.md <<'EOF'
# Build Guide

## Ralph Wiggum Compliance

Follow these rules.
EOF

  run check_ralphified
  [ "$status" -eq 0 ]
}

@test "check_ralphified: can be called multiple times" {
  cd "$TEST_DIR" || return 1
  mkdir -p openspec
  echo "# Ralph Wiggum configuration" > openspec/config.yaml
  echo "## Ralph Wiggum Compliance" > AGENTS.md

  check_ralphified
  [ "$?" -eq 0 ]

  check_ralphified
  [ "$?" -eq 0 ]

  check_ralphified
  [ "$?" -eq 0 ]
}
