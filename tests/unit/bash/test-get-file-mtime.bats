#!/usr/bin/env bats

# Test suite for get_file_mtime() function
# Tests cross-platform file modification time retrieval

setup() {
  load '../../helpers/test-common'
  source tests/helpers/test-functions.sh
  TEST_DIR=$(setup_test_dir "get-file-mtime")
}

teardown() {
  cleanup_test_dir
}

@test "get_file_mtime: returns Unix timestamp on Linux" {
  # Skip on macOS because Linux stat -c %Y is not available there.
  if [[ "$(uname -s)" == "Darwin" ]]; then
    skip "Linux stat syntax not available on macOS"
  fi

  # Set OS to Linux
  OS="Linux"
  
  # Create a test file
  local test_file="$TEST_DIR/test.txt"
  echo "test content" > "$test_file"
  
  # Get expected timestamp using stat directly
  local expected_mtime
  expected_mtime=$(stat -c %Y "$test_file")
  
  # Get timestamp from function
  local actual_mtime
  actual_mtime=$(get_file_mtime "$test_file")
  
  # Verify timestamps match
  [ "$actual_mtime" = "$expected_mtime" ]
  
  # Verify timestamp is a number
  [[ "$actual_mtime" =~ ^[0-9]+$ ]]
}

@test "get_file_mtime: returns Unix timestamp on macOS" {
  # Set OS to macOS
  OS="macOS"
  
  # Create a test file
  local test_file="$TEST_DIR/test.txt"
  echo "test content" > "$test_file"
  
  # Get expected timestamp using stat directly
  local expected_mtime
  expected_mtime=$(stat -f %m "$test_file")
  
  # Get timestamp from function
  local actual_mtime
  actual_mtime=$(get_file_mtime "$test_file")
  
  # Verify timestamps match
  [ "$actual_mtime" = "$expected_mtime" ]
  
  # Verify timestamp is a number
  [[ "$actual_mtime" =~ ^[0-9]+$ ]]
}

@test "get_file_mtime: returns 0 for non-existent file on Linux" {
  # Set OS to Linux
  OS="Linux"
  
  # Try to get mtime of non-existent file
  local mtime
  mtime=$(get_file_mtime "$TEST_DIR/nonexistent.txt")
  
  # Verify returns 0
  [ "$mtime" = "0" ]
}

@test "get_file_mtime: returns 0 for non-existent file on macOS" {
  # Set OS to macOS
  OS="macOS"
  
  # Try to get mtime of non-existent file
  local mtime
  mtime=$(get_file_mtime "$TEST_DIR/nonexistent.txt")
  
  # Verify returns 0
  [ "$mtime" = "0" ]
}

@test "get_file_mtime: handles files with spaces in name" {
  # Skip the Linux branch on macOS where stat -c is unavailable.
  if [[ "$(uname -s)" == "Darwin" ]]; then
    # Use macOS branch instead
    OS="macOS"
  else
    OS="Linux"
  fi
  
  # Create a file with spaces
  local test_file="$TEST_DIR/test file with spaces.txt"
  echo "content" > "$test_file"
  
  # Get timestamp
  local mtime
  mtime=$(get_file_mtime "$test_file")
  
  # Verify returns a valid timestamp
  [[ "$mtime" =~ ^[0-9]+$ ]]
  [ "$mtime" -gt 0 ]
}

@test "get_file_mtime: handles special characters in filename" {
  OS="macOS"
  
  # Create a file with special characters
  local test_file="$TEST_DIR/test-file_123.txt"
  echo "content" > "$test_file"
  
  # Get timestamp
  local mtime
  mtime=$(get_file_mtime "$test_file")
  
  # Verify returns a valid timestamp
  [[ "$mtime" =~ ^[0-9]+$ ]]
  [ "$mtime" -gt 0 ]
}

@test "get_file_mtime: handles absolute paths" {
  # Skip the Linux branch on macOS where stat -c is unavailable.
  if [[ "$(uname -s)" == "Darwin" ]]; then
    OS="macOS"
  else
    OS="Linux"
  fi
  
  # Create a test file and get absolute path
  local test_file="$TEST_DIR/test.txt"
  echo "content" > "$test_file"
  local abs_path=$(get_realpath "$test_file")
  
  # Get timestamp using absolute path
  local mtime
  mtime=$(get_file_mtime "$abs_path")
  
  # Verify returns a valid timestamp
  [[ "$mtime" =~ ^[0-9]+$ ]]
  [ "$mtime" -gt 0 ]
}

@test "get_file_mtime: timestamps increase for newer files" {
  OS="macOS"
  
  # Create first file
  local file1="$TEST_DIR/file1.txt"
  echo "content1" > "$file1"
  local mtime1
  mtime1=$(get_file_mtime "$file1")
  
  # Sleep briefly to ensure different timestamp
  sleep 1
  
  # Create second file
  local file2="$TEST_DIR/file2.txt"
  echo "content2" > "$file2"
  local mtime2
  mtime2=$(get_file_mtime "$file2")
  
  # Verify second file has newer timestamp
  [ "$mtime2" -gt "$mtime1" ]
}

@test "get_file_mtime: handles empty files" {
  # Skip the Linux branch on macOS where stat -c is unavailable.
  if [[ "$(uname -s)" == "Darwin" ]]; then
    OS="macOS"
  else
    OS="Linux"
  fi
  
  # Create an empty file
  local test_file="$TEST_DIR/empty.txt"
  touch "$test_file"
  
  # Get timestamp
  local mtime
  mtime=$(get_file_mtime "$test_file")
  
  # Verify returns a valid timestamp
  [[ "$mtime" =~ ^[0-9]+$ ]]
  [ "$mtime" -gt 0 ]
}

@test "get_file_mtime: handles binary files" {
  OS="macOS"
  
  # Create a binary file
  local test_file="$TEST_DIR/binary.bin"
  dd if=/dev/zero of="$test_file" bs=1024 count=1 2>/dev/null
  
  # Get timestamp
  local mtime
  mtime=$(get_file_mtime "$test_file")
  
  # Verify returns a valid timestamp
  [[ "$mtime" =~ ^[0-9]+$ ]]
  [ "$mtime" -gt 0 ]
}
