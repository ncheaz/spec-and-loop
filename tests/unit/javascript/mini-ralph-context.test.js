'use strict';

/**
 * Unit tests for lib/mini-ralph/context.js
 *
 * Tests pending context management: reading, adding, clearing, consuming,
 * and presence detection for .ralph/ralph-context.md.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const context = require('../../../lib/mini-ralph/context');

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ralph-context-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('context.contextPath()', () => {
  test('returns path to ralph-context.md inside ralphDir', () => {
    const p = context.contextPath('/some/dir');
    expect(p).toBe(path.join('/some/dir', 'ralph-context.md'));
  });
});

describe('context.read()', () => {
  test('returns empty string when context file does not exist', () => {
    const ralphDir = path.join(tmpDir, '.ralph');
    fs.mkdirSync(ralphDir);
    expect(context.read(ralphDir)).toBe('');
  });

  test('returns trimmed content of context file', () => {
    const ralphDir = path.join(tmpDir, '.ralph');
    fs.mkdirSync(ralphDir);
    fs.writeFileSync(context.contextPath(ralphDir), '  some context  \n', 'utf8');
    expect(context.read(ralphDir)).toBe('some context');
  });
});

describe('context.add()', () => {
  test('creates ralphDir if it does not exist', () => {
    const ralphDir = path.join(tmpDir, '.ralph-new');
    expect(fs.existsSync(ralphDir)).toBe(false);
    context.add(ralphDir, 'hello');
    expect(fs.existsSync(ralphDir)).toBe(true);
  });

  test('creates context file with the provided text', () => {
    const ralphDir = path.join(tmpDir, '.ralph');
    fs.mkdirSync(ralphDir);
    context.add(ralphDir, 'first context note');
    expect(context.read(ralphDir)).toBe('first context note');
  });

  test('appends to existing context with separator', () => {
    const ralphDir = path.join(tmpDir, '.ralph');
    fs.mkdirSync(ralphDir);
    context.add(ralphDir, 'first note');
    context.add(ralphDir, 'second note');
    const result = context.read(ralphDir);
    expect(result).toContain('first note');
    expect(result).toContain('second note');
  });

  test('does nothing when text is empty or whitespace-only', () => {
    const ralphDir = path.join(tmpDir, '.ralph');
    fs.mkdirSync(ralphDir);
    context.add(ralphDir, '   ');
    expect(fs.existsSync(context.contextPath(ralphDir))).toBe(false);
  });

  test('does nothing when text is empty string', () => {
    const ralphDir = path.join(tmpDir, '.ralph');
    fs.mkdirSync(ralphDir);
    context.add(ralphDir, '');
    expect(fs.existsSync(context.contextPath(ralphDir))).toBe(false);
  });

  test('trims added text', () => {
    const ralphDir = path.join(tmpDir, '.ralph');
    fs.mkdirSync(ralphDir);
    context.add(ralphDir, '  trimmed context  ');
    expect(context.read(ralphDir)).toBe('trimmed context');
  });
});

describe('context.clear()', () => {
  test('removes the context file', () => {
    const ralphDir = path.join(tmpDir, '.ralph');
    fs.mkdirSync(ralphDir);
    context.add(ralphDir, 'some context');
    context.clear(ralphDir);
    expect(fs.existsSync(context.contextPath(ralphDir))).toBe(false);
  });

  test('is a no-op when context file does not exist', () => {
    const ralphDir = path.join(tmpDir, '.ralph');
    fs.mkdirSync(ralphDir);
    expect(() => context.clear(ralphDir)).not.toThrow();
  });
});

describe('context.consume()', () => {
  test('returns context text and clears the file', () => {
    const ralphDir = path.join(tmpDir, '.ralph');
    fs.mkdirSync(ralphDir);
    context.add(ralphDir, 'pending guidance');
    const result = context.consume(ralphDir);
    expect(result).toBe('pending guidance');
    expect(fs.existsSync(context.contextPath(ralphDir))).toBe(false);
  });

  test('returns null when no context is pending', () => {
    const ralphDir = path.join(tmpDir, '.ralph');
    fs.mkdirSync(ralphDir);
    const result = context.consume(ralphDir);
    expect(result).toBeNull();
  });

  test('context is not re-injected after consumption', () => {
    const ralphDir = path.join(tmpDir, '.ralph');
    fs.mkdirSync(ralphDir);
    context.add(ralphDir, 'one-time context');
    context.consume(ralphDir);
    // Second consume should return null
    expect(context.consume(ralphDir)).toBeNull();
  });
});

describe('context.hasPending()', () => {
  test('returns false when no context exists', () => {
    const ralphDir = path.join(tmpDir, '.ralph');
    fs.mkdirSync(ralphDir);
    expect(context.hasPending(ralphDir)).toBe(false);
  });

  test('returns true when context is present', () => {
    const ralphDir = path.join(tmpDir, '.ralph');
    fs.mkdirSync(ralphDir);
    context.add(ralphDir, 'pending note');
    expect(context.hasPending(ralphDir)).toBe(true);
  });

  test('returns false after context is cleared', () => {
    const ralphDir = path.join(tmpDir, '.ralph');
    fs.mkdirSync(ralphDir);
    context.add(ralphDir, 'pending note');
    context.clear(ralphDir);
    expect(context.hasPending(ralphDir)).toBe(false);
  });
});
