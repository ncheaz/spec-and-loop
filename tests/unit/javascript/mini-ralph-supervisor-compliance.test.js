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

  test('detectSizingProfile falls back to medium when lightweight markers are malformed', () => {
    expect(_detectSizingProfile([
      '**Lightweight profile**: keep tasks tiny but omit the bullet range.',
      '**Medium profile**: 4-6 `Done when` bullets.',
    ].join('\n'))).toEqual({
      name: 'medium',
      minDoneWhen: 4,
      maxDoneWhen: 6,
      source: 'bp_medium',
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

  test('explicit sizing profiles still reject bodies missing Done when and stop bullets', () => {
    const result = _validateTaskStructure(undefined, {
      sizingProfile: {
        name: 'custom',
        minDoneWhen: 1,
        maxDoneWhen: 2,
        source: 'test_override',
      },
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([
      'bold_title_missing: task body must start with a pending checkbox line containing a bold title',
      'scope_missing: task body must include a `Scope:` bullet',
      'change_missing: task body must include a `Change:` bullet',
      'done_when_missing: task body must include a `Done when:` bullet',
      'stop_and_hand_off_missing: task body must include a `Stop and hand off if:` bullet',
      'audit_comment_missing: task body must include a `<!-- supervised-edit: ... -->` audit comment',
    ]));
    expect(result.sizingProfile).toEqual({
      name: 'custom',
      minDoneWhen: 1,
      maxDoneWhen: 2,
      source: 'test_override',
    });
  });

  test('medium profile, missing canonical bullets, and verifier-tagged soft verbs cover remaining validator branches', () => {
    const mediumProfile = _validateTaskStructure(
      makeTaskBody([
        '    - ensure `npx jest tests/unit/javascript/mini-ralph-supervisor-compliance.test.js --runInBand` exits 0',
        '    - keep `tasks.md` structurally valid',
        '    - maintain audit comments',
      ]),
      {
        ralphAuthoringRules: '**Medium profile**: 4-6 `Done when` bullets.',
      }
    );

    expect(mediumProfile.ok).toBe(false);
    expect(mediumProfile.errors).toContain(
      'done_when_count_under_spec: expected 4-6 nested bullets under `Done when:`, found 3'
    );
    expect(mediumProfile.warnings).toEqual([
      'soft_verb_without_verifier: - maintain audit comments',
    ]);
    expect(mediumProfile.sizingProfile).toEqual({
      name: 'medium',
      minDoneWhen: 4,
      maxDoneWhen: 6,
      source: 'bp_medium',
    });

    const missingBullets = _validateTaskStructure([
      '- [ ] 4.5 **Implement Layer beta checks**',
      '  - Done when:',
      '    - `npx jest tests/unit/javascript/mini-ralph-supervisor-compliance.test.js --runInBand` exits 0',
      '    - validator surfaces canonical rule names',
      '    - warnings remain non-blocking',
      '  - Stop and hand off if:',
      'Plain text instead of nested stop bullets',
      '',
    ].join('\n'));

    expect(missingBullets.ok).toBe(false);
    expect(missingBullets.errors).toEqual(expect.arrayContaining([
      'scope_missing: task body must include a `Scope:` bullet',
      'change_missing: task body must include a `Change:` bullet',
      'stop_and_hand_off_subbullet_missing: `Stop and hand off if:` must include at least one nested sub-bullet',
      'audit_comment_missing: task body must include a `<!-- supervised-edit: ... -->` audit comment',
    ]));
  });
});
