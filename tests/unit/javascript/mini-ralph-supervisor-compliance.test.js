'use strict';

const {
  _detectSizingProfile,
  _validateTaskStructure,
} = require('../../../lib/mini-ralph/supervisor');

function makeTaskBody(doneWhenBullets, options = {}) {
  const title = options.title || '- [ ] 4.5 **Implement Layer beta checks**';
  const stopLines = options.stopLines || ['    - existing parser cannot preserve numbered task headings'];
  const auditComment = options.auditComment === false
    ? []
    : ['  <!-- supervised-edit: iter=14 reason="tighten task shape" hash=deadbeef -->'];

  return [
    title,
    '  - Scope: `lib/mini-ralph/supervisor.js`, `tests/unit/javascript/mini-ralph-supervisor-compliance.test.js`',
    '  - Change: Layer beta rejects malformed supervisor task patches before disk writes.',
    '  - Done when:',
    ...doneWhenBullets,
    '  - Stop and hand off if:',
    ...stopLines,
    ...auditComment,
    '',
  ].join('\n');
}

describe('mini-ralph supervisor compliance checks', () => {
  test('detectSizingProfile prefers lightweight bounds when BP declares them', () => {
    expect(_detectSizingProfile(["**Medium profile**: 3–7 `Done when` bullets.", "**Lightweight profile**: 2–5 `Done when` bullets."].join('\n'))).toEqual({
      name: 'lightweight',
      minDoneWhen: 2,
      maxDoneWhen: 5,
      source: 'bp_lightweight',
    });
  });

  test('bold-title missing rejects the patch', () => {
    const result = _validateTaskStructure(makeTaskBody([
      '    - `npx jest tests/unit/javascript/mini-ralph-supervisor-compliance.test.js --runInBand` exits 0',
      '    - `node -e "process.exit(0)"` exits 0',
      '    - rejection reasons include rule names',
    ], { title: '- [ ] 4.5 Implement Layer beta checks' }));

    expect(result.ok).toBe(false);
    expect(result.errors).toContain(
      'bold_title_missing: task body must start with a pending checkbox line containing a bold title'
    );
  });

  test('Done when count = 1 rejects under-spec', () => {
    const result = _validateTaskStructure(makeTaskBody([
      '    - `npx jest tests/unit/javascript/mini-ralph-supervisor-compliance.test.js --runInBand` exits 0',
    ]));

    expect(result.ok).toBe(false);
    expect(result.errors).toContain(
      'done_when_count_under_spec: expected 3-7 nested bullets under `Done when:`, found 1'
    );
  });

  test('Done when count = 9 rejects over-spec', () => {
    const result = _validateTaskStructure(makeTaskBody([
      '    - bullet 1',
      '    - bullet 2',
      '    - bullet 3',
      '    - bullet 4',
      '    - bullet 5',
      '    - bullet 6',
      '    - bullet 7',
      '    - bullet 8',
      '    - bullet 9',
    ]));

    expect(result.ok).toBe(false);
    expect(result.errors).toContain(
      'done_when_count_over_spec: expected 3-7 nested bullets under `Done when:`, found 9'
    );
  });

  test('count = 2 under lightweight profile accepts', () => {
    const result = _validateTaskStructure(
      makeTaskBody([
        '    - `npx jest tests/unit/javascript/mini-ralph-supervisor-compliance.test.js --runInBand` exits 0',
        '    - audit comments remain present in patched task bodies',
      ]),
      {
        ralphAuthoringRules: '**Lightweight profile** (smaller model): 2-5 `Done when` bullets.',
      }
    );

    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.sizingProfile).toEqual({
      name: 'lightweight',
      minDoneWhen: 2,
      maxDoneWhen: 5,
      source: 'bp_lightweight',
    });
  });

  test('soft verb without verifier warns but does not reject', () => {
    const result = _validateTaskStructure(makeTaskBody([
      '    - ensure the validator reports violated rule names to the supervisor',
      '    - `npx jest tests/unit/javascript/mini-ralph-supervisor-compliance.test.js --runInBand` exits 0',
      '    - audit comments remain present in patched task bodies',
    ]));

    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([
      'soft_verb_without_verifier: - ensure the validator reports violated rule names to the supervisor',
    ]);
  });

  test('audit comment missing rejects the patch', () => {
    const result = _validateTaskStructure(makeTaskBody([
      '    - `npx jest tests/unit/javascript/mini-ralph-supervisor-compliance.test.js --runInBand` exits 0',
      '    - rejection reasons include rule names',
      '    - warnings remain non-blocking',
    ], { auditComment: false }));

    expect(result.ok).toBe(false);
    expect(result.errors).toContain(
      'audit_comment_missing: task body must include a `<!-- supervised-edit: ... -->` audit comment'
    );
  });
});
