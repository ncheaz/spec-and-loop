#!/usr/bin/env bats

# Test suite for the removed create_prompt_template() function
# All tests removed — create_prompt_template was eliminated in the
# cli-driven-manifest-resolution change. The prompt is now constructed
# as a string via --prompt-text in execute_ralph_loop().
