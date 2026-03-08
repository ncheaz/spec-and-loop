const path = require('path');

// Mock fs, execSync, and console
jest.mock('fs');
jest.mock('child_process', () => ({
  execSync: jest.fn(),
}));

describe('setup.js post-install script', () => {
  const setupPath = path.join(__dirname, '../../../scripts/setup.js');

  let consoleLogSpy;
  let consoleWarnSpy;
  let consoleErrorSpy;
  let runSetup;
  let mockFs;
  let mockExecSync;

  beforeEach(() => {
    // Reset modules so setup.js is freshly required each test
    jest.resetModules();

    // Re-require mocked modules AFTER resetModules to get same instances as setup.js
    mockFs = require('fs');
    mockExecSync = require('child_process').execSync;

    // Clear mock state
    jest.clearAllMocks();

    // Default: ralph-run.sh exists
    mockFs.existsSync.mockReturnValue(true);
    mockExecSync.mockReturnValue('success');

    // Set up console spies fresh each test
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    // Mock process.exit
    process.exit = jest.fn().mockImplementation((code) => {
      throw new Error(`exit ${code}`);
    });

    // Require the setup module fresh (after mocks are ready)
    runSetup = require(setupPath).runSetup;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('script exists and can be required', () => {
    expect(() => {
      runSetup();
    }).not.toThrow();
  });

  test('makes ralph-run.sh executable using chmod +x', () => {
    runSetup();

    expect(mockExecSync).toHaveBeenCalledWith(
      expect.stringContaining('chmod +x'),
      expect.any(Object)
    );
  });

  test('includes ralph-run.sh path in chmod command', () => {
    runSetup();

    const chmodCall = mockExecSync.mock.calls.find(call => 
      call[0] && call[0].includes('chmod')
    );
    expect(chmodCall[0]).toContain('ralph-run.sh');
  });

  test('quotes the script path in chmod command', () => {
    runSetup();

    const chmodCall = mockExecSync.mock.calls.find(call => 
      call[0] && call[0].includes('chmod')
    );
    expect(chmodCall[0]).toMatch(/".*ralph-run\.sh"/);
  });

  test('logs success message after chmod succeeds', () => {
    runSetup();

    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('Made ralph-run.sh executable')
    );
  });

  test('checks if ralph-run.sh exists before chmod', () => {
    runSetup();

    expect(mockFs.existsSync).toHaveBeenCalled();
  });

  test('logs error when ralph-run.sh not found', () => {
    mockFs.existsSync.mockReturnValue(false);

    try {
      runSetup();
    } catch (e) {
      // Expected exit
    }

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('ralph-run.sh not found')
    );
  });

  test('exits with code 1 when ralph-run.sh not found', () => {
    mockFs.existsSync.mockReturnValue(false);

    expect(() => {
      runSetup();
    }).toThrow(expect.objectContaining({
      message: expect.stringContaining('exit 1')
    }));
  });

  test('handles chmod error gracefully', () => {
    const chmodError = new Error('Permission denied');
    chmodError.code = 'EPERM';
    mockExecSync.mockImplementation(() => {
      throw chmodError;
    });

    runSetup();

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Could not make ralph-run.sh executable')
    );
  });

  test('logs chmod error message', () => {
    const chmodError = new Error('Permission denied');
    chmodError.code = 'EPERM';
    mockExecSync.mockImplementation(() => {
      throw chmodError;
    });

    runSetup();

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Permission denied')
    );
  });

  test('continues execution after chmod warning', () => {
    mockExecSync.mockImplementation(() => {
      throw new Error('chmod failed');
    });

    runSetup();

    // Should log warning and continue
    expect(consoleWarnSpy).toHaveBeenCalled();
  });

  test('logs setup start message', () => {
    runSetup();

    expect(consoleLogSpy).toHaveBeenCalledWith(
      'Setting up spec-and-loop...'
    );
  });

  test('logs installation directory', () => {
    runSetup();

    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('Installation directory:')
    );
  });

  test('logs setup complete message', () => {
    runSetup();

    expect(consoleLogSpy).toHaveBeenCalledWith(
      'spec-and-loop setup complete!'
    );
  });

  test('logs usage information', () => {
    runSetup();

    expect(consoleLogSpy).toHaveBeenCalledWith(
      'Usage:'
    );
  });

  test('logs prerequisite information', () => {
    runSetup();

    expect(consoleLogSpy).toHaveBeenCalledWith(
      'Prerequisites:'
    );
  });

  test('logs openspec CLI prerequisite', () => {
    runSetup();

    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('openspec CLI')
    );
  });

  test('logs opencode CLI prerequisite', () => {
    runSetup();

    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('opencode CLI')
    );
  });

  test('logs jq CLI prerequisite', () => {
    runSetup();

    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('jq CLI')
    );
  });

  test('logs git prerequisite', () => {
    runSetup();

    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('git:')
    );
  });

  test('chmod command includes +x flag', () => {
    runSetup();

    const chmodCall = mockExecSync.mock.calls.find(call => 
      call[0] && call[0].includes('chmod')
    );
    expect(chmodCall[0]).toContain('+x');
  });

  test('handles ralph-run.sh path with spaces', () => {
    runSetup();

    const chmodCall = mockExecSync.mock.calls.find(call => 
      call[0] && call[0].includes('chmod')
    );
    // Path should be quoted to handle spaces
    expect(chmodCall[0]).toMatch(/".*"/);
  });

  test('chmod is called with correct options', () => {
    runSetup();

    const chmodCall = mockExecSync.mock.calls.find(call => 
      call[0] && call[0].includes('chmod')
    );
    expect(chmodCall[1]).toEqual(expect.any(Object));
  });

  test('does not exit on successful chmod', () => {
    runSetup();

    // Should reach the end and complete successfully
    expect(process.exit).not.toHaveBeenCalledWith(1);
  });

  test('handles EACCES error for chmod', () => {
    const chmodError = new Error('Access denied');
    chmodError.code = 'EACCES';
    mockExecSync.mockImplementation(() => {
      throw chmodError;
    });

    runSetup();

    expect(consoleWarnSpy).toHaveBeenCalled();
  });
});
