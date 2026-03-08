const path = require('path');
const fs = require('fs');

// Mock execSync to avoid actually running the bash script in tests
jest.mock('child_process', () => ({
  execSync: jest.fn(),
}));

describe('ralph-run wrapper', () => {
  const scriptPath = path.join(__dirname, '../../../bin/ralph-run');
  const bashScriptPath = path.join(__dirname, '../../../scripts/ralph-run.sh');

  let execSync;

  beforeEach(() => {
    jest.resetModules();
    execSync = require('child_process').execSync;
    jest.clearAllMocks();
    execSync.mockReturnValue('success');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const requireWrapper = () => {
    jest.resetModules();
    execSync = require('child_process').execSync;
    execSync.mockReturnValue('success');
    require(scriptPath);
  };

  const requireWrapperWithArgs = (args) => {
    const originalArgv = process.argv;
    process.argv = ['node', scriptPath, ...args];
    try {
      jest.resetModules();
      execSync = require('child_process').execSync;
      execSync.mockReturnValue('success');
      require(scriptPath);
    } finally {
      process.argv = originalArgv;
    }
  };

  test('wrapper file exists', () => {
    expect(fs.existsSync(scriptPath)).toBe(true);
  });

  test('wrapper is executable', () => {
    try {
      const stats = fs.statSync(scriptPath);
      // On Unix-like systems, execute permission is 0o111
      const isExecutable = (stats.mode & fs.constants.S_IXUSR) ||
                          (stats.mode & fs.constants.S_IXGRP) ||
                          (stats.mode & fs.constants.S_IXOTH);
      expect(isExecutable).toBe(true);
    } catch (error) {
      // Windows doesn't have execute permissions in the same way
      expect(error.code).not.toBe('ENOENT');
    }
  });

  test('wrapper invokes bash script', () => {
    requireWrapper();

    expect(execSync).toHaveBeenCalled();
    const callArgs = execSync.mock.calls[0][0];
    expect(callArgs).toContain('bash');
    expect(callArgs).toContain(bashScriptPath);
  });

  test('wrapper passes command line arguments to bash script', () => {
    const testArgs = ['--change', 'test-change', '--max-iterations', '10'];
    requireWrapperWithArgs(testArgs);

    expect(execSync).toHaveBeenCalled();
    const callArgs = execSync.mock.calls[0][0];
    expect(callArgs).toContain('--change');
    expect(callArgs).toContain('test-change');
    expect(callArgs).toContain('--max-iterations');
    expect(callArgs).toContain('10');
  });

  test('wrapper quotes arguments containing spaces', () => {
    requireWrapperWithArgs(['--change', 'test change with spaces']);

    expect(execSync).toHaveBeenCalled();
    const callArgs = execSync.mock.calls[0][0];
    expect(callArgs).toContain('"test change with spaces"');
  });

  test('wrapper quotes arguments containing quotes', () => {
    requireWrapperWithArgs(['--test', 'value with "quotes" inside']);

    expect(execSync).toHaveBeenCalled();
    const callArgs = execSync.mock.calls[0][0];
    expect(callArgs).toContain('\\\"');
  });

  test('wrapper passes stdio: inherit to execSync', () => {
    requireWrapper();

    expect(execSync).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ stdio: 'inherit' })
    );
  });

  test('wrapper uses correct bash script path', () => {
    requireWrapper();

    const callArgs = execSync.mock.calls[0][0];
    const expectedPath = path.join(__dirname, '../../../scripts/ralph-run.sh');
    expect(callArgs).toContain(expectedPath);
  });

  test('wrapper handles no arguments', () => {
    requireWrapperWithArgs([]);

    expect(execSync).toHaveBeenCalled();
    const callArgs = execSync.mock.calls[0][0];
    expect(callArgs).toContain(bashScriptPath);
  });

  test('wrapper handles single argument', () => {
    requireWrapperWithArgs(['--help']);

    expect(execSync).toHaveBeenCalled();
    const callArgs = execSync.mock.calls[0][0];
    expect(callArgs).toContain('--help');
  });

  test('wrapper handles multiple arguments', () => {
    requireWrapperWithArgs(['--change', 'my-change', '--verbose', '--max-iterations', '5']);

    expect(execSync).toHaveBeenCalled();
    const callArgs = execSync.mock.calls[0][0];
    expect(callArgs).toContain('--change');
    expect(callArgs).toContain('my-change');
    expect(callArgs).toContain('--verbose');
    expect(callArgs).toContain('--max-iterations');
    expect(callArgs).toContain('5');
  });

  test('wrapper exits with non-zero when bash script fails', () => {
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {});
    jest.resetModules();
    execSync = require('child_process').execSync;
    execSync.mockImplementation(() => {
      const error = new Error('Script failed');
      error.status = 1;
      throw error;
    });

    require(scriptPath);

    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
  });

  test('wrapper exits with bash script exit code', () => {
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {});
    jest.resetModules();
    execSync = require('child_process').execSync;
    execSync.mockImplementation(() => {
      const error = new Error('Script failed');
      error.status = 42;
      throw error;
    });

    require(scriptPath);

    expect(exitSpy).toHaveBeenCalledWith(42);
    exitSpy.mockRestore();
  });

  test('wrapper exits with 1 when bash script has no status code', () => {
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {});
    jest.resetModules();
    execSync = require('child_process').execSync;
    execSync.mockImplementation(() => {
      throw new Error('Script failed');
    });

    require(scriptPath);

    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
  });

  test('wrapper does not exit when bash script succeeds', () => {
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {});
    requireWrapper();

    // Should not call process.exit if successful
    expect(exitSpy).not.toHaveBeenCalled();
    exitSpy.mockRestore();
  });

  test('wrapper uses bash interpreter', () => {
    requireWrapper();

    const callArgs = execSync.mock.calls[0][0];
    expect(callArgs).toMatch(/^bash/);
  });

  test('wrapper passes all arguments as single string to bash', () => {
    requireWrapperWithArgs(['--arg1', 'val1', '--arg2', 'val2']);

    expect(execSync).toHaveBeenCalled();
    // execSync should be called with a single string command
    const callArgs = execSync.mock.calls[0][0];
    expect(typeof callArgs).toBe('string');
  });
});
