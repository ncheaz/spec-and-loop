#!/usr/bin/env node
'use strict';

/**
 * mini-ralph-cli.js - Private runner entrypoint for the internal mini Ralph loop engine.
 *
 * This script is invoked by scripts/ralph-run.sh after it prepares the OpenSpec
 * artifacts. It is NOT a documented end-user interface. Users should use ralph-run.
 *
 * Usage (internal):
 *   node scripts/mini-ralph-cli.js [options]
 *
 * Options:
 *   --prompt-file <path>       Prompt file to use (required unless --prompt-text given)
 *   --prompt-text <text>       Inline prompt text
 *   --prompt-template <path>   Prompt template file
 *   --ralph-dir <path>         .ralph/ directory (default: .ralph)
 *   --tasks-file <path>        Path to tasks.md for tasks mode
 *   --tasks                    Enable tasks mode
 *   --min-iterations <n>       Minimum iterations (default: 1)
 *   --max-iterations <n>       Maximum iterations (default: 50)
 *   --completion-promise <s>   Completion promise string (default: COMPLETE)
 *   --task-promise <s>         Task promise string (default: READY_FOR_NEXT_TASK)
 *   --no-commit                Suppress auto-commit
 *   --model <name>             Optional model override
 *   --verbose                  Verbose output
 *   --status                   Print status dashboard and exit
 *   --add-context <text>       Add pending context and exit
 *   --clear-context            Clear pending context and exit
 *   --help                     Show this help
 */

const path = require('path');
const miniRalph = require('../lib/mini-ralph/index');

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = argv.slice(2);
  const opts = {
    promptFile: null,
    promptText: null,
    promptTemplate: null,
    ralphDir: '.ralph',
    tasksFile: null,
    tasksMode: false,
    minIterations: 1,
    maxIterations: 50,
    completionPromise: 'COMPLETE',
    taskPromise: 'READY_FOR_NEXT_TASK',
    noCommit: false,
    model: '',
    verbose: false,
    // Control commands
    status: false,
    addContext: null,
    clearContext: false,
    help: false,
  };

  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    switch (arg) {
      case '--prompt-file':
        opts.promptFile = args[++i];
        break;
      case '--prompt-text':
        opts.promptText = args[++i];
        break;
      case '--prompt-template':
        opts.promptTemplate = args[++i];
        break;
      case '--ralph-dir':
        opts.ralphDir = args[++i];
        break;
      case '--tasks-file':
        opts.tasksFile = args[++i];
        break;
      case '--tasks':
        opts.tasksMode = true;
        break;
      case '--min-iterations':
        opts.minIterations = parseInt(args[++i], 10);
        break;
      case '--max-iterations':
        opts.maxIterations = parseInt(args[++i], 10);
        break;
      case '--completion-promise':
        opts.completionPromise = args[++i];
        break;
      case '--task-promise':
        opts.taskPromise = args[++i];
        break;
      case '--no-commit':
        opts.noCommit = true;
        break;
      case '--model':
        opts.model = args[++i];
        break;
      case '--verbose':
        opts.verbose = true;
        break;
      case '--status':
        opts.status = true;
        break;
      case '--add-context':
        opts.addContext = args[++i];
        break;
      case '--clear-context':
        opts.clearContext = true;
        break;
      case '--help':
      case '-h':
        opts.help = true;
        break;
      default:
        process.stderr.write(`mini-ralph-cli: unknown option: ${arg}\n`);
        process.exit(1);
    }
    i++;
  }

  return opts;
}

function printHelp() {
  process.stdout.write(`
mini-ralph-cli - Internal mini Ralph loop engine runner

This is an internal script. Use ralph-run as the documented interface.

Options:
  --prompt-file <path>       Prompt file
  --prompt-text <text>       Inline prompt text
  --prompt-template <path>   Prompt template file
  --ralph-dir <path>         .ralph/ directory (default: .ralph)
  --tasks-file <path>        Path to tasks.md
  --tasks                    Enable tasks mode
  --min-iterations <n>       Minimum iterations (default: 1)
  --max-iterations <n>       Maximum iterations (default: 50)
  --completion-promise <s>   Completion promise string
  --task-promise <s>         Task promise string
  --no-commit                Suppress auto-commit
  --model <name>             Model override
  --verbose                  Verbose output
  --status                   Print status dashboard and exit
  --add-context <text>       Add pending context and exit
  --clear-context            Clear pending context and exit
  --help                     Show this help
`.trim() + '\n');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const opts = parseArgs(process.argv);

  if (opts.help) {
    printHelp();
    process.exit(0);
  }

  const ralphDir = path.resolve(opts.ralphDir);

  // Handle control commands (status, add-context, clear-context)
  if (opts.status) {
    const tasksFile = opts.tasksFile ? path.resolve(opts.tasksFile) : null;
    const output = miniRalph.getStatus(ralphDir, tasksFile);
    process.stdout.write(output + '\n');
    process.exit(0);
  }

  if (opts.addContext !== null) {
    miniRalph.addContext(ralphDir, opts.addContext);
    process.stdout.write(`Context added to ${path.join(ralphDir, 'ralph-context.md')}\n`);
    process.exit(0);
  }

  if (opts.clearContext) {
    miniRalph.clearContext(ralphDir);
    process.stdout.write('Pending context cleared.\n');
    process.exit(0);
  }

  // Run the loop
  const runOpts = {
    promptFile: opts.promptFile ? path.resolve(opts.promptFile) : null,
    promptText: opts.promptText || null,
    promptTemplate: opts.promptTemplate ? path.resolve(opts.promptTemplate) : null,
    ralphDir,
    tasksFile: opts.tasksFile ? path.resolve(opts.tasksFile) : null,
    tasksMode: opts.tasksMode,
    minIterations: opts.minIterations,
    maxIterations: opts.maxIterations,
    completionPromise: opts.completionPromise,
    taskPromise: opts.taskPromise,
    noCommit: opts.noCommit,
    model: opts.model,
    verbose: opts.verbose,
  };

  try {
    const result = await miniRalph.run(runOpts);

    if (opts.verbose) {
      process.stderr.write(
        `[mini-ralph] loop finished: completed=${result.completed} iterations=${result.iterations} reason=${result.exitReason}\n`
      );
    }

    process.exit(result.completed ? 0 : 1);
  } catch (err) {
    process.stderr.write(`[mini-ralph] error: ${err.message}\n`);
    if (opts.verbose && err.stack) {
      process.stderr.write(err.stack + '\n');
    }
    process.exit(1);
  }
}

main();
