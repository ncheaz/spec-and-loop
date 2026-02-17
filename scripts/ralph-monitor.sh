#!/bin/bash

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CHANGE_NAME="${1:-auto-detect}"

if [[ "$CHANGE_NAME" == "auto-detect" ]]; then
    # Auto-detect most recent change
    CHANGE_NAME=$(ls -t openspec/changes/ 2>/dev/null | head -1)
    if [[ -z "$CHANGE_NAME" ]]; then
        echo "No changes found in openspec/changes/"
        exit 1
    fi
fi

TASKS_FILE="$SCRIPT_DIR/../openspec/changes/$CHANGE_NAME/tasks.md"
RALPH_STATE="$SCRIPT_DIR/../.ralph/ralph-loop.state.json"

if [[ ! -f "$TASKS_FILE" ]]; then
    echo "Tasks file not found: $TASKS_FILE"
    exit 1
fi

clear
while true; do
    clear
    
    echo "======================================================================="
    echo " Ralph Progress Monitor - Change: $CHANGE_NAME"
    echo "======================================================================="
    echo ""
    
    # Progress bar
    total=$(grep -c "^- \[" "$TASKS_FILE" 2>/dev/null) || total=0
    completed=$(grep -c "^- \[x\]" "$TASKS_FILE" 2>/dev/null) || completed=0
    in_progress=$(grep -c "^- \[\/\]" "$TASKS_FILE" 2>/dev/null) || in_progress=0
    
    remaining=$((total - completed - in_progress))
    
    if [[ $total -gt 0 ]]; then
        progress=$((completed * 100 / total))
        echo " Progress: $completed/$total tasks completed ($progress%)"
        echo " Status:  $in_progress in progress, $remaining remaining"
        
        # Simple progress bar
        filled=$((completed * 50 / total))
        bar=$(printf '#%.0s' $(seq 1 $filled))
        empty=$(printf '.%.0s' $(seq 1 $((50 - filled))))
        echo "          |$bar$empty|"
    fi
    echo ""
    
    # Ralph state
    if [[ -f "$RALPH_STATE" ]]; then
        echo " Ralph State:"
        jq -r ' 
            "   Iteration: \(.iteration)/\(.maxIterations)",
            "   Active: \(.active)",
            "   Mode: \(.tasksMode // "N/A")",
            "   Prompt: \(.completionPromise // "N/A")"
        ' "$RALPH_STATE" 2>/dev/null || echo "   Unable to read state"
        echo ""
    fi
    
    # Current task
    echo " Current Task:"
    current_task=$(grep -n "^- \[\/\]" "$TASKS_FILE" 2>/dev/null | head -1)
    if [[ -n "$current_task" ]]; then
        echo "   $current_task"
    else
        # Show next incomplete task
        next_task=$(grep -n "^- \[ \]" "$TASKS_FILE" 2>/dev/null | head -1)
        if [[ -n "$next_task" ]]; then
            echo "   Next: $next_task"
        else
            echo "   No current task (idle)"
        fi
    fi
    echo ""
    
    # Recent completed tasks (last 3)
    echo " Recently Completed:"
    grep "^- \[x\]" "$TASKS_FILE" 2>/dev/null | tail -3 | sed 's/^- \[x\] /   /'
    echo ""
    
    # File status
    echo " Last Updated: $(stat -c "%y" "$TASKS_FILE" 2>/dev/null | cut -d'.' -f1)"
    echo ""
    
    echo "======================================================================="
    echo " Press Ctrl+C to exit | Refreshing in 2 seconds..."
    echo "======================================================================="
    
    sleep 2
done