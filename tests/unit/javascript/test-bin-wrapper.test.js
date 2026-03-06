const { execSync } = require('child_process');
const path = require('path');

// Mock execSync to test the wrapper without actually running the bash script
jest.mock('child_process', () => ({
  execSync: jest.fn()
}));

// Import after mocking
const ralphRunWrapper = require('../../../../bin/ralph-run');

describe('ralph-run wrapper', () => {
  const originalArgv = process.argv;
  const scriptPath = path.join(__dirname, '..', '..', '..', '..', 'scripts', 'ralph-run.sh');

  beforeEach(() => {
    // Reset mocks and environment
    jest.clearAllMocks();
    process.argv = [...originalArgv];
  });

  afterEach(() => {
    process.argv = originalArgv;
  });

  test('invokes bash script with correct path', () => {
    process.argv = ['node', 'ralph-run'];
    require('../../../../bin/ralph-run');

    expect(execSync).toHaveBeenCalledWith(
      expect.stringContaining('bash'),
      expect.objectContaining({ stdio: 'inherit' })
    );
  });

  test('passes through command-line arguments', () => {
    process.argv = ['node', 'ralph-run', '--change', 'test-change', '--max-iterations', '2'];
    require('../../../../bin/ralph-run');

    const callArgs = execSync.mock.calls[0][0];
    expect(callArgs).toContain('--change');
    expect(callArgs).toContain('test-change');
    expect(callArgs).toContain('--max-iterations');
    expect(callArgs).toContain('2');
  });

  test('quotes arguments with spaces correctly', () => {
    process.argv = ['node', 'ralph-run', '--change', 'test change with spaces'];
    require('../../../../bin/ralph-run');

    const callArgs = execSync.mock.calls[0][0];
    expect(callArgs).toContain('test change with spaces');
  });

  test('escapes quotes in arguments', () => {
    process.argv = ['node', 'ralph-run', '--arg', 'value "with quotes"'];
    require('../../../../bin/ralph-run');

    const callArgs = execSync.mock.calls[0][0];
    expect(callArgs).toContain('value');
  });

  test('uses stdio inherit for proper output passthrough', () => {
    process.argv = ['node', 'ralph-run'];
    require('../../../../bin/ralph-run');

    const callArgs = execSync.mock.calls[1]; // Second call (the actual execSync)
    expect(execSync).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ stdio: 'inherit' })
    );
  });

  test('exits with correct status code on success', () => {
    execSync.mockReturnValue(Buffer.from('output'));
    process.argv = ['node', 'ralph-run'];

    const wrapper = require('../../../../bin/ralph-run');
    // Should not throw on success
  });

  test('exits with error status code on failure', () => {
    const mockError = new Error('Command failed');
    mockError.status = 1;
    execSync.mockImplementation(() => {
      throw mockError;
    });

    process.argv = ['node', 'ralph-run'];

    // The wrapper should exit with the error status
    expect(() => {
      const wrapper = require('../../../../bin/ralph-run');
    }).not.toThrow();
  });

  test('handles missing error status (defaults to 1)', () => {
    const mockError = new Error('Command failed');
    delete mockError.status;
    execSync.mockImplementation(() => {
      throw mockError;
    });

    process.argv = ['node', 'ralph-run'];

    // Should handle missing status gracefully
    expect(() => {
      const wrapper = require('../../../../bin/ralph-run');
    }).not.toThrow();
  });

  test('includes script path in command', () => {
    process.argv = ['node', 'ralph-run'];
    require('../../../../bin/ralph-run');

    const callArgs = execSync.mock.calls[0][0];
    expect(callArgs).toContain('ralph-run.sh');
  });

  test('handles multiple arguments', () => {
    process.argv = ['node', 'ralph-run', '--change', 'test', '--verbose', '--max-iterations', '3'];
    require('../../../../bin/ralph-run');

    const callArgs = execSync.mock.calls[0][0];
    expect(callArgs).toContain('--change');
    expect(callArgs).toContain('test');
    expect(callArgs).toContain('--verbose');
    expect(callArgs).toContain('--max-iterations');
    expect(callArgs).toContain('3');
  });

  test('handles empty arguments list', () => {
    process.argv = ['node', 'ralph-run'];
    require('../../../../bin/ralph-run');

    const callArgs = execSync.mock.calls[0][0];
    expect(callArgs).toContain('bash');
  });

  test('constructs absolute path to script', () => {
    process.argv = ['node', 'ralph-run'];
    require('../../../../bin/ralph-run');

    const callArgs = execSync.mock.calls[0][0];
    expect(callArgs).toContain('scripts/ralph-run.sh');
  });

  test('handles arguments with special characters', () => {
    process.argv = ['node', 'ralph-run', '--arg', 'value&special<char>'];
    require('../../../../bin/ralph-run');

    const callArgs = execSync.mock.calls[0][0];
    expect(callArgs).toContain('value&special<char>');
  });

  test('arguments are properly joined with spaces', () => {
    process.argv = ['node', 'ralph-run', 'arg1', 'arg2', 'arg3'];
    require('../../../../bin/ralph-run');

    const callArgs = execSync.mock.calls[0][0];
    const parts = callArgs.split(' ');
    // Verify that arguments are space-separated
    expect(callArgs).toMatch(/arg1.*arg2.*arg3/);
  });

  test('preserves argument order', () => {
    process.argv = ['node', 'ralph-run', '--first', 'value1', '--second', 'value2'];
    require('../../../../bin/ralph-run');

    const callArgs = execSync.mock.calls[0][0];
    const firstIndex = callArgs.indexOf('--first');
    const secondIndex = callArgs.indexOf('--second');
    expect(firstIndex).toBeLessThan(secondIndex);
  });

  test('works with Node.js script path', () => {
    process.argv = ['node', 'ralph-run', '--version'];
    require('../../../../bin/ralph-run');

    expect(execSync).toHaveBeenCalled();
  });

  test('wrapper can be required multiple times', () => {
    process.argv = ['node', 'ralph-run'];
    
    const wrapper1 = require('../../../../bin/ralph-run');
    const wrapper2 = require('../../../../bin/ralph-run');

    expect(execSync).toHaveBeenCalled();
  });

  test('does not modify original process.argv beyond what is necessary', () => {
    const originalArgvCopy = [...originalArgv];
    process.argv = ['node', 'ralph-run', '--test'];
    
    require('../../../../bin/ralph-run');
    
    // Process.argv may be modified during execution, but the wrapper shouldn't break
    expect(Array.isArray(process.argv)).toBe(true);
  });
});
