const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Mock fs and execSync to test setup behavior
jest.mock('fs');
jest.mock('child_process', () => ({
  execSync: jest.fn(),
}));

describe('setup.js post-install script', () => {
  let consoleLogSpy;
  let consoleWarnSpy;
  let consoleErrorSpy;
  let runSetup;
  let mockFs;
  let mockExecSync;

  beforeEach(() => {
    jest.resetModules();

    // Re-require mocked modules after resetModules
    mockFs = require('fs');
    mockExecSync = require('child_process').execSync;

    jest.clearAllMocks();

    // Default: file exists, chmod succeeds
    mockFs.existsSync.mockReturnValue(true);
    mockExecSync.mockReturnValue('');

    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    process.exit = jest.fn().mockImplementation((code) => {
      throw new Error(`exit ${code}`);
    });

    runSetup = require(path.join(__dirname, '../../../scripts/setup.js')).runSetup;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('makes ralph-run.sh executable when file exists', () => {
    runSetup();

    expect(mockFs.existsSync).toHaveBeenCalled();
    expect(mockExecSync).toHaveBeenCalledWith(
      expect.stringContaining('chmod +x'),
      expect.any(Object)
    );
    expect(mockExecSync.mock.calls[0][0]).toContain('ralph-run.sh');
  });

  test('logs success message when chmod succeeds', () => {
    runSetup();

    const successLog = consoleLogSpy.mock.calls.find(call =>
      call[0] && call[0].includes('Made ralph-run.sh executable')
    );
    expect(successLog).toBeDefined();
  });

  test('exits with error when ralph-run.sh is not found', () => {
    mockFs.existsSync.mockReturnValue(false);

    expect(() => runSetup()).toThrow('exit 1');

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('ralph-run.sh not found')
    );
    expect(process.exit).toHaveBeenCalledWith(1);
  });

  test('logs error message when ralph-run.sh is not found', () => {
    mockFs.existsSync.mockReturnValue(false);

    try { runSetup(); } catch (e) { /* expected exit */ }

    const errorCall = consoleErrorSpy.mock.calls.find(call =>
      call[0] && call[0].includes('not found')
    );
    expect(errorCall).toBeDefined();
  });

  test('logs warning when chmod fails', () => {
    const mockError = new Error('Permission denied');
    mockExecSync.mockImplementation(() => { throw mockError; });

    runSetup();

    const warningCall = consoleWarnSpy.mock.calls.find(call =>
      call[0] && call[0].includes('Could not make ralph-run.sh executable')
    );
    expect(warningCall).toBeDefined();
  });

  test('includes error message in warning when chmod fails', () => {
    const mockError = new Error('Permission denied');
    mockExecSync.mockImplementation(() => { throw mockError; });

    runSetup();

    const warningCall = consoleWarnSpy.mock.calls.find(call =>
      call[0] && call[0].includes('Permission denied')
    );
    expect(warningCall).toBeDefined();
  });

  test('does not exit when chmod fails (only warns)', () => {
    mockExecSync.mockImplementation(() => {
      throw new Error('Permission denied');
    });

    runSetup();

    expect(process.exit).not.toHaveBeenCalled();
  });

  test('logs setup start message', () => {
    runSetup();

    expect(consoleLogSpy).toHaveBeenCalledWith('Setting up spec-and-loop...');
  });

  test('logs installation directory', () => {
    runSetup();

    const dirLog = consoleLogSpy.mock.calls.find(call =>
      call[0] && call[0].includes('Installation directory:')
    );
    expect(dirLog).toBeDefined();
  });

  test('logs setup complete message', () => {
    runSetup();

    const completeLog = consoleLogSpy.mock.calls.find(call =>
      call[0] && call[0].includes('setup complete!')
    );
    expect(completeLog).toBeDefined();
  });

  test('logs usage instructions', () => {
    runSetup();

    const usageLog = consoleLogSpy.mock.calls.find(call => call[0] === 'Usage:');
    expect(usageLog).toBeDefined();
  });

  test('logs ralph-run usage example', () => {
    runSetup();

    const ralphRunLog = consoleLogSpy.mock.calls.find(call =>
      call[0] && call[0].includes('ralph-run')
    );
    expect(ralphRunLog).toBeDefined();
  });

  test('logs openspec usage examples', () => {
    runSetup();

    const openspecLogs = consoleLogSpy.mock.calls.filter(call =>
      call[0] && call[0].includes('openspec')
    );
    expect(openspecLogs.length).toBeGreaterThan(0);
  });

  test('logs prerequisites section', () => {
    runSetup();

    const prerequisitesLog = consoleLogSpy.mock.calls.find(call => call[0] === 'Prerequisites:');
    expect(prerequisitesLog).toBeDefined();
  });

  test('logs all prerequisite tools', () => {
    runSetup();

    const allLogs = consoleLogSpy.mock.calls.flat().join(' ');
    const prerequisites = ['openspec', 'opencode', 'jq', 'git'];
    prerequisites.forEach(prereq => {
      expect(allLogs).toContain(prereq);
    });
  });

  test('logs the scoped openspec install command', () => {
    runSetup();

    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('npm install -g @fission-ai/openspec')
    );
  });

  test('logs the current openspec change creation command', () => {
    runSetup();

    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('openspec new change <name>')
    );
  });

  test('logs the status command and supported OS note', () => {
    runSetup();

    const allLogs = consoleLogSpy.mock.calls.flat().join(' ');
    expect(allLogs).toContain('ralph-run --status');
    expect(allLogs).toContain('supported OS: Linux or macOS');
  });

  test('uses correct chmod command', () => {
    runSetup();

    const chmodCall = mockExecSync.mock.calls[0][0];
    expect(chmodCall).toContain('chmod');
    expect(chmodCall).toContain('+x');
    expect(chmodCall).toContain('ralph-run.sh');
  });

  test('quotes script path in chmod command', () => {
    runSetup();

    const chmodCall = mockExecSync.mock.calls[0][0];
    expect(chmodCall).toMatch(/".*ralph-run\.sh"/);
  });

  test('handles paths with spaces in chmod command', () => {
    runSetup();

    const chmodCall = mockExecSync.mock.calls[0][0];
    // Path is always quoted
    expect(chmodCall).toMatch(/".*"/);
  });

  test('calls execSync with chmod command', () => {
    runSetup();

    expect(mockExecSync).toHaveBeenCalledWith(
      expect.stringContaining('chmod'),
      expect.any(Object)
    );
  });

  test('checks if ralph-run.sh exists before chmod', () => {
    runSetup();

    expect(mockFs.existsSync).toHaveBeenCalled();
    expect(mockExecSync).toHaveBeenCalled();

    // Ensure existsSync was called before execSync
    const existsSyncCall = mockFs.existsSync.mock.invocationCallOrder[0];
    const execSyncCall = mockExecSync.mock.invocationCallOrder[0];
    expect(existsSyncCall < execSyncCall).toBe(true);
  });

  test('does not attempt chmod when file does not exist', () => {
    mockFs.existsSync.mockReturnValue(false);

    try { runSetup(); } catch (e) { /* expected exit */ }

    expect(mockExecSync).not.toHaveBeenCalled();
  });

  test('handles chmod throwing generic error', () => {
    mockExecSync.mockImplementation(() => {
      throw new Error('Unknown error');
    });

    expect(() => runSetup()).not.toThrow();
  });

  test('handles chmod throwing error with no message', () => {
    mockExecSync.mockImplementation(() => {
      const error = new Error();
      delete error.message;
      throw error;
    });

    expect(() => runSetup()).not.toThrow();
  });

  test('logs empty line after setup complete', () => {
    runSetup();

    const emptyLines = consoleLogSpy.mock.calls.filter(call => call[0] === '');
    expect(emptyLines.length).toBeGreaterThan(0);
  });

  test('outputs in expected order: setup, directory, chmod, complete', () => {
    runSetup();

    const logs = consoleLogSpy.mock.calls.map(call => call[0]);

    const setupIndex = logs.findIndex(log => log && log.includes('Setting up'));
    const dirIndex = logs.findIndex(log => log && log.includes('Installation directory'));
    const completeIndex = logs.findIndex(log => log && log.includes('setup complete'));

    expect(setupIndex).toBeLessThan(dirIndex);
    expect(dirIndex).toBeLessThan(completeIndex);
  });
});
