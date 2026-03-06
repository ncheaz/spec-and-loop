const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// Mock execSync to avoid actually running the bash script in tests
jest.mock('child_process', () => ({
  execSync: jest.fn(),
}));

describe('ralph-run wrapper', () => {
  const scriptPath = path.join(__dirname, '../../../bin/ralph-run');
  const bashScriptPath = path.join(__dirname, '../../../scripts/ralph-run.sh');

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.resetModules();
  });

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
    // Simulate running the wrapper
    require(scriptPath);

    expect(execSync).toHaveBeenCalled();
    const callArgs = execSync.mock.calls[0][0];
    expect(callArgs).toContain('bash');
    expect(callArgs).toContain(bashScriptPath);
  });

  test('wrapper passes command line arguments to bash script', () => {
    const testArgs = ['--change', 'test-change', '--max-iterations', '10'];
    
    // Mock process.argv
    const originalArgv = process.argv;
    process.argv = ['node', scriptPath, ...testArgs];
    
    try {
      // Re-require the script to pick up new argv
      jest.resetModules();
      require(scriptPath);
      
      expect(execSync).toHaveBeenCalled();
      const callArgs = execSync.mock.calls[0][0];
      expect(callArgs).toContain('--change');
      expect(callArgs).toContain('test-change');
      expect(callArgs).toContain('--max-iterations');
      expect(callArgs).toContain('10');
    } finally {
      process.argv = originalArgv;
    }
  });

  test('wrapper quotes arguments containing spaces', () => {
    const testArgs = ['--change', 'test change with spaces'];
    
    const originalArgv = process.argv;
    process.argv = ['node', scriptPath, ...testArgs];
    
    try {
      jest.resetModules();
      require(scriptPath);
      
      expect(execSync).toHaveBeenCalled();
      const callArgs = execSync.mock.calls[0][0];
      // Arguments with spaces should be quoted
      expect(callArgs).toContain('"test change with spaces"');
    } finally {
      process.argv = originalArgv;
    }
  });

  test('wrapper quotes arguments containing quotes', () => {
    const testArgs = ['--test', 'value with "quotes" inside'];
    
    const originalArgv = process.argv;
    process.argv = ['node', scriptPath, ...testArgs];
    
    try {
      jest.resetModules();
      require(scriptPath);
      
      expect(execSync).toHaveBeenCalled();
      const callArgs = execSync.mock.calls[0][0];
      // Quotes should be escaped
      expect(callArgs).toContain('\\\"');
    } finally {
      process.argv = originalArgv;
    }
  });

  test('wrapper passes stdio: inherit to execSync', () => {
    require(scriptPath);
    
    expect(execSync).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ stdio: 'inherit' })
    );
  });

  test('wrapper uses correct bash script path', () => {
    require(scriptPath);
    
    const callArgs = execSync.mock.calls[0][0];
    const expectedPath = path.join(__dirname, '../../../scripts/ralph-run.sh');
    expect(callArgs).toContain(expectedPath);
  });

  test('wrapper handles no arguments', () => {
    const originalArgv = process.argv;
    process.argv = ['node', scriptPath];
    
    try {
      jest.resetModules();
      require(scriptPath);
      
      expect(execSync).toHaveBeenCalled();
      const callArgs = execSync.mock.calls[0][0];
      // Should still call bash script, just with no additional args
      expect(callArgs).toContain(bashScriptPath);
    } finally {
      process.argv = originalArgv;
    }
  });

  test('wrapper handles single argument', () => {
    const originalArgv = process.argv;
    process.argv = ['node', scriptPath, '--help'];
    
    try {
      jest.resetModules();
      require(scriptPath);
      
      expect(execSync).toHaveBeenCalled();
      const callArgs = execSync.mock.calls[0][0];
      expect(callArgs).toContain('--help');
    } finally {
      process.argv = originalArgv;
    }
  });

  test('wrapper handles multiple arguments', () => {
    const originalArgv = process.argv;
    process.argv = ['node', scriptPath, '--change', 'my-change', '--verbose', '--max-iterations', '5'];
    
    try {
      jest.resetModules();
      require(scriptPath);
      
      expect(execSync).toHaveBeenCalled();
      const callArgs = execSync.mock.calls[0][0];
      expect(callArgs).toContain('--change');
      expect(callArgs).toContain('my-change');
      expect(callArgs).toContain('--verbose');
      expect(callArgs).toContain('--max-iterations');
      expect(callArgs).toContain('5');
    } finally {
      process.argv = originalArgv;
    }
  });

  test('wrapper exits with non-zero when bash script fails', () => {
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {});
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
    execSync.mockImplementation(() => {
      throw new Error('Script failed');
    });
    
    require(scriptPath);
    
    expect(exitSpy).toHaveBeenCalledWith(1);
    
    exitSpy.mockRestore();
  });

  test('wrapper does not exit when bash script succeeds', () => {
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {});
    execSync.mockImplementation(() => {
      return 'success';
    });
    
    require(scriptPath);
    
    // Should not call process.exit if successful
    expect(exitSpy).not.toHaveBeenCalled();
    
    exitSpy.mockRestore();
  });

  test('wrapper uses bash interpreter', () => {
    require(scriptPath);
    
    const callArgs = execSync.mock.calls[0][0];
    expect(callArgs).toMatch(/^bash/);
  });

  test('wrapper passes all arguments as single string to bash', () => {
    const originalArgv = process.argv;
    process.argv = ['node', scriptPath, '--arg1', 'val1', '--arg2', 'val2'];
    
    try {
      jest.resetModules();
      require(scriptPath);
      
      expect(execSync).toHaveBeenCalled();
      // execSync should be called with a single string command
      const callArgs = execSync.mock.calls[0][0];
      expect(typeof callArgs).toBe('string');
    } finally {
      process.argv = originalArgv;
    }
  });
});
