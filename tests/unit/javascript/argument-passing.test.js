const { execSync } = require('child_process');
const path = require('path');

// Mock execSync to capture the exact command being executed
jest.mock('child_process', () => ({
  execSync: jest.fn(),
}));

describe('ralph-run argument passing', () => {
  const scriptPath = path.join(__dirname, '../../../bin/ralph-run');

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.resetModules();
  });

  const runWrapperWithArgs = (args) => {
    const originalArgv = process.argv;
    process.argv = ['node', scriptPath, ...args];
    
    try {
      jest.resetModules();
      require(scriptPath);
      return execSync.mock.calls[0][0];
    } finally {
      process.argv = originalArgv;
    }
  };

  test('forwards --change argument', () => {
    const command = runWrapperWithArgs(['--change', 'test-change']);
    expect(command).toContain('--change');
    expect(command).toContain('test-change');
  });

  test('forwards --max-iterations argument', () => {
    const command = runWrapperWithArgs(['--max-iterations', '15']);
    expect(command).toContain('--max-iterations');
    expect(command).toContain('15');
  });

  test('forwards --verbose argument', () => {
    const command = runWrapperWithArgs(['--verbose']);
    expect(command).toContain('--verbose');
  });

  test('forwards --help argument', () => {
    const command = runWrapperWithArgs(['--help']);
    expect(command).toContain('--help');
  });

  test('forwards multiple arguments together', () => {
    const command = runWrapperWithArgs([
      '--change', 'my-change',
      '--max-iterations', '10',
      '--verbose'
    ]);
    
    expect(command).toContain('--change');
    expect(command).toContain('my-change');
    expect(command).toContain('--max-iterations');
    expect(command).toContain('10');
    expect(command).toContain('--verbose');
  });

  test('forwards arguments in correct order', () => {
    const command = runWrapperWithArgs([
      'arg1', 'arg2', 'arg3'
    ]);
    
    // Split command to find the bash script part and args part
    const parts = command.split(' ');
    const bashScriptIndex = parts.findIndex(p => p.includes('ralph-run.sh'));
    const argsPart = parts.slice(bashScriptIndex + 1).join(' ');
    
    expect(argsPart).toContain('arg1');
    expect(argsPart).toContain('arg2');
    expect(argsPart).toContain('arg3');
  });

  test('quotes argument values containing spaces', () => {
    const command = runWrapperWithArgs(['--change', 'change with spaces']);
    expect(command).toContain('"change with spaces"');
  });

  test('escapes double quotes in argument values', () => {
    const command = runWrapperWithArgs(['--test', 'value "quoted"']);
    expect(command).toContain('\\\"');
  });

  test('handles argument values with special characters', () => {
    const command = runWrapperWithArgs(['--test', 'value&special<chars>']);
    expect(command).toContain('value&special<chars>');
  });

  test('forwards numeric arguments', () => {
    const command = runWrapperWithArgs(['--max-iterations', '42']);
    expect(command).toContain('42');
  });

  test('forwards zero as argument value', () => {
    const command = runWrapperWithArgs(['--max-iterations', '0']);
    expect(command).toContain('0');
  });

  test('forwards negative numbers as argument values', () => {
    const command = runWrapperWithArgs(['--test', '-5']);
    expect(command).toContain('-5');
  });

  test('handles empty string argument', () => {
    const command = runWrapperWithArgs(['--test', '']);
    expect(command).toContain('""');
  });

  test('forwards argument with equals sign', () => {
    const command = runWrapperWithArgs(['--test', 'key=value']);
    expect(command).toContain('key=value');
  });

  test('forwards argument with hyphens', () => {
    const command = runWrapperWithArgs(['--change', 'my-change-name']);
    expect(command).toContain('my-change-name');
  });

  test('forwards argument with underscores', () => {
    const command = runWrapperWithArgs(['--test', 'my_test_value']);
    expect(command).toContain('my_test_value');
  });

  test('forwards argument with dots', () => {
    const command = runWrapperWithArgs(['--version', '1.2.3']);
    expect(command).toContain('1.2.3');
  });

  test('handles multiple arguments with same type', () => {
    const command = runWrapperWithArgs([
      '--arg', 'val1',
      '--arg', 'val2',
      '--arg', 'val3'
    ]);
    
    expect(command).toContain('val1');
    expect(command).toContain('val2');
    expect(command).toContain('val3');
  });

  test('forwards long argument values', () => {
    const longValue = 'a'.repeat(1000);
    const command = runWrapperWithArgs(['--test', longValue]);
    expect(command).toContain(longValue);
  });

  test('handles argument with newlines escaped', () => {
    const command = runWrapperWithArgs(['--test', 'line1\nline2']);
    expect(command).toContain('line1');
    expect(command).toContain('line2');
  });

  test('forwards argument with tabs', () => {
    const command = runWrapperWithArgs(['--test', 'value\twith\ttabs']);
    expect(command).toContain('value\twith\ttabs');
  });

  test('preserves argument case', () => {
    const command = runWrapperWithArgs(['--test', 'CamelCaseValue']);
    expect(command).toContain('CamelCaseValue');
  });

  test('handles arguments starting with dash', () => {
    const command = runWrapperWithArgs(['--test', '-value']);
    expect(command).toContain('-value');
  });

  test('preserves arguments as strings', () => {
    const command = runWrapperWithArgs(['--max-iterations', '5']);
    expect(command).toContain('"5"');
  });

  test('forwards complex argument combinations', () => {
    const command = runWrapperWithArgs([
      '--change', 'complex-change',
      '--max-iterations', '100',
      '--verbose',
      '--test-flag',
      '--key', 'value with "quotes" and spaces',
      '--number', '42.5'
    ]);
    
    expect(command).toContain('complex-change');
    expect(command).toContain('100');
    expect(command).toContain('--verbose');
    expect(command).toContain('--test-flag');
    expect(command).toContain('value with \\"quotes\\" and spaces');
    expect(command).toContain('42.5');
  });

  test('bash script path appears before arguments', () => {
    const command = runWrapperWithArgs(['--test', 'value']);
    const bashScriptIndex = command.indexOf('ralph-run.sh');
    const testArgIndex = command.indexOf('--test');
    
    expect(bashScriptIndex).toBeLessThan(testArgIndex);
  });

  test('all wrapper arguments are present in bash command', () => {
    const args = ['--change', 'test', '--max', '10', '--flag', '--key', 'value'];
    const command = runWrapperWithArgs(args);
    
    // Check that all args appear in the command
    args.forEach(arg => {
      expect(command).toContain(arg);
    });
  });
});
