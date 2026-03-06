const { execSync } = require('child_process');
const path = require('path');

// Mock execSync to simulate different exit codes and errors
jest.mock('child_process', () => ({
  execSync: jest.fn(),
}));

describe('ralph-run error handling', () => {
  const scriptPath = path.join(__dirname, '../../../bin/ralph-run');

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(process, 'exit').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.resetModules();
    jest.restoreAllMocks();
  });

  const runWrapperAndExpectExit = (mockError, expectedExitCode) => {
    execSync.mockImplementation(() => {
      throw mockError;
    });
    
    jest.resetModules();
    require(scriptPath);
    
    expect(process.exit).toHaveBeenCalledWith(expectedExitCode);
  };

  test('exits with code 1 when bash script exits with code 1', () => {
    const error = new Error('Script failed');
    error.status = 1;
    
    runWrapperAndExpectExit(error, 1);
  });

  test('exits with code 2 when bash script exits with code 2', () => {
    const error = new Error('Script failed');
    error.status = 2;
    
    runWrapperAndExpectExit(error, 2);
  });

  test('exits with code 127 when bash script exits with code 127', () => {
    const error = new Error('Command not found');
    error.status = 127;
    
    runWrapperAndExpectExit(error, 127);
  });

  test('exits with code 130 when bash script exits with code 130 (SIGINT)', () => {
    const error = new Error('Interrupted');
    error.status = 130;
    
    runWrapperAndExpectExit(error, 130);
  });

  test('exits with code 143 when bash script exits with code 143 (SIGTERM)', () => {
    const error = new Error('Terminated');
    error.status = 143;
    
    runWrapperAndExpectExit(error, 143);
  });

  test('exits with code 255 when bash script exits with code 255', () => {
    const error = new Error('General error');
    error.status = 255;
    
    runWrapperAndExpectExit(error, 255);
  });

  test('exits with code 42 when bash script exits with code 42', () => {
    const error = new Error('Custom error code');
    error.status = 42;
    
    runWrapperAndExpectExit(error, 42);
  });

  test('exits with code 1 when bash script has no status code', () => {
    const error = new Error('Script failed');
    delete error.status;
    
    runWrapperAndExpectExit(error, 1);
  });

  test('exits with code 1 when bash script status is undefined', () => {
    const error = new Error('Script failed');
    error.status = undefined;
    
    runWrapperAndExpectExit(error, 1);
  });

  test('exits with code 1 when bash script status is null', () => {
    const error = new Error('Script failed');
    error.status = null;
    
    runWrapperAndExpectExit(error, 1);
  });

  test('exits with code 1 when bash script status is zero', () => {
    const error = new Error('Script failed');
    error.status = 0;
    
    // Even though status is 0, an error was thrown, so should exit with 1
    runWrapperAndExpectExit(error, 1);
  });

  test('does not call process.exit when bash script succeeds', () => {
    execSync.mockImplementation(() => {
      return 'success';
    });
    
    jest.resetModules();
    require(scriptPath);
    
    expect(process.exit).not.toHaveBeenCalled();
  });

  test('handles Error object with message', () => {
    const error = new Error('Test error message');
    error.status = 5;
    
    execSync.mockImplementation(() => {
      throw error;
    });
    
    jest.resetModules();
    require(scriptPath);
    
    expect(process.exit).toHaveBeenCalledWith(5);
  });

  test('handles error with stderr output', () => {
    const error = new Error('Command failed');
    error.status = 1;
    error.stderr = 'Error output from command';
    
    execSync.mockImplementation(() => {
      throw error;
    });
    
    jest.resetModules();
    require(scriptPath);
    
    expect(process.exit).toHaveBeenCalledWith(1);
  });

  test('handles error with stdout output', () => {
    const error = new Error('Command failed');
    error.status = 2;
    error.stdout = 'Some output before error';
    
    execSync.mockImplementation(() => {
      throw error;
    });
    
    jest.resetModules();
    require(scriptPath);
    
    expect(process.exit).toHaveBeenCalledWith(2);
  });

  test('handles error with both stdout and stderr', () => {
    const error = new Error('Command failed');
    error.status = 3;
    error.stdout = 'stdout output';
    error.stderr = 'stderr output';
    
    execSync.mockImplementation(() => {
      throw error;
    });
    
    jest.resetModules();
    require(scriptPath);
    
    expect(process.exit).toHaveBeenCalledWith(3);
  });

  test('preserves error status code from execSync', () => {
    const testCodes = [1, 2, 10, 50, 99, 127, 130, 143, 255];
    
    testCodes.forEach(code => {
      const error = new Error('Script failed');
      error.status = code;
      
      execSync.mockImplementation(() => {
        throw error;
      });
      
      jest.resetModules();
      require(scriptPath);
      
      expect(process.exit).toHaveBeenCalledWith(code);
      jest.clearAllMocks();
    });
  });

  test('calls process.exit only once per error', () => {
    const error = new Error('Script failed');
    error.status = 1;
    
    execSync.mockImplementation(() => {
      throw error;
    });
    
    jest.resetModules();
    require(scriptPath);
    
    expect(process.exit).toHaveBeenCalledTimes(1);
  });

  test('handles non-standard exit codes', () => {
    const error = new Error('Custom exit code');
    error.status = 999;
    
    runWrapperAndExpectExit(error, 999);
  });

  test('handles negative exit codes', () => {
    const error = new Error('Negative exit code');
    error.status = -1;
    
    execSync.mockImplementation(() => {
      throw error;
    });
    
    jest.resetModules();
    require(scriptPath);
    
    expect(process.exit).toHaveBeenCalledWith(-1);
  });

  test('handles very large exit codes', () => {
    const error = new Error('Large exit code');
    error.status = 9999;
    
    runWrapperAndExpectExit(error, 9999);
  });

  test('exits with code 1 for generic errors without status', () => {
    const error = new Error('Generic error');
    // Don't set status property
    
    execSync.mockImplementation(() => {
      throw error;
    });
    
    jest.resetModules();
    require(scriptPath);
    
    expect(process.exit).toHaveBeenCalledWith(1);
  });

  test('catches all execSync errors and prevents crash', () => {
    const error = new Error('Unexpected error');
    error.status = 1;
    
    execSync.mockImplementation(() => {
      throw error;
    });
    
    // This should not throw an exception
    expect(() => {
      jest.resetModules();
      require(scriptPath);
    }).not.toThrow();
    
    expect(process.exit).toHaveBeenCalledWith(1);
  });
});
