'use strict';

const manifest = require('../../../package.json');

describe('package manifest', () => {
  test('publishes the internal mini-ralph runtime files', () => {
    expect(manifest.files).toEqual(
      expect.arrayContaining(['bin/', 'lib/', 'scripts/'])
    );
  });
});
