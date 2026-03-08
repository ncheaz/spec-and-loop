# OpenSpec Workflow Documentation

**Valid for OpenSpec 1.2.0 and spec-and-loop 2.0.0**

## Correct Workflow

This document documents the correct OpenSpec workflow using only existing commands. This serves as the reference for updating README.md and QUICKSTART.md.

### Initialization

```bash
openspec init
```
Initializes OpenSpec in the current project directory.

### Create a Change

```bash
openspec new change <name>
```
Creates a new change directory with the specified name.

Example:
```bash
openspec new change add-user-auth
```

### Artifact Creation

OpenSpec does not provide a "fast-forward" command. Artifacts must be created manually:

1. **proposal.md** - Describe why you're making this change
2. **specs/** - Create detailed specifications for each capability
3. **design.md** - Document technical decisions and architecture
4. **tasks.md** - List implementation tasks as checkboxes

Alternatively, if using opencode skills, use the `/opsx-continue` workflow to create artifacts interactively.

### Execute Tasks

```bash
ralph-run --change <name>
```
Executes tasks for the specified change using the internal mini Ralph engine.

Example:
```bash
ralph-run --change add-user-auth
```

## Valid OpenSpec Commands (1.2.0)

The following OpenSpec commands exist and can be used in the workflow:

- `openspec init [options] [path]` - Initialize OpenSpec in your project
- `openspec new change <name>` - Create a new change directory
- `openspec list [options]` - List items (changes by default). Use `--specs` to list specs
- `openspec view` - Display an interactive dashboard of specs and changes
- `openspec change` - Manage OpenSpec change proposals
  - `openspec change show [options] [change-name]` - Show a change proposal in JSON or markdown format
  - `openspec change validate [options] [change-name]` - Validate a change proposal
- `openspec archive [options] [change-name]` - Archive a completed change and update main specs
- `openspec spec` - Manage and view OpenSpec specifications
- `openspec config [options]` - View and modify global OpenSpec configuration
- `openspec validate [options] [item-name]` - Validate changes and specs
- `openspec show [options] [item-name]` - Show a change or spec
- `openspec status [options]` - Display artifact completion status for a change
- `openspec instructions [options] [artifact]` - Output enriched instructions for creating an artifact or applying tasks

## Non-Existent Commands

The following commands do NOT exist in OpenSpec 1.2.0 and should NOT be referenced in documentation:

- ❌ `openspec new <name>` (incorrect - must be `openspec new change <name>`)
- ❌ `openspec ff` or `openspec ff <name>` (does not exist)
- ❌ `openspec continue <name>` (does not exist)
- ❌ `openspec apply <name>` (does not exist)
- ❌ `openspec fast-forward` (does not exist)

## Ralph Run Commands

```bash
ralph-run [OPTIONS]

OPTIONS:
    --change <name>          OpenSpec change to execute (default: auto-detect)
    --max-iterations <n>     Maximum iterations (default: 50)
    --no-commit              Suppress automatic git commits
    --verbose, -v            Enable verbose output

OBSERVABILITY AND CONTROL:
    --status                 Print loop status dashboard and exit
    --add-context <text>     Add context to inject into the next iteration
    --clear-context          Clear any pending context
```

## Version Information

- **OpenSpec**: @fission-ai/openspec@1.2.0
- **spec-and-loop**: spec-and-loop@2.0.0
- **Node.js**: >= 24.0.0

## References

- Run `openspec --help` for command overview
- Run `openspec new change --help` for change creation options
- Run `ralph-run --help` for ralph-run options
