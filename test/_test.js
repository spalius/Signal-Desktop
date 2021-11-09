// Copyright 2014-2020 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

/* global chai, Whisper, _, Backbone */

mocha.setup('bdd');
window.assert = chai.assert;

const OriginalReporter = mocha._reporter;

const SauceReporter = function Constructor(runner) {
  const failedTests = [];

  runner.on('end', () => {
    window.mochaResults = runner.stats;
    window.mochaResults.reports = failedTests;
  });

  runner.on('fail', (test, err) => {
    const flattenTitles = item => {
      const titles = [];
      while (item.parent.title) {
        titles.push(item.parent.title);
        // eslint-disable-next-line no-param-reassign
        item = item.parent;
      }
      return titles.reverse();
    };
    failedTests.push({
      name: test.title,
      result: false,
      message: err.message,
      stack: err.stack,
      titles: flattenTitles(test),
    });
  });

  // eslint-disable-next-line no-new
  new OriginalReporter(runner);
};

SauceReporter.prototype = OriginalReporter.prototype;

mocha.reporter(SauceReporter);

// Override the database id.
window.Whisper = window.Whisper || {};
window.Whisper.Database = window.Whisper.Database || {};
Whisper.Database.id = 'test';

/*
 * global helpers for tests
 */

function deleteIndexedDB() {
  return new Promise((resolve, reject) => {
    const idbReq = indexedDB.deleteDatabase('test');
    idbReq.onsuccess = resolve;
    idbReq.error = reject;
  });
}

/* Delete the database before running any tests */
before(async () => {
  window.Signal.Util.MessageController.install();

  await deleteIndexedDB();
  try {
    window.SignalContext.log.info('Initializing SQL in renderer');
    const isTesting = true;
    await window.Signal.Data.startInRenderer(isTesting);
    window.SignalContext.log.info('SQL initialized in renderer');
  } catch (err) {
    window.SignalContext.log.error(
      'SQL failed to initialize',
      err && err.stack ? err.stack : err
    );
  }
  await window.Signal.Util.initializeMessageCounter();
  await window.Signal.Data.removeAll();
  await window.storage.fetch();
});

window.Whisper = window.Whisper || {};
window.Whisper.events = _.clone(Backbone.Events);
