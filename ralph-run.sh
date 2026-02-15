#!/bin/bash

set -e
trap 'handle_error $?' EXIT

VERSION="0.1.0"
CHANGE_NAME=""
ERROR_OCCURRED=false

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
ralph-run.sh - OpenSpec + open-ralph-wiggum integration

USAGE:
    ./ralph-run.sh [OPTIONS]

OPTIONS:
    --change <name>     Specify the OpenSpec change to execute (default: auto-detect)
    --verbose, -v       Enable verbose mode for debugging
    --help, -h          Show this help message

EXAMPLES:
    ./ralph-run.sh                          # Auto-detect most recent change
    ./ralph-run.sh --change my-feature     # Execute specific change
    ./ralph-run.sh --verbose                # Run with debug output

EOF
}

parse_arguments() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            --change)
                CHANGE_NAME="$2"
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
        echo "[VERBOSE] $*"
    fi
}

log_info() {
    echo "[INFO] $*"
}

log_error() {
    echo "[ERROR] $*" >&2
}

validate_git_repository() {
    log_verbose "Validating git repository..."
    
    if ! git rev-parse --git-dir > /dev/null 2>&1; then
        log_error "Not a git repository. Please run this script within a git repository."
        exit 1
    fi
    
    log_verbose "Git repository validated"
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
    prd_content+="$OPENSPEC_DESIGN"$'\n'
    
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
    
    log_verbose "Gathering opencode context..."
    
    local context=""
    
    context+="## Task"$'\n'
    context+="$task_description"$'\n'$'\n'
    
    context+="## Proposal Summary"$'\n'
    context+="$(echo "$OPENSPEC_PROPOSAL" | head -20)"$'\n'$'\n'
    
    context+="## Design Decisions"$'\n'
    context+="$(echo "$OPENSPEC_DESIGN" | head -30)"$'\n'$'\n'
    
    context+="## Specifications"$'\n'
    context+="$(echo "$OPENSPEC_SPECS" | head -50)"$'\n'$'\n'
    
    echo "$context"
}

generate_opencode_prompt() {
    local task_description="$1"
    local ralph_dir="$2"
    
    log_verbose "Generating opencode prompt..."
    
    local context
    context=$(gather_opencode_context "$task_description")
    
    local prompt=""
    prompt+="You are implementing a task as part of an OpenSpec change."$'\n'$'\n'
    prompt+="$context"$'\n'
    
    prompt+="## Recent Git History"$'\n'
    local git_history
    git_history=$(get_git_history 10)
    if [[ -n "$git_history" ]]; then
        echo "$git_history" | while IFS='|' read -r hash date author message; do
            prompt+="- $hash ($date $author): $message"$'\n'
        done
    fi
    prompt+=$'\n'
    
    prompt+="## Error History"$'\n'
    local errors_file="$ralph_dir/errors.md"
    if [[ -f "$errors_file" ]]; then
        prompt+="$(cat "$errors_file" | tail -50)"$'\n'
    else
        prompt+="(No previous errors)"$'\n'
    fi
    prompt+=$'\n'
    
    prompt+="## Instructions"$'\n'
    prompt+="Implement the task above. Use the context provided to understand the requirements and any relevant design decisions."$'\n'
    prompt+="If there are previous errors, use them to guide your implementation to avoid repeating mistakes."$'\n'
    
    local injected_context
    if injected_context=$(handle_context_injection "$ralph_dir"); then
        prompt+=$'\n'
        prompt+="## Injected Context"$'\n'
        prompt+="$injected_context"$'\n'
    fi
    
    echo "$prompt"
}

execute_opencode() {
    local prompt="$1"
    
    log_verbose "Executing opencode CLI..."
    
    if ! command -v opencode &> /dev/null; then
        log_error "opencode CLI not found. Please install opencode."
        return 1
    fi
    
    local output
    output=$(echo "$prompt" | opencode 2>&1)
    local exit_code=$?
    
    echo "$output"
    return $exit_code
}

create_git_commit() {
    local task_description="$1"
    
    log_verbose "Creating git commit..."
    
    if ! git diff-index --quiet HEAD --; then
        git add -A
        git commit -m "$task_description" 2>&1
        log_verbose "Git commit created"
    else
        log_verbose "No changes to commit"
    fi
}

execute_task_loop() {
    local ralph_dir="$1"
    
    log_info "Starting task execution loop..."
    
    local total_tasks=${#TASKS[@]}
    log_info "Total tasks to execute: $total_tasks"
    
    for i in "${!TASKS[@]}"; do
        local task_description="${TASKS[$i]}"
        local task_id="${TASK_IDS[$i]}"
        
        log_info "Executing task $((i+1))/$total_tasks: $task_description"
        
        local prompt
        prompt=$(generate_opencode_prompt "$task_description" "$ralph_dir")
        
        local output
        output=$(execute_opencode "$prompt")
        local exit_code=$?
        
        if [[ $exit_code -eq 0 ]]; then
            log_info "Task completed successfully"
            create_git_commit "$task_description"
        else
            log_error "Task failed with exit code: $exit_code"
            log_error "Output: $output"
            break
        fi
    done
    
    log_info "Task execution loop complete"
}

initialize_tracking() {
    local ralph_dir="$1"
    local tracking_file="$ralph_dir/tracking.json"
    
    log_verbose "Initializing tracking..."
    
    if [[ ! -f "$tracking_file" ]]; then
        log_verbose "Creating tracking.json..."
        echo '{"tasks":{}}' > "$tracking_file"
    fi
    
    echo "$tracking_file"
}

read_tracking() {
    local tracking_file="$1"
    
    log_verbose "Reading tracking.json..."
    
    if [[ -f "$tracking_file" ]]; then
        cat "$tracking_file"
    else
        echo '{"tasks":{}}'
    fi
}

update_task_checkbox() {
    local change_dir="$1"
    local task_id="$2"
    local complete="$3"
    
    log_verbose "Updating task checkbox (line $task_id, complete=$complete)..."
    
    local tasks_file="$change_dir/tasks.md"
    local temp_file=$(mktemp)
    
    local line_number=0
    while IFS= read -r line; do
        ((line_number++)) || true
        
        if [[ $line_number -eq $task_id ]]; then
            if [[ "$complete" == "true" ]]; then
                echo "${line/- \[ \]/- [x]}" >> "$temp_file"
            else
                echo "${line/- \[x\]/- [ ]}" >> "$temp_file"
            fi
        else
            echo "$line" >> "$temp_file"
        fi
    done < "$tasks_file"
    
    mv "$temp_file" "$tasks_file"
}

update_tracking() {
    local tracking_file="$1"
    local task_id="$2"
    local complete="$3"
    
    log_verbose "Updating tracking.json (task $task_id, complete=$complete)..."
    
    local status="pending"
    if [[ "$complete" == "true" ]]; then
        status="complete"
    fi
    
    local tracking_json
    tracking_json=$(cat "$tracking_file")
    
    local updated_json
    updated_json=$(echo "$tracking_json" | jq --arg id "$task_id" --arg status "$status" '.tasks[$id] = {status: $status}' 2>/dev/null || echo '{"tasks":{}}')
    
    echo "$updated_json" > "$tracking_file"
}

update_task_status_atomic() {
    local change_dir="$1"
    local task_id="$2"
    local complete="$3"
    local tracking_file="$4"
    
    log_verbose "Updating task status atomically..."
    
    local tasks_file="$change_dir/tasks.md"
    local tasks_backup="${tasks_file}.bak"
    local tracking_backup="${tracking_file}.bak"
    
    cp "$tasks_file" "$tasks_backup"
    cp "$tracking_file" "$tracking_backup"
    
    update_task_checkbox "$change_dir" "$task_id" "$complete"
    update_tracking "$tracking_file" "$task_id" "$complete"
    
    if [[ ! -f "$tasks_file" ]] || [[ ! -f "$tracking_file" ]]; then
        log_error "Update failed: files not found"
        mv "$tasks_backup" "$tasks_file"
        mv "$tracking_backup" "$tracking_file"
        return 1
    fi
    
    rm "$tasks_backup"
    rm "$tracking_backup"
    
    log_verbose "Atomic update successful"
    return 0
}

main() {
    parse_arguments "$@"
    
    log_verbose "Starting ralph-run.sh v$VERSION"
    log_verbose "Change name: ${CHANGE_NAME:-<auto-detect>}"
    
    validate_git_repository
    
    if [[ -z "$CHANGE_NAME" ]]; then
        CHANGE_NAME=$(auto_detect_change)
        log_info "Auto-detected change: $CHANGE_NAME"
    fi
    
    local change_dir="openspec/changes/$CHANGE_NAME"
    validate_openspec_artifacts "$change_dir"
    validate_script_state "$change_dir"
    local ralph_dir=$(setup_ralph_directory "$change_dir")
    local tracking_file=$(initialize_tracking "$ralph_dir")
    
    log_info "Change directory: $change_dir"
    log_info "Ralph directory: $ralph_dir"
    
    read_openspec_artifacts "$change_dir"
    local prd_content=$(generate_prd "$change_dir")
    write_prd "$ralph_dir" "$prd_content"
    
    parse_tasks "$change_dir"
    
    log_info "PRD generation complete"
    log_info "Found ${#TASKS[@]} tasks to execute"
    
    execute_task_loop "$ralph_dir"
    
    log_info "ralph-run.sh initialized successfully"
}

main "$@"
