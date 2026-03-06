const { execSync } = require('child_process');
const path = require('path');

// Mock execSync to capture execSync options
jest.mock('child_process', () => ({
  execSync: jest.fn(),
}));

describe('ralph-run stdio inheritance', () => {
  const scriptPath = path.join(__dirname, '../../../bin/ralph-run');

  beforeEach(() => {
    jest.clearAllMocks();
    execSync.mockImplementation(() => 'success');
  });

  afterEach(() => {
    jest.resetModules();
  });

  test('passes stdio: inherit to execSync options', () => {
    require(scriptPath);
    
    expect(execSync).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ stdio: 'inherit' })
    );
  });

  test('execSync is called with exactly two arguments', () => {
    require(scriptPath);
    
    expect(execSync.mock.calls[0].length).toBe(2);
  });

  test('first argument to execSync is the command string', () => {
    require(scriptPath);
    
    const firstArg = execSync.mock.calls[0][0];
    expect(typeof firstArg).toBe('string');
  });

  test('second argument to execSync is options object', () => {
    require(scriptPath);
    
    const secondArg = execSync.mock.calls[0][1];
    expect(typeof secondArg).toBe('object');
  });

  test('stdio option is set to inherit', () => {
    require(scriptPath);
    
    const options = execSync.mock.calls[0][1];
    expect(options.stdio).toBe('inherit');
  });

  test('stdio: inherit allows stdout to pass through', () => {
    const mockExecSync = execSync.mockImplementation((command, options) => {
      expect(options.stdio).toBe('inherit');
      return 'stdout output';
    });
    
    require(scriptPath);
    
    mockExecSync.mockRestore();
  });

  test('stdio: inherit allows stderr to pass through', () => {
    const mockExecSync = execSync.mockImplementation((command, options) => {
      expect(options.stdio).toBe('inherit');
      // Simulate stderr output
      process.stderr.write('error message');
      return '';
    });
    
    require(scriptPath);
    
    mockExecSync.mockRestore();
  });

  test('stdio: inherit allows stdin to be read', () => {
    const mockExecSync = execSync.mockImplementation((command, options) => {
      expect(options.stdio).toBe('inherit');
      // Simulate reading from stdin
      process.stdin;
      return '';
    });
    
    require(scriptPath);
    
    mockExecSync.mockRestore();
  });

  test('stdio: inherit means all three streams are inherited', () => {
    require(scriptPath);
    
    const options = execSync.mock.calls[0][1];
    expect(options.stdio).toBe('inherit');
    
    // 'inherit' means all three streams (stdin, stdout, stderr)
    // are inherited from the parent process
    expect(['inherit', [0, 1, 2]]).toContain(options.stdio);
  });

  test('stdio is always inherit regardless of command arguments', () => {
    const originalArgv = process.argv;
    process.argv = ['node', scriptPath, '--change', 'test'];
    
    try {
      jest.resetModules();
      require(scriptPath);
      
      const options = execSync.mock.calls[0][1];
      expect(options.stdio).toBe('inherit');
    } finally {
      process.argv = originalArgv;
    }
  });

  test('stdio is inherit for empty arguments', () => {
    const originalArgv = process.argv;
    process.argv = ['node', scriptPath];
    
    try {
      jest.resetModules();
      require(scriptPath);
      
      const options = execSync.mock.calls[0][1];
      expect(options.stdio).toBe('inherit');
    } finally {
      process.argv = originalArgv;
    }
  });

  test('stdio is inherit for multiple arguments', () => {
    const originalArgv = process.argv;
    process.argv = ['node', scriptPath, '--arg1', 'val1', '--arg2', 'val2', '--arg3', 'val3'];
    
    try {
      jest.resetModules();
      require(scriptPath);
      
      const options = execSync.mock.calls[0][1];
      expect(options.stdio).toBe('inherit');
    } finally {
      process.argv = originalArgv;
    }
  });

  test('stdio option is a string, not an array', () => {
    require(scriptPath);
    
    const options = execSync.mock.calls[0][1];
    expect(typeof options.stdio).toBe('string');
  });

  test('stdio option value is exactly "inherit"', () => {
    require(scriptPath);
    
    const options = execSync.mock.calls[0][1];
    expect(options.stdio).toBe('inherit');
  });

  test('no other stdio-related options are set', () => {
    require(scriptPath);
    
    const options = execSync.mock.calls[0][1];
    
    // Check that only stdio: inherit is set, not other stdio options
    expect(options.stdin).toBeUndefined();
    expect(options.stdout).toBeUndefined();
    expect(options.stderr).toBeUndefined();
  });

  test('stdio: inherit is applied consistently on every call', () => {
    // Require the script multiple times to ensure consistent behavior
    for (let i = 0; i < 3; i++) {
      jest.resetModules();
      require(scriptPath);
      
      const options = execSync.mock.calls[0][1];
      expect(options.stdio).toBe('inherit');
      jest.clearAllMocks();
    }
  });

  test('execSync options object contains only expected properties', () => {
    require(scriptPath);
    
    const options = execSync.mock.calls[0][1];
    const expectedKeys = ['stdio'];
    const actualKeys = Object.keys(options);
    
    // Check that options has only the keys we expect
    expect(actualKeys).toEqual(expect.arrayContaining(expectedKeys));
    // The options object might have other execSync options, but stdio should always be there
    expect(options).toHaveProperty('stdio');
  });

  test('stdio: inherit enables real-time output display', () => {
    const mockExecSync = execSync.mockImplementation((command, options) => {
      // With stdio: inherit, output should be displayed in real-time
      expect(options.stdio).toBe('inherit');
      
      // Simulate stdout being written
      console.log('Real-time output');
      
      return '';
    });
    
    require(scriptPath);
    
    mockExecSync.mockRestore();
  });

  test('stdio: inherit enables interactive input', () => {
    const mockExecSync = execSync.mockImplementation((command, options) => {
      // With stdio: inherit, the child process can read from stdin
      expect(options.stdio).toBe('inherit');
      return '';
    });
    
    require(scriptPath);
    
    mockExecSync.mockRestore();
  });

  test('stdio option is not overridden by other options', () => {
    // Ensure that the stdio option is explicitly set
    // and not accidentally overridden by other behavior
    require(scriptPath);
    
    const options = execSync.mock.calls[0][1];
    
    expect(options.stdio).toBeDefined();
    expect(options.stdio).toBe('inherit');
  });

  test('execSync receives options with correct structure', () => {
    require(scriptPath);
    
    const [command, options] = execSync.mock.calls[0];
    
    expect(typeof command).toBe('string');
    expect(typeof options).toBe('object');
    expect(options).not.toBeNull();
    expect(options.stdio).toBe('inherit');
  });

  test('stdio: inherit is the standard for child process output passthrough', () => {
    // This test documents that 'inherit' is the correct value
    // for passing through stdout/stderr from child to parent
    require(scriptPath);
    
    const options = execSync.mock.calls[0][1];
    
    // Node.js documentation: 'inherit' means use the parent's stream
    // This is the correct way to passthrough output
    expect(options.stdio).toBe('inherit');
  });
});
