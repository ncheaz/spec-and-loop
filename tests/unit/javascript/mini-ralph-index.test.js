'use strict';

describe('lib/mini-ralph/index.js exports _supervisor namespace', () => {
  test('lib/mini-ralph/index.js exposes _supervisor namespace', () => {
    const miniRalph = require('../../../lib/mini-ralph');

    expect(miniRalph._supervisor).toBeDefined();
    expect(miniRalph._supervisor._loadRuleSources).toBeInstanceOf(Function);
    expect(miniRalph._supervisor._renderSupervisorPrompt).toBeInstanceOf(Function);
    expect(miniRalph._supervisor._validateTaskStructure).toBeUndefined();
    expect(miniRalph._supervisor._applyTaskPatch).toBeUndefined();
    expect(miniRalph._supervisor._recoverSupervisorTmpFiles).toBeUndefined();
    expect(miniRalph._supervisor._normalizeInvestigationHints).toBeUndefined();
    expect(miniRalph._supervisor._resolveRunLogPaths).toBeUndefined();
    expect(miniRalph._supervisor._detectSupervisorLogReads).toBeUndefined();
    expect(miniRalph._supervisor.runSupervisor).toBeUndefined();
    expect(miniRalph._supervisor._parseSupervisorResponse).toBeInstanceOf(Function);
  });
});
