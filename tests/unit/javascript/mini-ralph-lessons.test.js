'use strict';

/**
 * Unit tests for lib/mini-ralph/lessons.js
 *
 * Covers: missing file, under-cap file, bullet truncation, inject limit,
 * rotate trimming, and inject determinism.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const lessons = require('../../../lib/mini-ralph/lessons');

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ralph-lessons-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// path()
// ---------------------------------------------------------------------------
describe('path()', () => {
  test('returns the absolute path to LESSONS.md under ralphDir', () => {
    const result = lessons.path(tmpDir);
    expect(result).toBe(path.join(tmpDir, 'LESSONS.md'));
  });
});

// ---------------------------------------------------------------------------
// read() – missing file
// ---------------------------------------------------------------------------
describe('read() – missing file', () => {
  test('returns empty array when LESSONS.md does not exist', () => {
    const result = lessons.read(tmpDir);
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// read() – under-cap file
// ---------------------------------------------------------------------------
describe('read() – under-cap file', () => {
  test('returns bullets unchanged when all are <= 120 chars', () => {
    const bullet1 = '- Short bullet one';
    const bullet2 = '- Another short bullet';
    fs.writeFileSync(lessons.path(tmpDir), bullet1 + '\n' + bullet2 + '\n', 'utf8');

    const result = lessons.read(tmpDir);
    expect(result).toEqual([bullet1, bullet2]);
  });

  test('strips blank lines', () => {
    fs.writeFileSync(lessons.path(tmpDir), '\n- Bullet A\n\n- Bullet B\n\n', 'utf8');
    const result = lessons.read(tmpDir);
    expect(result).toEqual(['- Bullet A', '- Bullet B']);
  });
});

// ---------------------------------------------------------------------------
// read() – bullet > 120 chars truncation
// ---------------------------------------------------------------------------
describe('read() – truncation', () => {
  test('truncates bullets longer than 120 chars and prefixes with runner-truncated:', () => {
    const longBullet = '- ' + 'x'.repeat(130); // 132 chars total
    fs.writeFileSync(lessons.path(tmpDir), longBullet + '\n', 'utf8');

    const result = lessons.read(tmpDir);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatch(/^runner-truncated:/);
    // The original bullet was 132 chars; after truncation to 120 it should end with x's
    expect(result[0]).toHaveLength('runner-truncated:'.length + 120);
  });

  test('does not truncate a bullet of exactly 120 chars', () => {
    const exactBullet = 'x'.repeat(120);
    fs.writeFileSync(lessons.path(tmpDir), exactBullet + '\n', 'utf8');

    const result = lessons.read(tmpDir);
    expect(result).toEqual([exactBullet]);
  });
});

// ---------------------------------------------------------------------------
// inject() – missing file → empty string
// ---------------------------------------------------------------------------
describe('inject() – missing file', () => {
  test('returns empty string when LESSONS.md does not exist', () => {
    const result = lessons.inject(tmpDir);
    expect(result).toBe('');
  });
});

// ---------------------------------------------------------------------------
// inject() – over-50 bullets → only last 50 injected
// ---------------------------------------------------------------------------
describe('inject() – over-50 bullets', () => {
  test('injects only the last 50 bullets when file has more than 50', () => {
    const allBullets = Array.from({ length: 60 }, (_, i) => `- Bullet ${i + 1}`);
    fs.writeFileSync(lessons.path(tmpDir), allBullets.join('\n') + '\n', 'utf8');

    const result = lessons.inject(tmpDir);
    expect(result).toMatch(/^## Lessons Learned\n\n/);

    // The last bullet should be present
    expect(result).toContain('- Bullet 60');
    // The 10th bullet (first one to be dropped) should NOT be present
    expect(result).not.toContain('- Bullet 10');
    // Exactly 50 bullets in the output
    const bulletLines = result.split('\n').filter(l => l.startsWith('- Bullet'));
    expect(bulletLines).toHaveLength(50);
  });

  test('respects a custom limit option', () => {
    const allBullets = Array.from({ length: 20 }, (_, i) => `- B${i + 1}`);
    fs.writeFileSync(lessons.path(tmpDir), allBullets.join('\n') + '\n', 'utf8');

    const result = lessons.inject(tmpDir, { limit: 5 });
    const bulletLines = result.split('\n').filter(l => l.startsWith('- B'));
    expect(bulletLines).toHaveLength(5);
    expect(result).toContain('- B20');
    expect(result).not.toContain('- B15');
  });
});

// ---------------------------------------------------------------------------
// inject() – determinism
// ---------------------------------------------------------------------------
describe('inject() – determinism', () => {
  test('returns identical output on two consecutive calls with identical file', () => {
    const bullets = ['- Alpha', '- Beta', '- Gamma'];
    fs.writeFileSync(lessons.path(tmpDir), bullets.join('\n') + '\n', 'utf8');

    const first = lessons.inject(tmpDir);
    const second = lessons.inject(tmpDir);
    expect(first).toBe(second);
  });
});

// ---------------------------------------------------------------------------
// rotate() – missing file
// ---------------------------------------------------------------------------
describe('rotate() – missing file', () => {
  test('returns 0 when LESSONS.md does not exist', () => {
    const dropped = lessons.rotate(tmpDir, 100);
    expect(dropped).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// rotate() – under-cap file
// ---------------------------------------------------------------------------
describe('rotate() – under-cap file', () => {
  test('returns 0 and does not write when bullet count is within cap', () => {
    const bullets = Array.from({ length: 10 }, (_, i) => `- Lesson ${i + 1}`);
    fs.writeFileSync(lessons.path(tmpDir), bullets.join('\n') + '\n', 'utf8');
    const mtimeBefore = fs.statSync(lessons.path(tmpDir)).mtimeMs;

    const dropped = lessons.rotate(tmpDir, 100);
    expect(dropped).toBe(0);

    const mtimeAfter = fs.statSync(lessons.path(tmpDir)).mtimeMs;
    expect(mtimeAfter).toBe(mtimeBefore);
  });
});

// ---------------------------------------------------------------------------
// rotate() – over-100 bullets → trims to 100 and returns dropped count
// ---------------------------------------------------------------------------
describe('rotate() – over-cap file', () => {
  test('trims to max bullets and returns the number of bullets dropped', () => {
    const allBullets = Array.from({ length: 120 }, (_, i) => `- Lesson ${i + 1}`);
    fs.writeFileSync(lessons.path(tmpDir), allBullets.join('\n') + '\n', 'utf8');

    const dropped = lessons.rotate(tmpDir, 100);
    expect(dropped).toBe(20);

    // Re-read the file and verify only 100 bullets remain
    const remaining = lessons.read(tmpDir);
    expect(remaining).toHaveLength(100);
    // Last bullet kept should be the original last one
    expect(remaining[remaining.length - 1]).toBe('- Lesson 120');
    // First bullet kept should be the 21st
    expect(remaining[0]).toBe('- Lesson 21');
  });

  test('rotate with max=100 on a 101-bullet file drops exactly 1', () => {
    const bullets = Array.from({ length: 101 }, (_, i) => `- X${i}`);
    fs.writeFileSync(lessons.path(tmpDir), bullets.join('\n') + '\n', 'utf8');

    const dropped = lessons.rotate(tmpDir, 100);
    expect(dropped).toBe(1);

    const remaining = lessons.read(tmpDir);
    expect(remaining).toHaveLength(100);
  });
});
