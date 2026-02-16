#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('Setting up spec-and-loop...');

// Get the installation directory
const installDir = __dirname;
const ralphRunScript = path.join(installDir, 'ralph-run.sh');

console.log(`Installation directory: ${installDir}`);

// Make ralph-run.sh executable
if (fs.existsSync(ralphRunScript)) {
  try {
    execSync(`chmod +x "${ralphRunScript}"`);
    console.log('✓ Made ralph-run.sh executable');
  } catch (err) {
    console.warn(`Could not make ralph-run.sh executable: ${err.message}`);
  }
} else {
  console.error(`Error: ralph-run.sh not found at ${ralphRunScript}`);
  process.exit(1);
}

console.log('');
console.log('spec-and-loop setup complete!');
console.log('');
console.log('Usage:');
console.log('  cd /path/to/your/project');
console.log('  openspec init                    # Initialize OpenSpec');
console.log('  openspec new <name>             # Create a new change');
console.log('  openspec ff <name>              # Fast-forward artifacts');
console.log('  ralph-run --change <name>       # Run ralph loop');
console.log('  ralph-run                       # Auto-detect change');
console.log('');
console.log('Prerequisites:');
console.log('  - openspec CLI: npm install -g @fission-ai/openspec@latest');
console.log('  - opencode CLI: npm install -g opencode-ai (or see https://opencode.ai/install)');
console.log('  - jq CLI: apt install jq / brew install jq');
console.log('  - git: git init');
