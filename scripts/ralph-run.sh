#!/bin/bash

set -e

VERSION="1.0.0"

# Add Bun to PATH if installed
if [[ -d "$HOME/.bun/bin" ]]; then
    export PATH="$HOME/.bun/bin:$PATH"
fi

CHANGE_NAME=""
MAX_ITERATIONS=""
ERROR_OCCURRED=false
CLEANUP_IN_PROGRESS=false

# Trap signals for proper cleanup
cleanup() {
    # Prevent multiple cleanup calls
    if [[ "$CLEANUP_IN_PROGRESS" == "true" ]]; then
        return 0
    fi
    CLEANUP_IN_PROGRESS=true
    
    local exit_code=$1
    log_info "Cleaning up..."
    
    # NOTE: We do NOT kill ralph/bun processes here because:
    # 1. Ralph runs synchronously in the foreground
    # 2. Ctrl+C (SIGINT) naturally propagates to child processes
    # 3. Using pkill -f "bun" is DANGEROUS - it matches gnome-session-binary!
    # 4. Using pkill -f "ralph" could kill other user processes
    # The shell's process group handling ensures clean termination.
    
    if [[ $exit_code -ne 0 ]]; then
        log_error "Script terminated with exit code: $exit_code"
    fi
    exit $exit_code
}

trap 'cleanup $?' EXIT INT TERM QUIT

handle_error() {
    local exit_code=$1
    if [[ $exit_code -ne 0 ]]; then
        ERROR_OCCURRED=true
        log_error "Script failed with exit code: $exit_code"
        log_error "Use --verbose flag for more debugging information"
    fi
}
VERBOSE=false
SHOW_HELP=false

usage() {
    cat << EOF
ralph-run - OpenSpec + Ralph Loop integration for iterative development with opencode

USAGE:
    ralph-run [OPTIONS]

OPTIONS:
    --change <name>          Specify the OpenSpec change to execute (default: auto-detect)
    --max-iterations <n>     Maximum iterations for Ralph loop (default: 50)
    --verbose, -v            Enable verbose mode for debugging
    --help, -h               Show this help message

EXAMPLES:
    ralph-run                                    # Auto-detect most recent change
    ralph-run --change my-feature                # Execute specific change
    ralph-run --max-iterations 100             # Limit loop to 100 iterations
    ralph-run --verbose                          # Run with debug output

PREREQUISITES:
    - Git repository (git init)
    - OpenSpec artifacts created (openspec init, opsx-new, opsx-ff)
    - ralph CLI installed (npm install -g @th0rgal/ralph-wiggum)
    - opencode CLI installed (npm install -g opencode)

EOF
}

parse_arguments() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            --change)
                CHANGE_NAME="$2"
                shift 2
                ;;
            --max-iterations)
                MAX_ITERATIONS="$2"
                shift 2
                ;;
            --verbose|-v)
                VERBOSE=true
                shift
                ;;
            --help|-h)
                SHOW_HELP=true
                shift
                ;;
            *)
                echo "Error: Unknown option: $1"
                usage
                exit 1
                ;;
        esac
    done

    if [[ "$SHOW_HELP" == true ]]; then
        usage
        exit 0
    fi
}

log_verbose() {
    if [[ "$VERBOSE" == true ]]; then
        echo "[VERBOSE] $*" >&2
    fi
}

log_info() {
    echo "[INFO] $*" >&2
}

log_error() {
    echo "[ERROR] $*" >&2
}

validate_git_repository() {
    log_verbose "Validating git repository..."

    if ! git rev-parse --git-dir > /dev/null 2>&1; then
        log_error "Not a git repository. Please run this script within a git repository."
        log_error "Run: git init"
        exit 1
    fi

    log_verbose "Git repository validated"
}

validate_dependencies() {
    log_verbose "Validating dependencies..."
    
    # Check for ralph
    if ! command -v ralph &> /dev/null; then
        log_error "ralph CLI not found."
        log_error "Please install open-ralph-wiggum: npm install -g @th0rgal/ralph-wiggum"
        exit 1
    fi
    log_verbose "Found: ralph"
    
    # Check for opencode
    if ! command -v opencode &> /dev/null; then
        log_error "opencode CLI not found."
        log_error "Please install opencode: npm install -g opencode"
        exit 1
    fi
    log_verbose "Found: opencode"
    
    log_verbose "All dependencies validated"
}

validate_openspec_artifacts() {
    local change_dir="$1"
    
    log_verbose "Validating OpenSpec artifacts..."
    
    local required_files=(
        "proposal.md"
        "tasks.md"
        "design.md"
    )
    
    for file in "${required_files[@]}"; do
        if [[ ! -f "$change_dir/$file" ]]; then
            log_error "Required artifact not found: $file"
            exit 1
        fi
        log_verbose "Found artifact: $file"
    done
    
    if [[ ! -d "$change_dir/specs" ]]; then
        log_error "Required directory not found: specs/"
        exit 1
    fi
    log_verbose "Found directory: specs/"
    
    log_info "All OpenSpec artifacts validated"
}

setup_ralph_directory() {
    local change_dir="$1"
    local ralph_dir="$change_dir/.ralph"
    
    log_verbose "Setting up .ralph directory..."
    
    if [[ ! -d "$ralph_dir" ]]; then
        mkdir -p "$ralph_dir"
        log_verbose "Created .ralph directory: $ralph_dir"
    fi
    
    echo "$ralph_dir"
}

auto_detect_change() {
    local changes_dir="openspec/changes"
    
    if [[ ! -d "$changes_dir" ]]; then
        log_error "OpenSpec changes directory not found: $changes_dir"
        exit 1
    fi
    
    log_verbose "Auto-detecting most recently modified change..."
    
    local latest_change=""
    local latest_time=0
    
    for change_dir in "$changes_dir"/*; do
        if [[ -d "$change_dir" ]]; then
            local tasks_file="$change_dir/tasks.md"
            if [[ -f "$tasks_file" ]]; then
                local mod_time=$(stat -c %Y "$tasks_file" 2>/dev/null || echo 0)
                if [[ $mod_time -gt $latest_time ]]; then
                    latest_time=$mod_time
                    latest_change=$(basename "$change_dir")
                fi
            fi
        fi
    done
    
    if [[ -z "$latest_change" ]]; then
        log_error "No changes found with tasks.md in $changes_dir"
        exit 1
    fi
    
    log_verbose "Auto-detected change: $latest_change"
    printf "%s" "$latest_change"
}

read_openspec_artifacts() {
    local change_dir="$1"
    
    log_verbose "Reading OpenSpec artifacts..."
    
    local proposal_content=""
    local specs_content=""
    local design_content=""
    
    if [[ -f "$change_dir/proposal.md" ]]; then
        proposal_content=$(cat "$change_dir/proposal.md")
        log_verbose "Read proposal.md"
    fi
    
    if [[ -d "$change_dir/specs" ]]; then
        while IFS= read -r -d '' spec_file; do
            local spec_name=$(basename "$(dirname "$spec_file")")
            specs_content+="$spec_name/spec.md"$'\n'
            specs_content+="$(cat "$spec_file")"$'\n'$'\n'
            log_verbose "Read spec: $spec_name/spec.md"
        done < <(find "$change_dir/specs" -name "spec.md" -print0 | sort -z)
    fi
    
    if [[ -f "$change_dir/design.md" ]]; then
        design_content=$(cat "$change_dir/design.md")
        log_verbose "Read design.md"
    fi
    
    declare -g OPENSPEC_PROPOSAL="$proposal_content"
    declare -g OPENSPEC_SPECS="$specs_content"
    declare -g OPENSPEC_DESIGN="$design_content"
}

generate_prd() {
    local change_dir="$1"
    
    log_verbose "Generating PRD from OpenSpec artifacts..."
    
    local prd_content=""
    
    prd_content+="# Product Requirements Document"$'\n'$'\n'
    prd_content+="*Generated from OpenSpec artifacts*"$'\n'$'\n'
    
    prd_content+="## Proposal"$'\n'$'\n'
    prd_content+="$OPENSPEC_PROPOSAL"$'\n'$'\n'
    
    prd_content+="## Specifications"$'\n'$'\n'
    prd_content+="$OPENSPEC_SPECS"$'\n'$'\n'
    
    prd_content+="## Design"$'\n'$'\n'
    prd_content+="$OPENSPEC_DESIGN"$'\n'$'\n'
    
    # Add current task context for Ralph to use in commits
    local task_context
    task_context=$(get_current_task_context "$change_dir")
    
    if [[ -n "$task_context" ]]; then
        prd_content+="## Current Task Context"$'\n'$'\n'
        prd_content+="$task_context"$'\n'$'\n'
    fi
    
    echo "$prd_content"
}

write_prd() {
    local ralph_dir="$1"
    local prd_content="$2"
    
    log_verbose "Writing PRD.md to .ralph/ directory..."
    
    echo "$prd_content" > "$ralph_dir/PRD.md"
    
    log_verbose "PRD.md written to $ralph_dir/PRD.md"
}

parse_tasks() {
    local change_dir="$1"
    local tasks_file="$change_dir/tasks.md"
    
    log_verbose "Parsing tasks from tasks.md..."
    
    declare -g TASKS=()
    declare -g TASK_IDS=()
    declare -g TASKS_MD5=""
    
    if [[ -f "$tasks_file" ]]; then
        TASKS_MD5=$(md5sum "$tasks_file" | cut -d' ' -f1)
    fi
    
    log_verbose "Parsing tasks from tasks.md..."
    
    declare -g TASKS=()
    declare -g TASK_IDS=()
    
    local line_number=0
    while IFS= read -r line; do
        ((line_number++)) || true
        
        if [[ "$line" == "- [ ]"* ]]; then
            local task_desc="${line#- [ ] }"
            TASKS+=("$task_desc")
            TASK_IDS+=("$line_number")
            log_verbose "Found incomplete task (line $line_number): $task_desc"
        fi
    done < "$tasks_file"
    
    log_verbose "Found ${#TASKS[@]} incomplete tasks"
}

check_tasks_modified() {
    local change_dir="$1"
    local original_md5="$2"
    local tasks_file="$change_dir/tasks.md"
    
    if [[ ! -f "$tasks_file" ]]; then
        return 1
    fi
    
    local current_md5
    current_md5=$(md5sum "$tasks_file" | cut -d' ' -f1)
    
    if [[ "$current_md5" != "$original_md5" ]]; then
        return 0
    fi
    
    return 1
}

format_error_entry() {
    local task_id="$1"
    local task_description="$2"
    local error_output="$3"
    
    local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    
    echo "---"
    echo "Timestamp: $timestamp"
    echo "Task ID: $task_id"
    echo "Task: $task_description"
    echo ""
    echo "Error Output:"
    echo "$error_output"
    echo ""
}

append_error() {
    local ralph_dir="$1"
    local task_id="$2"
    local task_description="$3"
    local error_output="$4"
    
    local errors_file="$ralph_dir/errors.md"
    
    log_verbose "Appending error to errors.md..."
    
    local error_entry
    error_entry=$(format_error_entry "$task_id" "$task_description" "$error_output")
    
    echo "$error_entry" >> "$errors_file"
}

read_errors() {
    local ralph_dir="$1"
    local limit="${2:-10}"
    
    local errors_file="$ralph_dir/errors.md"
    
    if [[ ! -f "$errors_file" ]]; then
        return 0
    fi
    
    log_verbose "Reading errors from errors.md..."
    
    tail -n "$limit" "$errors_file"
}

clear_errors() {
    local ralph_dir="$1"
    
    local errors_file="$ralph_dir/errors.md"
    
    if [[ -f "$errors_file" ]]; then
        rm "$errors_file"
        log_verbose "Cleared errors.md"
    fi
}

archive_errors() {
    local ralph_dir="$1"
    
    local errors_file="$ralph_dir/errors.md"
    
    if [[ ! -f "$errors_file" ]]; then
        return 0
    fi
    
    local timestamp=$(date -u +"%Y%m%d_%H%M%S")
    local archive_file="$ralph_dir/errors_${timestamp}.md"
    
    cp "$errors_file" "$archive_file"
    log_verbose "Archived errors to $archive_file"
}

handle_context_injection() {
    local ralph_dir="$1"
    
    local injection_file="$ralph_dir/.context_injection"
    
    if [[ -f "$injection_file" ]]; then
        local injected_context
        injected_context=$(cat "$injection_file")
        rm "$injection_file"
        echo "$injected_context"
        return 0
    fi
    
    return 1
}

initialize_context_injections() {
    local ralph_dir="$1"
    
    local injections_file="$ralph_dir/context-injections.md"
    
    if [[ ! -f "$injections_file" ]]; then
        echo "# Context Injections" > "$injections_file"
        echo "" >> "$injections_file"
        log_verbose "Created context-injections.md"
    fi
}

validate_script_state() {
    local change_dir="$1"
    
    log_verbose "Validating script state..."
    
    local required_dirs=(
        ".ralph"
    )
    
    for dir in "${required_dirs[@]}"; do
        if [[ ! -d "$change_dir/$dir" ]]; then
            log_verbose "Required directory not found: $dir (will be created)"
        fi
    done
    
    local required_files=(
        "tasks.md"
        "proposal.md"
        "design.md"
    )
    
    for file in "${required_files[@]}"; do
        if [[ ! -f "$change_dir/$file" ]]; then
            log_error "Required file not found: $file"
            return 1
        fi
    done
    
    log_verbose "Script state validated"
    return 0
}

get_git_history() {
    local limit="${1:-10}"
    
    log_verbose "Retrieving git history (last $limit commits)..."
    
    local git_history=""
    git_history=$(git log -n "$limit" --pretty=format:"%h|%ad|%an|%s" --date=iso 2>/dev/null || echo "")
    
    if [[ -z "$git_history" ]]; then
        log_verbose "No git history found"
        return
    fi
    
    echo "$git_history"
}

gather_opencode_context() {
    local task_description="$1"
    
    log_verbose "Gathering minimal opencode context..."
    
    local context=""
    
    context+="## Task"$'\n'
    context+="$task_description"$'\n'$'\n'
    
    echo "$context"
}

generate_opencode_prompt() {
    local task_description="$1"
    local ralph_dir="$2"
    
    log_verbose "Generating minimal opencode prompt..."
    
    local context
    context=$(gather_opencode_context "$task_description")
    
    local prompt=""
    prompt+="Implement this task:"$'\n'
    prompt+="$context"$'\n'
    
    echo "$prompt"
}

sync_tasks_to_ralph() {
    local change_dir="$1"
    local ralph_dir="$2"
    
    local tasks_file="$change_dir/tasks.md"
    local ralph_tasks_file=".ralph/ralph-tasks.md"
    local old_ralph_tasks_file="$change_dir/.ralph/ralph-tasks.md"
    
    if [[ ! -f "$tasks_file" ]]; then
        log_error "Tasks file not found: $tasks_file"
        return 1
    fi
    
    local abs_tasks_file=$(realpath "$tasks_file" 2>/dev/null)
    
    # Clean up old Ralph tasks file in change directory if exists
    if [[ -f "$old_ralph_tasks_file" ]]; then
        log_verbose "Removing old Ralph tasks file from change directory: $old_ralph_tasks_file"
        rm "$old_ralph_tasks_file"
    fi
    
    # Use symlink so Ralph and openspec-apply-change work on the SAME file
    if [[ -L "$ralph_tasks_file" ]]; then
        log_verbose "Symlink exists, ensuring it points to correct location"
        local current_target=$(readlink -f "$ralph_tasks_file" 2>/dev/null || echo "")
        
        if [[ "$current_target" != "$abs_tasks_file" ]]; then
            log_verbose "Updating symlink to point to new change directory"
            ln -sf "$abs_tasks_file" "$ralph_tasks_file"
        fi
    elif [[ -f "$ralph_tasks_file" ]]; then
        # File exists but is not a symlink - replace with symlink
        log_verbose "Replacing regular file with symlink to openspec tasks..."
        rm "$ralph_tasks_file"
        ln -sf "$abs_tasks_file" "$ralph_tasks_file"
    else
        # No file exists - create new symlink
        log_verbose "Creating symlink from .ralph/ralph-tasks.md to openspec tasks..."
        ln -sf "$abs_tasks_file" "$ralph_tasks_file"
    fi
    
    log_verbose "Symlink configured: $ralph_tasks_file -> $abs_tasks_file"
}

create_prompt_template() {
    local change_dir="$1"
    local template_file="$2"
    
    log_verbose "Creating custom prompt template..."
    
    local abs_change_dir
    abs_change_dir=$(realpath "$change_dir" 2>/dev/null)
    
    cat > "$template_file" << 'EOF'
# Ralph Wiggum Task Execution - Iteration {{iteration}} / {{max_iterations}}

Change directory: {{change_dir}}

## OpenSpec Artifacts Context

Include full context from openspec artifacts in {{change_dir}}:
- Read {{change_dir}}/proposal.md for the overall project goal
- Read {{change_dir}}/design.md for the technical design approach
- Read {{change_dir}}/specs/*/spec.md for the detailed specifications

## Task List

{{tasks}}

## Instructions

1. **Identify** current task:
   - Find any task marked as [/] (in progress)
   - If no task is in progress, pick the first task marked as [ ] (incomplete)
   - Mark the task as [/] in the tasks file before starting work

2. **Implement** task using openspec-apply-change:
   - Use the /opsx-apply skill to implement the current task
   - Read the relevant openspec artifacts for context (proposal.md, design.md, specs)
   - Follow the openspec workflow to complete the task
   - The openspec-apply-change skill will implement changes and update task status automatically

3. **Complete** task:
   - Verify that the implementation meets the requirements
   - When the task is successfully completed, mark it as [x] in the tasks file
   - Output: `<promise>{{task_promise}}</promise>`

4. **Continue** to the next task:
   - The loop will continue with the next iteration
   - Find the next incomplete task and repeat the process

## Critical Rules

- Work on ONE task at a time from the task list
- Use openspec-apply-change (/opsx-apply) for implementation
- ONLY output `<promise>{{task_promise}}</promise>` when the current task is complete and marked as [x]
- ONLY output `<promise>{{completion_promise}}</promise>` when ALL tasks are [x]
- Output promise tags DIRECTLY - do not quote them, explain them, or say you "will" output them
- Do NOT lie or output false promises to exit the loop
- If stuck, try a different approach
- Check your work before claiming completion

## CRITICAL: Git Commit Format (MANDATORY)

When making git commits, you MUST use this EXACT format:

```
Ralph iteration <N>: <brief description of work completed>

Tasks completed:
- [x] <task.number> <task description text>
- [x] <task.number> <task description text>
...
```

**Requirements:**
1. Use iteration number from Ralph's state (e.g., "Ralph iteration 7")
2. Include a BRIEF description summarizing what was done
3. List ALL completed tasks with their numbers and full descriptions
4. Use the EXACT format: "- [x] <task.number> <task description>"
5. Read the "## Completed Tasks for Git Commit" section from the PRD for the task list

**FORBIDDEN:**
- DO NOT use generic messages like "work in progress" or "iteration N"
- DO NOT skip task numbers
- DO NOT truncate task descriptions
- DO NOT create commits without task information

**Example:**
```
Ralph iteration 7: Implement unit tests for response processing

Tasks completed:
- [x] 11.6 Write unit test for personality state management
- [x] 11.7 Write unit test for personality validation
- [x] 11.8 Write unit test for system prompt validation
```

{{context}}
EOF
    
    sed -i "s|{{change_dir}}|$abs_change_dir|g" "$template_file"
    
    log_verbose "Prompt template created: $template_file"
}

restore_ralph_state_from_tasks() {
    local tasks_file="$1"
    local ralph_loop_file=".ralph/ralph-loop.state.json"
    
    if [[ ! -f "$ralph_loop_file" ]]; then
        log_verbose "No Ralph state file found, nothing to restore"
        return 0
    fi
    
    # Read current iteration from state file - don't use completed task count
    local current_iteration
    current_iteration=$(jq -r '.iteration // 0' "$ralph_loop_file" 2>/dev/null || echo "0")
    
    # Count completed tasks for informational purposes only
    local completed_count=$(grep -c "^- \[x\]" "$tasks_file" 2>/dev/null || echo "0")
    log_verbose "Found $completed_count completed tasks in tasks.md (iteration $current_iteration)"
    
    # Read maxIterations from state file
    local max_iterations
    max_iterations=$(jq -r '.maxIterations // 50' "$ralph_loop_file" 2>/dev/null || echo "50")
    
    # Only update iteration if it's 0 or missing (fresh start)
    if [[ $current_iteration -eq 0 ]]; then
        log_verbose "Setting initial iteration to 1 (max: $max_iterations)"
        local updated_state
        updated_state=$(jq --argjson state "$(cat "$ralph_loop_file")" '
            .iteration = 1 |
            .active = true
        ' 2>/dev/null)
        
        if [[ -n "$updated_state" ]]; then
            echo "$updated_state" > "$ralph_loop_file"
        fi
    else
        log_verbose "Ralph state preserved at iteration $current_iteration"
    fi
}

get_current_task_context() {
    local change_dir="$1"
    local tasks_file="$change_dir/tasks.md"
    
    if [[ ! -f "$tasks_file" ]]; then
        echo ""
        return
    fi
    
    log_verbose "Reading current task context from tasks.md..."
    
    local context=""
    local found_task=false
    local all_completed_tasks=""
    local current_task_desc=""
    
    while IFS= read -r line; do
        if [[ "$line" =~ ^-\ \[/\] ]]; then
            # Found in-progress task - extract description
            current_task_desc="${line#- [/] }"
            found_task=true
            break
        elif [[ "$line" =~ ^-\ \[\ \] ]] && [[ "$found_task" == "false" ]]; then
            # Found incomplete task - extract description
            current_task_desc="${line#- [ ] }"
            found_task=true
            break
        fi
    done < "$tasks_file"
    
    # Also collect all completed tasks for commit message
    local line_number=0
    while IFS= read -r line; do
        ((line_number++)) || true
        if [[ "$line" =~ ^-\ \[x\] ]]; then
            # Use the full line as-is to preserve task number and description
            all_completed_tasks+="$line"$'\n'
        fi
    done < "$tasks_file"
    
    if [[ "$found_task" == "true" ]]; then
        context="## Current Task"$'\n'
        context+="- $current_task_desc"$'\n'
    fi
    
    if [[ -n "$all_completed_tasks" ]]; then
        context+="## Completed Tasks for Git Commit"$'\n'
        context+="$all_completed_tasks"
    fi
    
    echo "$context"
}

setup_output_capture() {
    local ralph_dir="$1"
    
    log_verbose "Setting up output capture..."
    
    # Create timestamped output directory in /tmp
    local timestamp=$(date +"%Y%m%d_%H%M%S")
    local output_dir="/tmp/ralph-run-$timestamp"
    
    mkdir -p "$output_dir"
    log_info "Output directory: $output_dir"
    
    # Store output directory path in Ralph directory for reference
    echo "$output_dir" > "$ralph_dir/.output_dir"
    
    echo "$output_dir"
}

cleanup_old_output() {
    log_verbose "Cleaning up old Ralph output directories..."
    
    # Keep last 3 Ralph output directories, delete older ones
    find /tmp -type d -name "ralph-run-*" -mtime +7d 2>/dev/null | while read old_dir; do
        log_verbose "Removing old output directory: $old_dir"
        rm -rf "$old_dir"
    done
}

execute_ralph_loop() {
    local change_dir="$1"
    local ralph_dir="$2"
    local max_iterations="${3:-50}"
    
    log_info "Starting Ralph Wiggum loop with open-ralph-wiggum..."
    log_info "Max iterations: $max_iterations"
    log_info "Change directory: $change_dir"
    
    if ! command -v ralph &> /dev/null; then
        log_error "ralph CLI not found."
        log_error "Please install open-ralph-wiggum: npm install -g @th0rgal/ralph-wiggum"
        return 1
    fi
    
    local template_file="$ralph_dir/prompt-template.md"
    
    # Clean up old output directories and setup new one
    cleanup_old_output
    local output_dir=$(setup_output_capture "$ralph_dir")
    
    sync_tasks_to_ralph "$change_dir" "$ralph_dir"
    create_prompt_template "$change_dir" "$template_file"
    
    # Generate PRD and write to file
    local prd_content
    prd_content=$(generate_prd "$change_dir")
    echo "$prd_content" > "$ralph_dir/PRD.md"
    
    # Get current task context for Ralph to use in commits
    local task_context
    task_context=$(get_current_task_context "$change_dir")
    
    # Create context injection file for Ralph
    local context_file="$ralph_dir/.context_injection"
    if [[ -n "$task_context" ]]; then
        log_verbose "Writing task context injection..."
        echo "$task_context" > "$context_file"
    fi
    
    # Restore Ralph state from tasks.md before running
    restore_ralph_state_from_tasks "$change_dir/tasks.md"
    
    # Initialize context injections file for Ralph to read context
    initialize_context_injections "$ralph_dir"
    
    # Output files
    local stdout_log="$output_dir/ralph-stdout.log"
    local stderr_log="$output_dir/ralph-stderr.log"
    
    log_info "Delegating to ralph CLI..."
    log_info "Capturing output to: $output_dir"
    
    # Run Ralph and capture output to both console and files
    {
        ralph --prompt-file "$ralph_dir/PRD.md" \
            --agent opencode \
            --tasks \
            --max-iterations "$max_iterations" \
            --prompt-template "$template_file" \
            --verbose-tools
    } > >(tee "$stdout_log") 2> >(tee "$stderr_log")
    
    return $?
}



main() {
    parse_arguments "$@"
    
    log_verbose "Starting ralph-run v$VERSION"
    log_verbose "Change name: ${CHANGE_NAME:-<auto-detect>}"
    
    validate_git_repository
    validate_dependencies
    
    if [[ -z "$CHANGE_NAME" ]]; then
        CHANGE_NAME=$(auto_detect_change)
        log_info "Auto-detected change: $CHANGE_NAME"
    fi
    
    local change_dir="openspec/changes/$CHANGE_NAME"
    validate_openspec_artifacts "$change_dir"
    validate_script_state "$change_dir"
    local ralph_dir=$(setup_ralph_directory "$change_dir")
    
    log_info "Change directory: $change_dir"
    log_info "Ralph directory: $ralph_dir"
    
    read_openspec_artifacts "$change_dir"
    local prd_content=$(generate_prd "$change_dir")
    write_prd "$ralph_dir" "$prd_content"
    
    parse_tasks "$change_dir"
    
    log_info "PRD generation complete"
    log_info "Found ${#TASKS[@]} tasks to execute"
    
    local max_iterations="${MAX_ITERATIONS:-50}"
    
    execute_ralph_loop "$change_dir" "$ralph_dir" "$max_iterations"
    
    log_info "ralph-run.sh initialized successfully"
}

main "$@"
