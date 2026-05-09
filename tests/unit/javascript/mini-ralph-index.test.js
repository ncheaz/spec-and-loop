'use strict';

describe('lib/mini-ralph/index.js exports _supervisor namespace', () => {
  test('lib/mini-ralph/index.js exposes _supervisor namespace', () => {
    const miniRalph = require('../../../lib/mini-ralph');

    expect(miniRalph._supervisor).toBeDefined();
    expect(miniRalph._supervisor._loadRuleSources).toBeInstanceOf(Function);
    expect(miniRalph._supervisor._renderSupervisorPrompt).toBeInstanceOf(Function);
    expect(miniRalph._supervisor._validateTaskStructure).toBeInstanceOf(Function);
    expect(miniRalph._supervisor._applyTaskPatch).toBeInstanceOf(Function);
    expect(miniRalph._supervisor._recoverSupervisorTmpFiles).toBeInstanceOf(Function);
    expect(miniRalph._supervisor._normalizeInvestigationHints).toBeInstanceOf(Function);
    expect(miniRalph._supervisor._resolveRunLogPaths).toBeInstanceOf(Function);
    expect(miniRalph._supervisor._detectSupervisorLogReads).toBeInstanceOf(Function);
    expect(miniRalph._supervisor.runSupervisor).toBeInstanceOf(Function);
    expect(miniRalph._supervisor._parseSupervisorResponse).toBeInstanceOf(Function);
  });
});
