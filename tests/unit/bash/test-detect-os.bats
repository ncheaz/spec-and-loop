#!/usr/bin/env bats

# Test suite for detect_os() function
# Tests cross-platform OS detection (Linux vs macOS)

setup() {
  # Source the main script to access the detect_os function
  load '../../helpers/test-common'
  source tests/helpers/test-functions.sh
}

teardown() {
  cleanup_test_dir
}

@test "detect_os: detects Linux OS" {
  # Mock uname to return Linux
  uname() {
    echo "Linux"
  }
  
  # Re-detect OS after mocking
  detect_os
  
  # Verify OS is set to Linux
  [ "$OS" = "Linux" ]
}

@test "detect_os: detects macOS OS" {
  # Mock uname to return Darwin
  uname() {
    echo "Darwin"
  }
  
  # Re-detect OS after mocking
  detect_os
  
  # Verify OS is set to macOS
  [ "$OS" = "macOS" ]
}

@test "detect_os: handles unknown OS" {
  # Mock uname to return unknown string
  uname() {
    echo "UnknownOS"
  }
  
  # Re-detect OS after mocking
  detect_os
  
  # Verify OS is set to Unknown
  [ "$OS" = "Unknown" ]
}

@test "detect_os: case matches various Linux distributions" {
  # Note: `uname -s` on any Linux distro always returns a string starting with
  # "Linux" (e.g. "Linux", "Linux-gnu"). Distro names like "Ubuntu" are never
  # returned by uname -s, so only test realistic variants here.
  local linux_variants=("Linux" "Linux-gnu" "LinuxMint")
  
  for variant in "${linux_variants[@]}"; do
    # Mock uname to return Linux variant
    uname() {
      echo "$variant"
    }
    
    # Re-detect OS after mocking
    detect_os
    
    # Verify OS is set to Linux for all variants
    [ "$OS" = "Linux" ]
  done
}

@test "detect_os: case matches macOS version" {
  # Test different macOS/Darwin versions
  local darwin_versions=("Darwin" "Darwin20.0" "Darwin21.5" "Darwin22.0")
  
  for version in "${darwin_versions[@]}"; do
    # Mock uname to return Darwin variant
    uname() {
      echo "$version"
    }
    
    # Re-detect OS after mocking
    detect_os
    
    # Verify OS is set to macOS for all Darwin variants
    [ "$OS" = "macOS" ]
  done
}

@test "detect_os: sets OS variable globally" {
  # Mock uname to return Linux
  uname() {
    echo "Linux"
  }
  
  # Call detect_os
  detect_os
  
  # Verify OS variable is accessible outside function
  [ -n "$OS" ]
  [ "$OS" = "Linux" ]
}

@test "detect_os: can be called multiple times" {
  # First call with Linux
  uname() {
    echo "Linux"
  }
  detect_os
  [ "$OS" = "Linux" ]
  
  # Second call with macOS
  uname() {
    echo "Darwin"
  }
  detect_os
  [ "$OS" = "macOS" ]
  
  # Third call back to Linux
  uname() {
    echo "Linux"
  }
  detect_os
  [ "$OS" = "Linux" ]
}
