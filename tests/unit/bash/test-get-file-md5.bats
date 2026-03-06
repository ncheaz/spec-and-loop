#!/usr/bin/env bats

# Test suite for get_file_md5() function
# Tests cross-platform MD5 hash retrieval

setup() {
  load '../helpers/test-common'
  source ../../../../scripts/ralph-run.sh
  TEST_DIR=$(setup_test_dir "get-file-md5")
}

teardown() {
  cleanup_test_dir
}

@test "get_file_md5: returns MD5 hash using md5sum on Linux" {
  # Mock md5sum to be available
  md5sum() {
    echo "d41d8cd98f00b204e9800998ecf8427e  $1"
  }
  
  # Create a test file (empty file for known MD5)
  local test_file="$TEST_DIR/test.txt"
  touch "$test_file"
  
  # Get MD5 hash from function
  local hash
  hash=$(get_file_md5 "$test_file")
  
  # Verify hash is 32 characters (MD5 length)
  [ ${#hash} -eq 32 ]
  
  # Verify hash only contains hexadecimal characters
  [[ "$hash" =~ ^[a-f0-9]{32}$ ]]
}

@test "get_file_md5: returns MD5 hash using md5 on macOS" {
  # Mock md5sum to be unavailable and md5 to be available
  command() {
    if [[ "$1" == "md5sum" ]]; then
      return 1
    elif [[ "$1" == "md5" ]]; then
      return 0
    fi
    return 1
  }
  
  # Mock md5 command
  md5() {
    echo "d41d8cd98f00b204e9800998ecf8427e"
  }
  
  # Create a test file
  local test_file="$TEST_DIR/test.txt"
  touch "$test_file"
  
  # Get MD5 hash from function
  local hash
  hash=$(get_file_md5 "$test_file")
  
  # Verify hash is 32 characters
  [ ${#hash} -eq 32 ]
  
  # Verify hash only contains hexadecimal characters
  [[ "$hash" =~ ^[a-f0-9]{32}$ ]]
}

@test "get_file_md5: returns 0 when no MD5 tool available" {
  # Mock both md5sum and md5 to be unavailable
  command() {
    if [[ "$1" == "md5sum" || "$1" == "md5" ]]; then
      return 1
    fi
    return 1
  }
  
  # Create a test file
  local test_file="$TEST_DIR/test.txt"
  echo "content" > "$test_file"
  
  # Get MD5 hash from function
  local hash
  hash=$(get_file_md5 "$test_file")
  
  # Verify returns 0 when no tool available
  [ "$hash" = "0" ]
}

@test "get_file_md5: returns same hash for identical files" {
  # Mock md5sum
  md5sum() {
    echo "5d41402abc4b2a76b9719d911017c592  $1"
  }
  
  # Create two identical files
  local file1="$TEST_DIR/file1.txt"
  local file2="$TEST_DIR/file2.txt"
  echo "hello" > "$file1"
  echo "hello" > "$file2"
  
  # Get hashes from both files
  local hash1
  local hash2
  hash1=$(get_file_md5 "$file1")
  hash2=$(get_file_md5 "$file2")
  
  # Verify hashes are identical
  [ "$hash1" = "$hash2" ]
}

@test "get_file_md5: returns different hashes for different files" {
  # Mock md5sum
  md5sum() {
    local file="$1"
    if [[ "$file" == *"file1"* ]]; then
      echo "5d41402abc4b2a76b9719d911017c592  $1"
    else
      echo "098f6bcd4621d373cade4e832627b4f6  $1"
    fi
  }
  
  # Create two different files
  local file1="$TEST_DIR/file1.txt"
  local file2="$TEST_DIR/file2.txt"
  echo "hello" > "$file1"
  echo "world" > "$file2"
  
  # Get hashes from both files
  local hash1
  local hash2
  hash1=$(get_file_md5 "$file1")
  hash2=$(get_file_md5 "$file2")
  
  # Verify hashes are different
  [ "$hash1" != "$hash2" ]
}

@test "get_file_md5: handles files with spaces in name" {
  # Mock md5sum
  md5sum() {
    echo "098f6bcd4621d373cade4e832627b4f6  $1"
  }
  
  # Create a file with spaces
  local test_file="$TEST_DIR/test file with spaces.txt"
  echo "world" > "$test_file"
  
  # Get hash
  local hash
  hash=$(get_file_md5 "$test_file")
  
  # Verify returns valid hash
  [ ${#hash} -eq 32 ]
  [[ "$hash" =~ ^[a-f0-9]{32}$ ]]
}

@test "get_file_md5: handles empty files" {
  # Mock md5sum
  md5sum() {
    echo "d41d8cd98f00b204e9800998ecf8427e  $1"
  }
  
  # Create an empty file
  local test_file="$TEST_DIR/empty.txt"
  touch "$test_file"
  
  # Get hash
  local hash
  hash=$(get_file_md5 "$test_file")
  
  # Verify returns known MD5 for empty file
  [ "$hash" = "d41d8cd98f00b204e9800998ecf8427e" ]
}

@test "get_file_md5: handles binary files" {
  # Mock md5sum
  md5sum() {
    echo "6f5902ac237024bdd0c176cb93063dc4  $1"
  }
  
  # Create a binary file
  local test_file="$TEST_DIR/binary.bin"
  printf '\x00\x01\x02\x03' > "$test_file"
  
  # Get hash
  local hash
  hash=$(get_file_md5 "$test_file")
  
  # Verify returns valid hash
  [ ${#hash} -eq 32 ]
  [[ "$hash" =~ ^[a-f0-9]{32}$ ]]
}

@test "get_file_md5: handles large files" {
  # Mock md5sum
  md5sum() {
    echo "e2fc714c4727ee9395f324cd2e7f331f  $1"
  }
  
  # Create a large file (1MB)
  local test_file="$TEST_DIR/large.txt"
  dd if=/dev/zero of="$test_file" bs=1024 count=1024 2>/dev/null
  
  # Get hash
  local hash
  hash=$(get_file_md5 "$test_file")
  
  # Verify returns valid hash
  [ ${#hash} -eq 32 ]
  [[ "$hash" =~ ^[a-f0-9]{32}$ ]]
}

@test "get_file_md5: hash format is lowercase hexadecimal" {
  # Mock md5sum
  md5sum() {
    echo "5d41402abc4b2a76b9719d911017c592  $1"
  }
  
  # Create a test file
  local test_file="$TEST_DIR/test.txt"
  echo "hello" > "$test_file"
  
  # Get hash
  local hash
  hash=$(get_file_md5 "$test_file")
  
  # Verify hash is lowercase
  [ "$hash" = "${hash,,}" ]
  
  # Verify only contains hex characters
  [[ "$hash" =~ ^[0-9a-f]+$ ]]
}
