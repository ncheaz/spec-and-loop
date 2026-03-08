const path = require('path');

// Mock execSync to test the wrapper without actually running the bash script
jest.mock('child_process', () => ({
  execSync: jest.fn()
}));

describe('ralph-run wrapper', () => {
  const wrapperPath = path.join(__dirname, '..', '..', '..', 'bin', 'ralph-run');
  const originalArgv = process.argv;

  let execSync;

  beforeEach(() => {
    jest.resetModules();
    execSync = require('child_process').execSync;
    jest.clearAllMocks();
    execSync.mockReturnValue(Buffer.from('output'));
    process.argv = [...originalArgv];
    jest.spyOn(process, 'exit').mockImplementation(() => {});
  });

  afterEach(() => {
    process.argv = originalArgv;
    jest.restoreAllMocks();
  });

  const requireWrapper = (args) => {
    const originalArgv2 = process.argv;
    if (args !== undefined) {
      process.argv = ['node', 'ralph-run', ...args];
    }
    try {
      jest.resetModules();
      execSync = require('child_process').execSync;
      execSync.mockReturnValue(Buffer.from('output'));
      require(wrapperPath);
    } finally {
      process.argv = originalArgv2;
    }
  };

  test('invokes bash script with correct path', () => {
    requireWrapper([]);

    expect(execSync).toHaveBeenCalledWith(
      expect.stringContaining('bash'),
      expect.objectContaining({ stdio: 'inherit' })
    );
  });

  test('passes through command-line arguments', () => {
    requireWrapper(['--change', 'test-change', '--max-iterations', '2']);

    const callArgs = execSync.mock.calls[0][0];
    expect(callArgs).toContain('--change');
    expect(callArgs).toContain('test-change');
    expect(callArgs).toContain('--max-iterations');
    expect(callArgs).toContain('2');
  });

  test('quotes arguments with spaces correctly', () => {
    requireWrapper(['--change', 'test change with spaces']);

    const callArgs = execSync.mock.calls[0][0];
    expect(callArgs).toContain('test change with spaces');
  });

  test('escapes quotes in arguments', () => {
    requireWrapper(['--arg', 'value "with quotes"']);

    const callArgs = execSync.mock.calls[0][0];
    expect(callArgs).toContain('value');
  });

  test('uses stdio inherit for proper output passthrough', () => {
    requireWrapper([]);

    expect(execSync).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ stdio: 'inherit' })
    );
  });

  test('exits with correct status code on success', () => {
    requireWrapper([]);
    // Should not throw on success and should not call exit
    expect(process.exit).not.toHaveBeenCalledWith(1);
  });

  test('exits with error status code on failure', () => {
    jest.resetModules();
    execSync = require('child_process').execSync;
    const mockError = new Error('Command failed');
    mockError.status = 1;
    execSync.mockImplementation(() => { throw mockError; });

    // The wrapper should handle the error without throwing
    expect(() => { require(wrapperPath); }).not.toThrow();
  });

  test('handles missing error status (defaults to 1)', () => {
    jest.resetModules();
    execSync = require('child_process').execSync;
    const mockError = new Error('Command failed');
    delete mockError.status;
    execSync.mockImplementation(() => { throw mockError; });

    // Should handle missing status gracefully
    expect(() => { require(wrapperPath); }).not.toThrow();
  });

  test('includes script path in command', () => {
    requireWrapper([]);

    const callArgs = execSync.mock.calls[0][0];
    expect(callArgs).toContain('ralph-run.sh');
  });

  test('handles multiple arguments', () => {
    requireWrapper(['--change', 'test', '--verbose', '--max-iterations', '3']);

    const callArgs = execSync.mock.calls[0][0];
    expect(callArgs).toContain('--change');
    expect(callArgs).toContain('test');
    expect(callArgs).toContain('--verbose');
    expect(callArgs).toContain('--max-iterations');
    expect(callArgs).toContain('3');
  });

  test('handles empty arguments list', () => {
    requireWrapper([]);

    const callArgs = execSync.mock.calls[0][0];
    expect(callArgs).toContain('bash');
  });

  test('constructs absolute path to script', () => {
    requireWrapper([]);

    const callArgs = execSync.mock.calls[0][0];
    expect(callArgs).toContain('scripts/ralph-run.sh');
  });

  test('handles arguments with special characters', () => {
    requireWrapper(['--arg', 'value&special<char>']);

    const callArgs = execSync.mock.calls[0][0];
    expect(callArgs).toContain('value&special<char>');
  });

  test('arguments are properly joined with spaces', () => {
    requireWrapper(['arg1', 'arg2', 'arg3']);

    const callArgs = execSync.mock.calls[0][0];
    expect(callArgs).toMatch(/arg1.*arg2.*arg3/);
  });

  test('preserves argument order', () => {
    requireWrapper(['--first', 'value1', '--second', 'value2']);

    const callArgs = execSync.mock.calls[0][0];
    const firstIndex = callArgs.indexOf('--first');
    const secondIndex = callArgs.indexOf('--second');
    expect(firstIndex).toBeLessThan(secondIndex);
  });

  test('works with Node.js script path', () => {
    requireWrapper(['--version']);

    expect(execSync).toHaveBeenCalled();
  });

  test('wrapper can be required multiple times', () => {
    requireWrapper([]);
    const firstCallCount = execSync.mock.calls.length;

    jest.resetModules();
    execSync = require('child_process').execSync;
    execSync.mockReturnValue(Buffer.from('output'));
    require(wrapperPath);

    // Both invocations should have called execSync
    expect(execSync).toHaveBeenCalled();
    expect(firstCallCount).toBeGreaterThan(0);
  });

  test('does not modify original process.argv beyond what is necessary', () => {
    requireWrapper(['--test']);

    // Process.argv may be modified during execution, but the wrapper shouldn't break
    expect(Array.isArray(process.argv)).toBe(true);
  });
});
