#!/bin/bash

VERSION="1.0.0"

# Detect OS for cross-platform compatibility
detect_os() {
    case "$(uname -s)" in
        Linux*)     OS="Linux";;
        Darwin*)    OS="macOS";;
        *)          OS="Unknown";;
    esac
}

detect_os

# Cross-platform file modification time
get_file_mtime() {
    local file="$1"
    if [[ "$OS" == "macOS" ]]; then
        stat -f %m "$file" 2>/dev/null || echo 0
    else
        stat -c %Y "$file" 2>/dev/null || echo 0
    fi
}

# Cross-platform MD5 hash
get_file_md5() {
    local file="$1"
    if command -v md5sum >/dev/null 2>&1; then
        md5sum "$file" | cut -d' ' -f1
    elif command -v md5 >/dev/null 2>&1; then
        md5 -q "$file"
    else
        echo "0"
    fi
}

# Cross-platform realpath with fallback
get_realpath() {
    local path="$1"
    if command -v realpath >/dev/null 2>&1; then
        realpath "$path" 2>/dev/null || echo ""
    elif readlink -f / >/dev/null 2>&1; then
        readlink -f "$path" 2>/dev/null || echo ""
    else
        # Fallback for systems without realpath
        local dir
        dir=$(cd "$(dirname "$path")" 2>/dev/null && pwd -P || echo "")
        if [[ -n "$dir" ]]; then
            echo "$dir/$(basename "$path")"
        else
            echo ""
        fi
    fi
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOCAL_NODE_BIN="$SCRIPT_DIR/../node_modules/.bin"
# Allow tests to inject a mock by setting MINI_RALPH_CLI_OVERRIDE in the environment
MINI_RALPH_CLI="${MINI_RALPH_CLI_OVERRIDE:-$SCRIPT_DIR/mini-ralph-cli.js}"

if [[ -d "$LOCAL_NODE_BIN" ]]; then
    case ":$PATH:" in
        *":$LOCAL_NODE_BIN:"*) ;;
        *) export PATH="$LOCAL_NODE_BIN:$PATH" ;;
    esac
fi

get_temp_root() {
    local temp_root="${TMPDIR:-/tmp}"
    temp_root="${temp_root%/}"

    if [[ -z "$temp_root" ]]; then
        temp_root="/tmp"
    fi

    printf "%s" "$temp_root"
}

make_temp_dir() {
    local prefix="${1:-ralph-run}"
    local temp_root
    temp_root=$(get_temp_root)

    local temp_dir=""
    temp_dir=$(mktemp -d "${temp_root}/${prefix}-XXXXXX" 2>/dev/null) || \
        temp_dir=$(mktemp -d -t "$prefix" 2>/dev/null) || \
        temp_dir=""

    if [[ -n "$temp_dir" ]]; then
        printf "%s" "$temp_dir"
        return 0
    fi

    local fallback_dir="${temp_root}/${prefix}-$(date +"%Y%m%d_%H%M%S")-$$"
    mkdir -p "$fallback_dir"
    printf "%s" "$fallback_dir"
}

resolve_ralph_command() {
    if [[ -f "$MINI_RALPH_CLI" ]] && command -v node >/dev/null 2>&1; then
        return 0
    fi
    return 1
}

CHANGE_NAME=""
MAX_ITERATIONS=""
NO_COMMIT=false
SHOW_STATUS=false
ADD_CONTEXT=""
CLEAR_CONTEXT=false
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
    
    # NOTE: We do NOT kill node processes here because:
    # 1. The mini Ralph runtime runs synchronously in the foreground
    # 2. Ctrl+C (SIGINT) naturally propagates to child processes
    # 3. The shell's process group handling ensures clean termination.
    
    if [[ $exit_code -ne 0 ]]; then
        log_error "Script terminated with exit code: $exit_code"
    fi
    exit $exit_code
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    trap 'cleanup $?' EXIT INT TERM QUIT
fi

handle_error() {
    local exit_code=$1
    if [[ $exit_code -ne 0 ]]; then
        ERROR_OCCURRED=true
        log_error "Script failed with exit code: $exit_code"
        log_error "Use --verbose flag for more debugging information"
    fi
}
VERBOSE=false
QUIET=false
SHOW_HELP=false

usage() {
    cat << EOF
ralph-run - OpenSpec + Ralph Loop integration for iterative development with opencode

USAGE:
    ralph-run [OPTIONS]

OPTIONS:
    --change <name>          Specify the OpenSpec change to execute (default: auto-detect)
    --max-iterations <n>     Maximum iterations for Ralph loop (default: 50)
    --no-commit              Suppress automatic git commits during the loop
    --verbose, -v            Enable verbose mode for debugging
    --quiet                  Suppress the per-iteration progress stream
    --help, -h               Show this help message

OBSERVABILITY AND CONTROL:
    --status                 Print the current loop status dashboard and exit
    --add-context <text>     Add pending context to inject into the next iteration and exit
    --clear-context          Clear any pending context and exit

EXAMPLES:
    ralph-run                                    # Auto-detect most recent change
    ralph-run --change my-feature                # Execute specific change
    ralph-run --change my-feature --max-iterations 100
    ralph-run --change my-feature --no-commit    # Run without auto-committing
    ralph-run --verbose                          # Run with debug output
    ralph-run --status                           # Check status of the active loop
    ralph-run --add-context "Focus on error handling in module X"
    ralph-run --clear-context                    # Remove pending context

PREREQUISITES:
    - Git repository (git init)
    - OpenSpec artifacts created (openspec init, openspec new change, then complete the generated artifacts)
    - opencode CLI installed (npm install -g opencode-ai)

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
            --no-commit)
                NO_COMMIT=true
                shift
                ;;
            --verbose|-v)
                VERBOSE=true
                shift
                ;;
            --quiet)
                QUIET=true
                shift
                ;;
            --status)
                SHOW_STATUS=true
                shift
                ;;
            --add-context)
                ADD_CONTEXT="$2"
                shift 2
                ;;
            --clear-context)
                CLEAR_CONTEXT=true
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
    
    if ! resolve_ralph_command; then
        log_error "Internal mini Ralph runtime not found: $MINI_RALPH_CLI"
        log_error "Ensure node is installed and spec-and-loop dependencies are up to date (npm install)."
        exit 1
    fi
    log_verbose "Found internal mini Ralph runtime: $MINI_RALPH_CLI"
    
    # Check for opencode
    if ! command -v opencode &> /dev/null; then
        log_error "opencode CLI not found."
        log_error "Please install opencode: npm install -g opencode-ai"
        exit 1
    fi
    log_verbose "Found: opencode"

    # Check for jq
    if ! command -v jq &> /dev/null; then
        log_error "jq CLI not found."
        log_error "Please install jq: brew install jq / apt-get install jq"
        exit 1
    fi
    log_verbose "Found: jq"
    
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
                local mod_time=$(get_file_mtime "$tasks_file")
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
    
    OPENSPEC_PROPOSAL="$proposal_content"
    OPENSPEC_SPECS="$specs_content"
    OPENSPEC_DESIGN="$design_content"
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
    # (Removed: task context is now provided via {{task_context}} template variable only)
    
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
    
    TASKS=()
    TASK_IDS=()
    TASKS_MD5=""
    
    if [[ -f "$tasks_file" ]]; then
        TASKS_MD5=$(get_file_md5 "$tasks_file")
    fi
    
    log_verbose "Parsing tasks from tasks.md..."
    
    TASKS=()
    TASK_IDS=()
    
    local line_number=0
    while IFS= read -r line; do
        ((line_number++)) || true
        
        if [[ "$line" == "- [ ]"* ]]; then
            local task_desc="${line#- \[ \] }"
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
    current_md5=$(get_file_md5 "$tasks_file")
    
    if [[ "$current_md5" != "$original_md5" ]]; then
        return 0
    fi
    
    return 1
}

# DEPRECATED: The following functions are superseded by lib/mini-ralph/errors.js.
# Do not add new callers. These will be removed in a future cleanup.
# See: lib/mini-ralph/errors.js for the current implementation.

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
    local ralph_tasks_file="$ralph_dir/ralph-tasks.md"
    local old_ralph_tasks_file="$change_dir/.ralph/ralph-tasks.md"
    
    if [[ ! -f "$tasks_file" ]]; then
        log_error "Tasks file not found: $tasks_file"
        return 1
    fi
    
    # Ensure the ralph directory exists
    if [[ ! -d "$ralph_dir" ]]; then
        mkdir -p "$ralph_dir"
        log_verbose "Created ralph dir: $ralph_dir"
    fi

    # Resolve absolute path to tasks file (portable across Linux/macOS)
    local abs_tasks_file=""
    abs_tasks_file=$(get_realpath "$tasks_file")
    
    # Clean up old Ralph tasks file in change directory if exists
    if [[ -f "$old_ralph_tasks_file" ]]; then
        log_verbose "Removing old Ralph tasks file from change directory: $old_ralph_tasks_file"
        rm "$old_ralph_tasks_file"
    fi
    
    # Use a symlink so the loop runtime always works against the OpenSpec tasks file
    # Ensure parent directory for ralph_tasks_file exists
    mkdir -p "$(dirname "$ralph_tasks_file")"

    if [[ -L "$ralph_tasks_file" ]]; then
        log_verbose "Symlink exists, ensuring it points to correct location"
        local current_target=""
        current_target=$(get_realpath "$ralph_tasks_file")

        if [[ "$current_target" != "$abs_tasks_file" ]]; then
            log_verbose "Updating symlink to point to new change directory"
            ln -sf "$abs_tasks_file" "$ralph_tasks_file"
        fi
    elif [[ -f "$ralph_tasks_file" ]]; then
        # File exists but is not a symlink - replace with symlink
        log_verbose "Replacing regular file with symlink to openspec tasks..."
        rm -f "$ralph_tasks_file"
        ln -sf "$abs_tasks_file" "$ralph_tasks_file"
    else
        # No file exists - create new symlink
        log_verbose "Creating symlink from $ralph_tasks_file to openspec tasks..."
        ln -sf "$abs_tasks_file" "$ralph_tasks_file"
    fi
    
    log_verbose "Symlink configured: $ralph_tasks_file -> $abs_tasks_file"
}

create_prompt_template() {
    local change_dir="$1"
    local template_file="$2"
    
    log_verbose "Creating custom prompt template..."
    
    local abs_change_dir
    abs_change_dir=$(get_realpath "$change_dir")
    
    cat > "$template_file" << 'EOF'
# Ralph Wiggum Task Execution - Iteration {{iteration}} / {{max_iterations}}

Change directory: {{change_dir}}

## OpenSpec Artifacts

{{_openspec_manifest}}

## Fresh Task Context

{{task_context}}

## Instructions

Before implementing, read the OpenSpec artifacts listed above that are relevant to the current task.

Follow this loop contract EXACTLY. Do not skip steps. Do not batch. Do not output a promise until every step is done.

1. Work on the task shown in `## Fresh Task Context` above. Before editing any marker, open `tasks.md` at `{{change_dir}}/tasks.md` and verify that same task is still `- [ ] ` or `- [/] ` on disk (it may have been closed by a prior iteration if you are resuming).
2. Edit `tasks.md` in place to change that line's marker to `- [/] ` (in-progress). You MUST use your file edit tool to modify the file on disk — a shell `cp`, `sed`, or print-to-stdout does not count. Verify by re-reading the file.
3. Implement the smallest change that fully satisfies the task's Done-when conditions. Run the task's verification command if one is specified.
4. On success, edit `tasks.md` again in place to change that line's marker from `- [/] ` to `- [x] `. Verify by re-reading the file and confirming the `[x]` is present on that exact line.
5. ONLY after step 4 writes `[x]` to disk, output `<promise>{{task_promise}}</promise>` on its own line.
6. If and only if EVERY task line in `tasks.md` is `- [x] `, output `<promise>{{completion_promise}}</promise>` instead.

Hard rules:
- If you do not actually modify `tasks.md` on disk in this iteration, DO NOT output any promise tag. Output a short failure note instead and stop.
- Never output `<promise>{{task_promise}}</promise>` while the task you just worked on is still `- [ ]` on disk. That causes the same task to repeat forever.
- Promise tags must be on their own line, literal, unquoted, and not described in prose.
- If an approach fails twice, try a different one.
- If the task is already satisfied by prior work (e.g. target file already exists with the right content), you STILL must flip the checkbox to `[x]` in `tasks.md` before emitting the promise.

## Commit Contract

{{commit_contract}}
EOF
    
    # Determine repo root for AGENTS.md probe
    local repo_root
    repo_root=$(git rev-parse --show-toplevel 2>/dev/null) || repo_root=""
    
    # Build the manifest body
    local manifest_body
    manifest_body="Read these as needed (source of truth for this change):"$'\n'$'\n'
    manifest_body+="- $abs_change_dir/proposal.md"$'\n'
    manifest_body+="- $abs_change_dir/design.md"$'\n'
    
    # Pre-expand specs/*/spec.md into concrete paths
    if [[ -d "$abs_change_dir/specs" ]]; then
        while IFS= read -r spec_path; do
            [[ -n "$spec_path" ]] && manifest_body+="- $spec_path"$'\n'
        done < <(find "$abs_change_dir/specs" -name spec.md -type f 2>/dev/null | sort)
    fi
    
    manifest_body+="- .ralph/PRD.md    (pre-concatenated convenience copy of the above)"
    
    # Optionally append AGENTS.md reference
    local agents_line
    agents_line=$(probe_agents_md "$repo_root")
    if [[ -n "$agents_line" ]]; then
        manifest_body+=$'\n'"$agents_line"
    fi
    
    # Substitute {{_openspec_manifest}} using awk with a manifest temp file
    # (awk -v cannot handle multi-line values; use getline from a file instead)
    local _manifest_file
    _manifest_file=$(mktemp 2>/dev/null || mktemp -t ralph-manifest)
    printf '%s' "$manifest_body" > "$_manifest_file"
    local _tmpfile
    _tmpfile=$(mktemp 2>/dev/null || mktemp -t ralph-template)
    awk -v mf="$_manifest_file" '
        {
            if ($0 == "{{_openspec_manifest}}") {
                while ((getline line < mf) > 0) { print line }
                close(mf)
            } else { print }
        }
    ' "$template_file" > "$_tmpfile" && mv "$_tmpfile" "$template_file"
    rm -f "$_manifest_file"
    
    # Substitute {{change_dir}}
    _tmpfile=$(mktemp 2>/dev/null || mktemp -t ralph-template)
    sed "s|{{change_dir}}|$abs_change_dir|g" "$template_file" > "$_tmpfile" && mv "$_tmpfile" "$template_file"
    
    log_verbose "Prompt template created: $template_file"
}

probe_agents_md() {
    local repo_root="$1"
    if [[ -n "$repo_root" && -r "$repo_root/AGENTS.md" ]]; then
        echo "- AGENTS.md    (project-level build/test guide)"
    else
        echo ""
    fi
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
            current_task_desc="${line#- \[/\] }"
            found_task=true
            break
        elif [[ "$line" =~ ^-\ \[\ \] ]] && [[ "$found_task" == "false" ]]; then
            # Found incomplete task - extract description
            current_task_desc="${line#- \[ \] }"
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
    
    # Use the system temp directory so macOS and Linux both work naturally.
    local output_dir
    output_dir=$(make_temp_dir "ralph-run")
    log_info "Output directory: $output_dir"
    
    # Store output directory path in Ralph directory for reference
    echo "$output_dir" > "$ralph_dir/.output_dir"
    
    echo "$output_dir"
}

cleanup_old_output() {
    log_verbose "Cleaning up old Ralph output directories..."
    
    local temp_root
    temp_root=$(get_temp_root)
    
    # Keep last 3 Ralph output directories, delete older ones
    find "$temp_root" -type d -name "ralph-run*" -mtime +7 2>/dev/null | while IFS= read -r old_dir; do
        log_verbose "Removing old output directory: $old_dir"
        rm -rf "$old_dir"
    done
}

execute_ralph_loop() {
    local change_dir="$1"
    local ralph_dir="$2"
    local max_iterations="${3:-50}"
    local no_commit="${4:-false}"
    
    log_info "Starting internal mini Ralph loop..."
    log_info "Max iterations: $max_iterations"
    log_info "Change directory: $change_dir"
    if [[ "$no_commit" == true ]]; then
        log_info "Auto-commit disabled (--no-commit)"
    fi
    
    if ! resolve_ralph_command; then
        log_error "Internal mini Ralph runtime not found: $MINI_RALPH_CLI"
        log_error "Ensure node is installed and spec-and-loop dependencies are up to date (npm install)."
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
    
    # Output files
    local stdout_log="$output_dir/ralph-stdout.log"
    local stderr_log="$output_dir/ralph-stderr.log"
    
    log_info "Invoking internal mini Ralph runtime..."
    log_info "Capturing output to: $output_dir"
    
    # Build the mini-ralph-cli arguments
    local mini_ralph_args=(
        "--prompt-file" "$ralph_dir/PRD.md"
        "--prompt-template" "$template_file"
        "--ralph-dir" "$ralph_dir"
        "--tasks-file" "$change_dir/tasks.md"
        "--tasks"
        "--max-iterations" "$max_iterations"
    )

    if [[ "$no_commit" == true ]]; then
        mini_ralph_args+=("--no-commit")
    fi

    if [[ "$VERBOSE" == true ]]; then
        mini_ralph_args+=("--verbose")
    fi

    if [[ "$QUIET" == true ]]; then
        mini_ralph_args+=("--quiet")
    fi

    # Run the internal mini Ralph CLI and capture output
    {
        node "$MINI_RALPH_CLI" "${mini_ralph_args[@]}"
    } > >(tee "$stdout_log") 2> >(tee "$stderr_log")
    
    return $?
}


# ---------------------------------------------------------------------------
# Observability and control commands
#
# These commands delegate to the internal mini-ralph-cli.js for status,
# context management, and other loop controls without running the full loop.
# ---------------------------------------------------------------------------

run_observability_command() {
    local change_name="$1"
    local command="$2"
    local arg="$3"

    if [[ ! -f "$MINI_RALPH_CLI" ]]; then
        log_error "Internal mini-ralph-cli.js not found: $MINI_RALPH_CLI"
        exit 1
    fi

    if [[ ! -x "$(command -v node)" ]]; then
        log_error "node is required but not found in PATH."
        exit 1
    fi

    local change_dir="openspec/changes/$change_name"
    local ralph_dir="$change_dir/.ralph"

    case "$command" in
        status)
            local tasks_file="$change_dir/tasks.md"
            local tasks_arg=""
            if [[ -f "$tasks_file" ]]; then
                tasks_arg="--tasks-file $tasks_file"
            fi
            # shellcheck disable=SC2086
            node "$MINI_RALPH_CLI" --ralph-dir "$ralph_dir" --status $tasks_arg
            ;;
        add-context)
            node "$MINI_RALPH_CLI" --ralph-dir "$ralph_dir" --add-context "$arg"
            ;;
        clear-context)
            node "$MINI_RALPH_CLI" --ralph-dir "$ralph_dir" --clear-context
            ;;
        *)
            log_error "Unknown observability command: $command"
            exit 1
            ;;
    esac
}

main() {
    set -e
    parse_arguments "$@"
    
    log_verbose "Starting ralph-run v$VERSION"
    log_verbose "Change name: ${CHANGE_NAME:-<auto-detect>}"

    # Resolve change name first for observability commands that need it
    if [[ -z "$CHANGE_NAME" ]] && ( [[ "$SHOW_STATUS" == true ]] || [[ -n "$ADD_CONTEXT" ]] || [[ "$CLEAR_CONTEXT" == true ]] ); then
        validate_git_repository
        CHANGE_NAME=$(auto_detect_change)
        log_verbose "Auto-detected change for observability: $CHANGE_NAME"
    fi

    # Handle observability commands (status, add-context, clear-context)
    # These exit early without running the full loop.
    if [[ "$SHOW_STATUS" == true ]]; then
        if [[ -z "$CHANGE_NAME" ]]; then
            validate_git_repository
            CHANGE_NAME=$(auto_detect_change)
        fi
        run_observability_command "$CHANGE_NAME" "status"
        exit $?
    fi

    if [[ -n "$ADD_CONTEXT" ]]; then
        if [[ -z "$CHANGE_NAME" ]]; then
            validate_git_repository
            CHANGE_NAME=$(auto_detect_change)
        fi
        run_observability_command "$CHANGE_NAME" "add-context" "$ADD_CONTEXT"
        exit $?
    fi

    if [[ "$CLEAR_CONTEXT" == true ]]; then
        if [[ -z "$CHANGE_NAME" ]]; then
            validate_git_repository
            CHANGE_NAME=$(auto_detect_change)
        fi
        run_observability_command "$CHANGE_NAME" "clear-context"
        exit $?
    fi

    # Normal loop execution path
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
    
    execute_ralph_loop "$change_dir" "$ralph_dir" "$max_iterations" "$NO_COMMIT"
    
    log_info "ralph-run.sh initialized successfully"
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
