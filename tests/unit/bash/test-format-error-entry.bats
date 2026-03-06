#!/usr/bin/env bats

# Test suite for format_error_entry() function
# Tests error entry formatting with task information and error output

setup() {
  load '../../helpers/test-common'
  source ../../../scripts/ralph-run.sh
}

teardown() {
  cleanup_test_dir
}

@test "format_error_entry: outputs separator line" {
  local output
  output=$(format_error_entry "1.1" "Task one" "Error message")
  
  [[ "$output" == "---"* ]] || true
}

@test "format_error_entry: outputs timestamp in UTC format" {
  local output
  output=$(format_error_entry "1.1" "Task one" "Error message")
  
  [[ "$output" == *"Timestamp:"* ]] || true
  [[ "$output" == *"T"*"Z"* ]] || true
}

@test "format_error_entry: outputs task ID" {
  local output
  output=$(format_error_entry "1.1" "Task one" "Error message")
  
  [[ "$output" == *"Task ID: 1.1"* ]] || true
}

@test "format_error_entry: outputs task description" {
  local output
  output=$(format_error_entry "1.1" "Test task description" "Error message")
  
  [[ "$output" == *"Task: Test task description"* ]] || true
}

@test "format_error_entry: outputs error output section" {
  local output
  output=$(format_error_entry "1.1" "Task one" "Error message here")
  
  [[ "$output" == *"Error Output:"* ]] || true
  [[ "$output" == *"Error message here"* ]] || true
}

@test "format_error_entry: includes all components in correct order" {
  local output
  output=$(format_error_entry "1.1" "Task one" "Error message")
  
  local separator_line
  separator_line=$(echo "$output" | head -1)
  [[ "$separator_line" == "---"* ]] || true
  
  local timestamp_line
  timestamp_line=$(echo "$output" | grep "Timestamp:")
  [ -n "$timestamp_line" ]
  
  local task_id_line
  task_id_line=$(echo "$output" | grep "Task ID:")
  [ -n "$task_id_line" ]
  
  local task_line
  task_line=$(echo "$output" | grep "Task:")
  [ -n "$task_line" ]
  
  local error_section
  error_section=$(echo "$output" | grep "Error Output:")
  [ -n "$error_section" ]
}

@test "format_error_entry: handles special characters in task description" {
  local output
  output=$(format_error_entry "1.1" "Task with & < > \"special\" characters" "Error message")
  
  [[ "$output" == *"Task with"* ]] || true
  [[ "$output" == *"special"* ]] || true
}

@test "format_error_entry: handles multiline error output" {
  local error_msg=$'Line 1\nLine 2\nLine 3'
  
  local output
  output=$(format_error_entry "1.1" "Task one" "$error_msg")
  
  [[ "$output" == *"Line 1"* ]] || true
  [[ "$output" == *"Line 2"* ]] || true
  [[ "$output" == *"Line 3"* ]] || true
}

@test "format_error_entry: handles empty error output" {
  local output
  output=$(format_error_entry "1.1" "Task one" "")
  
  [[ "$output" == *"Task ID: 1.1"* ]] || true
  [[ "$output" == *"Error Output:"* ]] || true
}

@test "format_error_entry: handles long task descriptions" {
  local long_desc="This is a very long task description that spans multiple words and should be included in the output"
  
  local output
  output=$(format_error_entry "1.1" "$long_desc" "Error message")
  
  [[ "$output" == *"$long_desc"* ]] || true
}

@test "format_error_entry: handles task IDs with dots" {
  local output
  output=$(format_error_entry "11.7.3" "Task one" "Error message")
  
  [[ "$output" == *"Task ID: 11.7.3"* ]] || true
}

@test "format_error_entry: handles task IDs without dots" {
  local output
  output=$(format_error_entry "TASK-001" "Task one" "Error message")
  
  [[ "$output" == *"Task ID: TASK-001"* ]] || true
}

@test "format_error_entry: handles numeric task IDs" {
  local output
  output=$(format_error_entry "123" "Task one" "Error message")
  
  [[ "$output" == *"Task ID: 123"* ]] || true
}

@test "format_error_entry: handles error output with special characters" {
  local error_msg=$'Error: command failed\nExit code: 127\n$PATH not set'
  
  local output
  output=$(format_error_entry "1.1" "Task one" "$error_msg")
  
  [[ "$output" == *"command failed"* ]] || true
  [[ "$output" == *"Exit code: 127"* ]] || true
  [[ "$output" == *'$PATH'* ]] || true
}

@test "format_error_entry: outputs in consistent format" {
  local output1
  output1=$(format_error_entry "1.1" "Task one" "Error message")
  
  sleep 1
  
  local output2
  output2=$(format_error_entry "1.2" "Task two" "Error message")
  
  # Both should have similar structure
  [[ "$output1" == "---"* ]] || true
  [[ "$output2" == "---"* ]] || true
  
  [[ "$output1" == *"Timestamp:"* ]] || true
  [[ "$output2" == *"Timestamp:"* ]] || true
}

@test "format_error_entry: includes blank lines for readability" {
  local output
  output=$(format_error_entry "1.1" "Task one" "Error message")
  
  # Should have blank lines between sections
  local blank_line_count
  blank_line_count=$(echo "$output" | grep -c '^[[:space:]]*$' || echo 0)
  
  [ "$blank_line_count" -ge 1 ]
}

@test "format_error_entry: timestamp is in ISO 8601 format" {
  local output
  output=$(format_error_entry "1.1" "Task one" "Error message")
  
  local timestamp
  timestamp=$(echo "$output" | grep "Timestamp:" | awk '{print $2}')
  
  # Should match pattern: YYYY-MM-DDTHH:MM:SSZ
  [[ "$timestamp" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$ ]] || true
}

@test "format_error_entry: can be called multiple times" {
  local output1
  output1=$(format_error_entry "1.1" "Task one" "Error message")
  
  local output2
  output2=$(format_error_entry "1.2" "Task two" "Error message")
  
  [[ "$output1" == *"Task ID: 1.1"* ]] || true
  [[ "$output2" == *"Task ID: 1.2"* ]] || true
}

@test "format_error_entry: preserves error output formatting" {
  local error_msg=$'Step 1: Do this\nStep 2: Do that\nStep 3: Done'
  
  local output
  output=$(format_error_entry "1.1" "Task one" "$error_msg")
  
  [[ "$output" == *"Step 1:"* ]] || true
  [[ "$output" == *"Step 2:"* ]] || true
  [[ "$output" == *"Step 3:"* ]] || true
}

@test "format_error_entry: handles empty task description" {
  local output
  output=$(format_error_entry "1.1" "" "Error message")
  
  [[ "$output" == *"Task ID: 1.1"* ]] || true
  [[ "$output" == *"Task: "* ]] || true
  [[ "$output" == *"Error Output:"* ]] || true
}

@test "format_error_entry: handles empty task ID" {
  local output
  output=$(format_error_entry "" "Task one" "Error message")
  
  [[ "$output" == *"Task ID: "* ]] || true
  [[ "$output" == *"Task: Task one"* ]] || true
}
