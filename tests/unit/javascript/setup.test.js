const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Mock fs, execSync, and console
jest.mock('fs');
jest.mock('child_process', () => ({
  execSync: jest.fn(),
}));

// Mock console methods to capture output
const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

describe('setup.js post-install script', () => {
  const setupPath = path.join(__dirname, '../../../scripts/setup.js');
  const mockRalphRunScript = '/path/to/ralph-run.sh';

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    consoleLogSpy.mockClear();
    consoleWarnSpy.mockClear();
    consoleErrorSpy.mockClear();
    
    // Reset process.exit
    const originalExit = process.exit;
    process.exit = jest.fn();
    process.exit.mockImplementation((code) => {
      throw new Error(`exit ${code}`);
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const runSetup = () => {
    try {
      require(setupPath);
    } catch (e) {
      // process.exit throws, ignore
      if (!e.message.startsWith('exit')) {
        throw e;
      }
    }
  };

  test('script exists and can be required', () => {
    expect(() => {
      runSetup();
    }).not.toThrow();
  });

  test('makes ralph-run.sh executable using chmod +x', () => {
    fs.existsSync.mockReturnValue(true);
    execSync.mockReturnValue('success');

    runSetup();

    expect(execSync).toHaveBeenCalledWith(
      expect.stringContaining('chmod +x'),
      expect.any(Object)
    );
  });

  test('includes ralph-run.sh path in chmod command', () => {
    fs.existsSync.mockReturnValue(true);
    execSync.mockReturnValue('success');

    runSetup();

    const chmodCall = execSync.mock.calls.find(call => 
      call[0] && call[0].includes('chmod')
    );
    expect(chmodCall[0]).toContain('ralph-run.sh');
  });

  test('quotes the script path in chmod command', () => {
    fs.existsSync.mockReturnValue(true);
    execSync.mockReturnValue('success');

    runSetup();

    const chmodCall = execSync.mock.calls.find(call => 
      call[0] && call[0].includes('chmod')
    );
    expect(chmodCall[0]).toMatch(/".*ralph-run\.sh"/);
  });

  test('logs success message after chmod succeeds', () => {
    fs.existsSync.mockReturnValue(true);
    execSync.mockReturnValue('success');

    runSetup();

    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('Made ralph-run.sh executable')
    );
  });

  test('checks if ralph-run.sh exists before chmod', () => {
    fs.existsSync.mockReturnValue(true);
    execSync.mockReturnValue('success');

    runSetup();

    expect(fs.existsSync).toHaveBeenCalled();
  });

  test('logs error when ralph-run.sh not found', () => {
    fs.existsSync.mockReturnValue(false);

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
    fs.existsSync.mockReturnValue(false);

    expect(() => {
      runSetup();
    }).toThrow(expect.objectContaining({
      message: expect.stringContaining('exit 1')
    }));
  });

  test('handles chmod error gracefully', () => {
    fs.existsSync.mockReturnValue(true);
    const chmodError = new Error('Permission denied');
    chmodError.code = 'EPERM';
    execSync.mockImplementation(() => {
      throw chmodError;
    });

    runSetup();

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Could not make ralph-run.sh executable')
    );
  });

  test('logs chmod error message', () => {
    fs.existsSync.mockReturnValue(true);
    const chmodError = new Error('Permission denied');
    chmodError.code = 'EPERM';
    execSync.mockImplementation(() => {
      throw chmodError;
    });

    runSetup();

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Permission denied')
    );
  });

  test('continues execution after chmod warning', () => {
    fs.existsSync.mockReturnValue(true);
    execSync.mockImplementation(() => {
      throw new Error('chmod failed');
    });

    runSetup();

    // Should log warning and continue
    expect(consoleWarnSpy).toHaveBeenCalled();
  });

  test('logs setup start message', () => {
    fs.existsSync.mockReturnValue(true);
    execSync.mockReturnValue('success');

    runSetup();

    expect(consoleLogSpy).toHaveBeenCalledWith(
      'Setting up spec-and-loop...'
    );
  });

  test('logs installation directory', () => {
    fs.existsSync.mockReturnValue(true);
    execSync.mockReturnValue('success');

    runSetup();

    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('Installation directory:')
    );
  });

  test('logs setup complete message', () => {
    fs.existsSync.mockReturnValue(true);
    execSync.mockReturnValue('success');

    runSetup();

    expect(consoleLogSpy).toHaveBeenCalledWith(
      'spec-and-loop setup complete!'
    );
  });

  test('logs usage information', () => {
    fs.existsSync.mockReturnValue(true);
    execSync.mockReturnValue('success');

    runSetup();

    expect(consoleLogSpy).toHaveBeenCalledWith(
      'Usage:'
    );
  });

  test('logs prerequisite information', () => {
    fs.existsSync.mockReturnValue(true);
    execSync.mockReturnValue('success');

    runSetup();

    expect(consoleLogSpy).toHaveBeenCalledWith(
      'Prerequisites:'
    );
  });

  test('logs openspec CLI prerequisite', () => {
    fs.existsSync.mockReturnValue(true);
    execSync.mockReturnValue('success');

    runSetup();

    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('openspec CLI')
    );
  });

  test('logs opencode CLI prerequisite', () => {
    fs.existsSync.mockReturnValue(true);
    execSync.mockReturnValue('success');

    runSetup();

    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('opencode CLI')
    );
  });

  test('logs jq CLI prerequisite', () => {
    fs.existsSync.mockReturnValue(true);
    execSync.mockReturnValue('success');

    runSetup();

    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('jq CLI')
    );
  });

  test('logs git prerequisite', () => {
    fs.existsSync.mockReturnValue(true);
    execSync.mockReturnValue('success');

    runSetup();

    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('git:')
    );
  });

  test('chmod command includes +x flag', () => {
    fs.existsSync.mockReturnValue(true);
    execSync.mockReturnValue('success');

    runSetup();

    const chmodCall = execSync.mock.calls.find(call => 
      call[0] && call[0].includes('chmod')
    );
    expect(chmodCall[0]).toContain('+x');
  });

  test('handles ralph-run.sh path with spaces', () => {
    fs.existsSync.mockReturnValue(true);
    execSync.mockReturnValue('success');
    
    // Mock __dirname to include spaces
    jest.doMock('path', () => ({
      ...jest.requireActual('path'),
      join: jest.fn((...args) => {
        const actualPath = jest.requireActual('path').join(...args);
        return actualPath.replace('spec-and-loop', 'spec and loop');
      })
    }));

    runSetup();

    const chmodCall = execSync.mock.calls.find(call => 
      call[0] && call[0].includes('chmod')
    );
    // Path should be quoted to handle spaces
    expect(chmodCall[0]).toMatch(/".*"/);
  });

  test('chmod is called with correct options', () => {
    fs.existsSync.mockReturnValue(true);
    execSync.mockReturnValue('success');

    runSetup();

    const chmodCall = execSync.mock.calls.find(call => 
      call[0] && call[0].includes('chmod')
    );
    expect(chmodCall[1]).toEqual(expect.any(Object));
  });

  test('does not exit on successful chmod', () => {
    fs.existsSync.mockReturnValue(true);
    execSync.mockReturnValue('success');

    runSetup();

    // Should reach the end and complete successfully
    expect(process.exit).not.toHaveBeenCalledWith(1);
  });

  test('handles EACCES error for chmod', () => {
    fs.existsSync.mockReturnValue(true);
    const chmodError = new Error('Access denied');
    chmodError.code = 'EACCES';
    execSync.mockImplementation(() => {
      throw chmodError;
    });

    runSetup();

    expect(consoleWarnSpy).toHaveBeenCalled();
  });
});
