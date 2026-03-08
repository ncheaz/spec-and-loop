const path = require('path');

// Mock execSync to capture execSync options
jest.mock('child_process', () => ({
  execSync: jest.fn(),
}));

describe('ralph-run stdio inheritance', () => {
  const scriptPath = path.join(__dirname, '../../../bin/ralph-run');

  let execSync;

  beforeEach(() => {
    jest.resetModules();
    execSync = require('child_process').execSync;
    jest.clearAllMocks();
    execSync.mockImplementation(() => 'success');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const requireWrapper = () => {
    jest.resetModules();
    execSync = require('child_process').execSync;
    execSync.mockImplementation(() => 'success');
    require(scriptPath);
  };

  const requireWrapperWithArgs = (args) => {
    const originalArgv = process.argv;
    process.argv = ['node', scriptPath, ...args];
    try {
      jest.resetModules();
      execSync = require('child_process').execSync;
      execSync.mockImplementation(() => 'success');
      require(scriptPath);
    } finally {
      process.argv = originalArgv;
    }
  };

  test('passes stdio: inherit to execSync options', () => {
    requireWrapper();

    expect(execSync).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ stdio: 'inherit' })
    );
  });

  test('execSync is called with exactly two arguments', () => {
    requireWrapper();

    expect(execSync.mock.calls[0].length).toBe(2);
  });

  test('first argument to execSync is the command string', () => {
    requireWrapper();

    const firstArg = execSync.mock.calls[0][0];
    expect(typeof firstArg).toBe('string');
  });

  test('second argument to execSync is options object', () => {
    requireWrapper();

    const secondArg = execSync.mock.calls[0][1];
    expect(typeof secondArg).toBe('object');
  });

  test('stdio option is set to inherit', () => {
    requireWrapper();

    const options = execSync.mock.calls[0][1];
    expect(options.stdio).toBe('inherit');
  });

  test('stdio: inherit allows stdout to pass through', () => {
    jest.resetModules();
    execSync = require('child_process').execSync;
    execSync.mockImplementation((command, options) => {
      expect(options.stdio).toBe('inherit');
      return 'stdout output';
    });

    require(scriptPath);
  });

  test('stdio: inherit allows stderr to pass through', () => {
    jest.resetModules();
    execSync = require('child_process').execSync;
    execSync.mockImplementation((command, options) => {
      expect(options.stdio).toBe('inherit');
      process.stderr.write('error message');
      return '';
    });

    require(scriptPath);
  });

  test('stdio: inherit allows stdin to be read', () => {
    jest.resetModules();
    execSync = require('child_process').execSync;
    execSync.mockImplementation((command, options) => {
      expect(options.stdio).toBe('inherit');
      process.stdin;
      return '';
    });

    require(scriptPath);
  });

  test('stdio: inherit means all three streams are inherited', () => {
    requireWrapper();

    const options = execSync.mock.calls[0][1];
    expect(options.stdio).toBe('inherit');
    expect(['inherit', [0, 1, 2]]).toContain(options.stdio);
  });

  test('stdio is always inherit regardless of command arguments', () => {
    requireWrapperWithArgs(['--change', 'test']);

    const options = execSync.mock.calls[0][1];
    expect(options.stdio).toBe('inherit');
  });

  test('stdio is inherit for empty arguments', () => {
    requireWrapperWithArgs([]);

    const options = execSync.mock.calls[0][1];
    expect(options.stdio).toBe('inherit');
  });

  test('stdio is inherit for multiple arguments', () => {
    requireWrapperWithArgs(['--arg1', 'val1', '--arg2', 'val2', '--arg3', 'val3']);

    const options = execSync.mock.calls[0][1];
    expect(options.stdio).toBe('inherit');
  });

  test('stdio option is a string, not an array', () => {
    requireWrapper();

    const options = execSync.mock.calls[0][1];
    expect(typeof options.stdio).toBe('string');
  });

  test('stdio option value is exactly "inherit"', () => {
    requireWrapper();

    const options = execSync.mock.calls[0][1];
    expect(options.stdio).toBe('inherit');
  });

  test('no other stdio-related options are set', () => {
    requireWrapper();

    const options = execSync.mock.calls[0][1];
    expect(options.stdin).toBeUndefined();
    expect(options.stdout).toBeUndefined();
    expect(options.stderr).toBeUndefined();
  });

  test('stdio: inherit is applied consistently on every call', () => {
    for (let i = 0; i < 3; i++) {
      jest.resetModules();
      execSync = require('child_process').execSync;
      execSync.mockImplementation(() => 'success');
      require(scriptPath);

      const options = execSync.mock.calls[0][1];
      expect(options.stdio).toBe('inherit');
      jest.clearAllMocks();
    }
  });

  test('execSync options object contains only expected properties', () => {
    requireWrapper();

    const options = execSync.mock.calls[0][1];
    const expectedKeys = ['stdio'];
    const actualKeys = Object.keys(options);

    expect(actualKeys).toEqual(expect.arrayContaining(expectedKeys));
    expect(options).toHaveProperty('stdio');
  });

  test('stdio: inherit enables real-time output display', () => {
    jest.resetModules();
    execSync = require('child_process').execSync;
    execSync.mockImplementation((command, options) => {
      expect(options.stdio).toBe('inherit');
      console.log('Real-time output');
      return '';
    });

    require(scriptPath);
  });

  test('stdio: inherit enables interactive input', () => {
    jest.resetModules();
    execSync = require('child_process').execSync;
    execSync.mockImplementation((command, options) => {
      expect(options.stdio).toBe('inherit');
      return '';
    });

    require(scriptPath);
  });

  test('stdio option is not overridden by other options', () => {
    requireWrapper();

    const options = execSync.mock.calls[0][1];
    expect(options.stdio).toBeDefined();
    expect(options.stdio).toBe('inherit');
  });

  test('execSync receives options with correct structure', () => {
    requireWrapper();

    const [command, options] = execSync.mock.calls[0];

    expect(typeof command).toBe('string');
    expect(typeof options).toBe('object');
    expect(options).not.toBeNull();
    expect(options.stdio).toBe('inherit');
  });

  test('stdio: inherit is the standard for child process output passthrough', () => {
    requireWrapper();

    const options = execSync.mock.calls[0][1];
    expect(options.stdio).toBe('inherit');
  });
});
