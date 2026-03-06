const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Mock fs and execSync to test setup behavior
jest.mock('fs');
jest.mock('child_process');
jest.mock('path', () => ({
  join: jest.fn((...args) => args.join('/')),
  __esModule: true,
}));

describe('setup.js post-install script', () => {
  const setupScript = path.join(__dirname, '../../../scripts/setup.js');
  const mockRalphRunScript = '/mock/scripts/ralph-run.sh';

  beforeEach(() => {
    jest.clearAllMocks();
    console.log = jest.fn();
    console.warn = jest.fn();
    console.error = jest.fn();
  });

  afterEach(() => {
    jest.resetAllMocks();
    jest.restoreAllMocks();
  });

  const runSetup = () => {
    // Mock __dirname to point to a known location
    jest.doMock('path', () => ({
      join: jest.fn((...args) => {
        // When joining __dirname with ralph-run.sh, return mock path
        if (args[1] === 'ralph-run.sh') {
          return mockRalphRunScript;
        }
        return args.join('/');
      }),
    }));

    // Require setup script
    require(setupScript);
  };

  test('makes ralph-run.sh executable when file exists', () => {
    fs.existsSync.mockReturnValue(true);
    execSync.mockReturnValue('');

    runSetup();

    expect(fs.existsSync).toHaveBeenCalledWith(mockRalphRunScript);
    expect(execSync).toHaveBeenCalledWith(`chmod +x "${mockRalphRunScript}"`);
  });

  test('logs success message when chmod succeeds', () => {
    fs.existsSync.mockReturnValue(true);
    execSync.mockReturnValue('');

    runSetup();

    const successLog = console.log.mock.calls.find(call => 
      call[0] && call[0].includes('Made ralph-run.sh executable')
    );
    expect(successLog).toBeDefined();
  });

  test('exits with error when ralph-run.sh is not found', () => {
    fs.existsSync.mockReturnValue(false);
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {});

    runSetup();

    expect(fs.existsSync).toHaveBeenCalledWith(mockRalphRunScript);
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('ralph-run.sh not found')
    );
    expect(process.exit).toHaveBeenCalledWith(1);

    exitSpy.mockRestore();
  });

  test('logs error message when ralph-run.sh is not found', () => {
    fs.existsSync.mockReturnValue(false);
    jest.spyOn(process, 'exit').mockImplementation(() => {});

    runSetup();

    const errorCall = console.error.mock.calls.find(call => 
      call[0] && call[0].includes('not found')
    );
    expect(errorCall).toBeDefined();

    jest.restoreAllMocks();
  });

  test('logs warning when chmod fails', () => {
    fs.existsSync.mockReturnValue(true);
    const mockError = new Error('Permission denied');
    execSync.mockImplementation(() => {
      throw mockError;
    });

    runSetup();

    const warningCall = console.warn.mock.calls.find(call => 
      call[0] && call[0].includes('Could not make ralph-run.sh executable')
    );
    expect(warningCall).toBeDefined();
  });

  test('includes error message in warning when chmod fails', () => {
    fs.existsSync.mockReturnValue(true);
    const mockError = new Error('Permission denied');
    execSync.mockImplementation(() => {
      throw mockError;
    });

    runSetup();

    const warningCall = console.warn.mock.calls.find(call => 
      call[0] && call[0].includes('Permission denied')
    );
    expect(warningCall).toBeDefined();
  });

  test('does not exit when chmod fails (only warns)', () => {
    fs.existsSync.mockReturnValue(true);
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {});
    execSync.mockImplementation(() => {
      throw new Error('Permission denied');
    });

    runSetup();

    expect(process.exit).not.toHaveBeenCalled();

    exitSpy.mockRestore();
  });

  test('logs setup start message', () => {
    fs.existsSync.mockReturnValue(true);
    execSync.mockReturnValue('');

    runSetup();

    expect(console.log).toHaveBeenCalledWith('Setting up spec-and-loop...');
  });

  test('logs installation directory', () => {
    fs.existsSync.mockReturnValue(true);
    execSync.mockReturnValue('');

    runSetup();

    const dirLog = console.log.mock.calls.find(call => 
      call[0] && call[0].includes('Installation directory:')
    );
    expect(dirLog).toBeDefined();
  });

  test('logs setup complete message', () => {
    fs.existsSync.mockReturnValue(true);
    execSync.mockReturnValue('');

    runSetup();

    const completeLog = console.log.mock.calls.find(call => 
      call[0] && call[0].includes('setup complete!')
    );
    expect(completeLog).toBeDefined();
  });

  test('logs usage instructions', () => {
    fs.existsSync.mockReturnValue(true);
    execSync.mockReturnValue('');

    runSetup();

    const usageLog = console.log.mock.calls.find(call => 
      call[0] && call[0] === 'Usage:'
    );
    expect(usageLog).toBeDefined();
  });

  test('logs ralph-run usage example', () => {
    fs.existsSync.mockReturnValue(true);
    execSync.mockReturnValue('');

    runSetup();

    const ralphRunLog = console.log.mock.calls.find(call => 
      call[0] && call[0].includes('ralph-run')
    );
    expect(ralphRunLog).toBeDefined();
  });

  test('logs openspec usage examples', () => {
    fs.existsSync.mockReturnValue(true);
    execSync.mockReturnValue('');

    runSetup();

    const openspecLogs = console.log.mock.calls.filter(call => 
      call[0] && call[0].includes('openspec')
    );
    expect(openspecLogs.length).toBeGreaterThan(0);
  });

  test('logs prerequisites section', () => {
    fs.existsSync.mockReturnValue(true);
    execSync.mockReturnValue('');

    runSetup();

    const prerequisitesLog = console.log.mock.calls.find(call => 
      call[0] && call[0] === 'Prerequisites:'
    );
    expect(prerequisitesLog).toBeDefined();
  });

  test('logs all prerequisite tools', () => {
    fs.existsSync.mockReturnValue(true);
    execSync.mockReturnValue('');

    runSetup();

    const prerequisites = ['openspec', 'opencode', 'jq', 'git'];
    const allLogs = console.log.mock.calls.flat().join(' ');
    
    prerequisites.forEach(prereq => {
      expect(allLogs).toContain(prereq);
    });
  });

  test('uses correct chmod command', () => {
    fs.existsSync.mockReturnValue(true);
    execSync.mockReturnValue('');

    runSetup();

    const chmodCall = execSync.mock.calls[0][0];
    expect(chmodCall).toContain('chmod');
    expect(chmodCall).toContain('+x');
    expect(chmodCall).toContain(mockRalphRunScript);
  });

  test('quotes script path in chmod command', () => {
    fs.existsSync.mockReturnValue(true);
    execSync.mockReturnValue('');

    runSetup();

    const chmodCall = execSync.mock.calls[0][0];
    expect(chmodCall).toContain(`"${mockRalphRunScript}"`);
  });

  test('handles paths with spaces in chmod command', () => {
    const pathWithSpaces = '/path/with spaces/ralph-run.sh';
    const joinMock = jest.fn((...args) => {
      if (args[1] === 'ralph-run.sh') {
        return pathWithSpaces;
      }
      return args.join('/');
    });

    jest.doMock('path', () => ({
      join: joinMock,
    }));

    fs.existsSync.mockReturnValue(true);
    execSync.mockReturnValue('');

    runSetup();

    const chmodCall = execSync.mock.calls[0][0];
    expect(chmodCall).toContain(`"${pathWithSpaces}"`);
  });

  test('calls execSync with chmod command', () => {
    fs.existsSync.mockReturnValue(true);
    execSync.mockReturnValue('');

    runSetup();

    expect(execSync).toHaveBeenCalledWith(
      expect.stringContaining('chmod')
    );
  });

  test('checks if ralph-run.sh exists before chmod', () => {
    fs.existsSync.mockReturnValue(true);
    execSync.mockReturnValue('');

    runSetup();

    expect(fs.existsSync).toHaveBeenCalled();
    expect(execSync).toHaveBeenCalled();
    
    // Ensure existsSync was called before execSync
    const existsSyncCall = fs.existsSync.mock.invocationCallOrder[0];
    const execSyncCall = execSync.mock.invocationCallOrder[0];
    expect(existsSyncCall < execSyncCall).toBe(true);
  });

  test('does not attempt chmod when file does not exist', () => {
    fs.existsSync.mockReturnValue(false);
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {});

    runSetup();

    expect(execSync).not.toHaveBeenCalled();

    exitSpy.mockRestore();
  });

  test('handles chmod throwing generic error', () => {
    fs.existsSync.mockReturnValue(true);
    execSync.mockImplementation(() => {
      throw new Error('Unknown error');
    });

    expect(() => runSetup()).not.toThrow();
  });

  test('handles chmod throwing error with no message', () => {
    fs.existsSync.mockReturnValue(true);
    execSync.mockImplementation(() => {
      const error = new Error();
      delete error.message;
      throw error;
    });

    expect(() => runSetup()).not.toThrow();
  });

  test('logs empty line after setup complete', () => {
    fs.existsSync.mockReturnValue(true);
    execSync.mockReturnValue('');

    runSetup();

    const emptyLines = console.log.mock.calls.filter(call => call[0] === '');
    expect(emptyLines.length).toBeGreaterThan(0);
  });

  test('outputs in expected order: setup, directory, chmod, complete', () => {
    fs.existsSync.mockReturnValue(true);
    execSync.mockReturnValue('');

    runSetup();

    const logs = console.log.mock.calls.map(call => call[0]);
    
    const setupIndex = logs.findIndex(log => log.includes('Setting up'));
    const dirIndex = logs.findIndex(log => log.includes('Installation directory'));
    const completeIndex = logs.findIndex(log => log.includes('setup complete'));
    
    expect(setupIndex).toBeLessThan(dirIndex);
    expect(dirIndex).toBeLessThan(completeIndex);
  });
});
