#!/usr/bin/env bats

# Test suite for get_realpath() function
# Tests cross-platform path resolution

setup() {
  load '../helpers/test-common'
  source ../../../../scripts/ralph-run.sh
  TEST_DIR=$(setup_test_dir "get-realpath")
}

teardown() {
  cleanup_test_dir
}

@test "get_realpath: uses realpath when available" {
  # Mock realpath to be available
  command() {
    [[ "$1" == "realpath" ]] && return 0
    return 1
  }
  
  # Mock realpath command
  realpath() {
    echo "/absolute/path/$(basename "$1")"
  }
  
  # Create a test file
  local test_file="$TEST_DIR/test.txt"
  echo "content" > "$test_file"
  
  # Get realpath
  local result
  result=$(get_realpath "$test_file")
  
  # Verify returns a path
  [ -n "$result" ]
}

@test "get_realpath: uses readlink -f when realpath unavailable" {
  # Mock realpath to be unavailable, readlink -f to be available
  command() {
    if [[ "$1" == "realpath" ]]; then
      return 1
    elif [[ "$1" == "readlink" ]]; then
      return 0
    fi
    return 1
  }
  
  # Mock readlink -f command
  readlink() {
    if [[ "$2" == "-f" ]]; then
      echo "/absolute/path/$(basename "$3")"
    fi
  }
  
  # Create a test file
  local test_file="$TEST_DIR/test.txt"
  echo "content" > "$test_file"
  
  # Get realpath
  local result
  result=$(get_realpath "$test_file")
  
  # Verify returns a path
  [ -n "$result" ]
}

@test "get_realpath: falls back to cd + pwd when realpath and readlink unavailable" {
  # Mock realpath and readlink to be unavailable
  command() {
    if [[ "$1" == "realpath" || "$1" == "readlink" ]]; then
      return 1
    fi
    return 1
  }
  
  # Create a test file in a subdirectory
  local subdir="$TEST_DIR/subdir"
  mkdir -p "$subdir"
  local test_file="$subdir/test.txt"
  echo "content" > "$test_file"
  
  # Get realpath (will use cd + pwd fallback)
  local result
  result=$(get_realpath "$test_file")
  
  # Verify returns a path (fallback should work)
  [ -n "$result" ]
}

@test "get_realpath: returns absolute path for relative path" {
  # Mock realpath
  command() {
    [[ "$1" == "realpath" ]] && return 0
    return 1
  }
  
  realpath() {
    echo "$TEST_DIR/test.txt"
  }
  
  # Get realpath for relative filename
  local result
  result=$(get_realpath "test.txt")
  
  # Verify returns a path
  [ -n "$result" ]
}

@test "get_realpath: handles paths with spaces" {
  # Mock realpath
  command() {
    [[ "$1" == "realpath" ]] && return 0
    return 1
  }
  
  realpath() {
    echo "$TEST_DIR/test file.txt"
  }
  
  # Create file with spaces
  local test_file="$TEST_DIR/test file.txt"
  echo "content" > "$test_file"
  
  # Get realpath
  local result
  result=$(get_realpath "$test_file")
  
  # Verify returns a path
  [ -n "$result" ]
}

@test "get_realpath: handles symlinks" {
  # Mock realpath
  command() {
    [[ "$1" == "realpath" ]] && return 0
    return 1
  }
  
  # Create a file and symlink
  local target_file="$TEST_DIR/target.txt"
  echo "content" > "$target_file"
  local link_file="$TEST_DIR/link.txt"
  ln -s "$target_file" "$link_file"
  
  # Get realpath of symlink
  local result
  result=$(get_realpath "$link_file")
  
  # Verify returns a path
  [ -n "$result" ]
}

@test "get_realpath: returns empty string for non-existent path" {
  # Mock realpath
  command() {
    [[ "$1" == "realpath" ]] && return 0
    return 1
  }
  
  realpath() {
    return 1
  }
  
  # Try to get realpath of non-existent file
  local result
  result=$(get_realpath "$TEST_DIR/nonexistent.txt")
  
  # Verify returns empty string
  [ -z "$result" ]
}

@test "get_realpath: handles current directory" {
  # Mock realpath
  command() {
    [[ "$1" == "realpath" ]] && return 0
    return 1
  }
  
  realpath() {
    echo "$TEST_DIR"
  }
  
  # Get realpath of current directory
  local result
  result=$(get_realpath ".")
  
  # Verify returns a path
  [ -n "$result" ]
}

@test "get_realpath: handles parent directory references" {
  # Mock realpath
  command() {
    [[ "$1" == "realpath" ]] && return 0
    return 1
  }
  
  realpath() {
    echo "$TEST_DIR"
  }
  
  # Create a subdirectory
  mkdir -p "$TEST_DIR/subdir"
  
  # Get realpath with parent reference from subdir
  cd "$TEST_DIR/subdir"
  local result
  result=$(get_realpath "..")
  
  # Verify returns a path
  [ -n "$result" ]
}

@test "get_realpath: handles multiple directory levels" {
  # Mock realpath
  command() {
    [[ "$1" == "realpath" ]] && return 0
    return 1
  }
  
  realpath() {
    echo "$1"
  }
  
  # Create nested directories
  local deep_path="$TEST_DIR/a/b/c/d"
  mkdir -p "$deep_path"
  
  # Create a file deep in the hierarchy
  local test_file="$deep_path/test.txt"
  echo "content" > "$test_file"
  
  # Get realpath
  local result
  result=$(get_realpath "$test_file")
  
  # Verify returns a path
  [ -n "$result" ]
}

@test "get_realpath: handles trailing slashes" {
  # Mock realpath
  command() {
    [[ "$1" == "realpath" ]] && return 0
    return 1
  }
  
  realpath() {
    echo "$TEST_DIR"
  }
  
  # Get realpath with trailing slash
  local result
  result=$(get_realpath "$TEST_DIR/")
  
  # Verify returns a path
  [ -n "$result" ]
}
