// Copyright 2020 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { assert } from 'chai';
import { useFakeTimers } from 'sinon';
import * as semver from 'semver';

import {
  generateAlphaVersion,
  isAlpha,
  isBeta,
  isProduction,
} from '../../util/version';

describe('version utilities', () => {
  describe('isProduction', () => {
    it('returns false for anything non-basic version number', () => {
      assert.isFalse(isProduction('1.2.3-1'));
      assert.isFalse(isProduction('1.2.3-alpha.1'));
      assert.isFalse(isProduction('1.2.3-beta.1'));
      assert.isFalse(isProduction('1.2.3-rc'));
    });

    it('returns true for production version strings', () => {
      assert.isTrue(isProduction('1.2.3'));
      assert.isTrue(isProduction('5.10.0'));
    });
  });

  describe('isBeta', () => {
    it('returns false for non-beta version strings', () => {
      assert.isFalse(isBeta('1.2.3'));
      assert.isFalse(isBeta('1.2.3-alpha'));
      assert.isFalse(isBeta('1.2.3-alpha.1'));
      assert.isFalse(isBeta('1.2.3-rc.1'));
    });

    it('returns true for beta version strings', () => {
      assert.isTrue(isBeta('1.2.3-beta'));
      assert.isTrue(isBeta('1.2.3-beta.1'));
    });
  });

  describe('isAlpha', () => {
    it('returns false for non-alpha version strings', () => {
      assert.isFalse(isAlpha('1.2.3'));
      assert.isFalse(isAlpha('1.2.3-beta'));
      assert.isFalse(isAlpha('1.2.3-beta.1'));
      assert.isFalse(isAlpha('1.2.3-rc.1'));
    });

    it('returns true for Alpha version strings', () => {
      assert.isTrue(isAlpha('1.2.3-alpha'));
      assert.isTrue(isAlpha('1.2.3-alpha.1'));
    });
  });

  describe('generateAlphaVersion', () => {
    beforeEach(function beforeEach() {
      // This isn't a hook.
      // eslint-disable-next-line react-hooks/rules-of-hooks
      this.clock = useFakeTimers();
    });

    afterEach(function afterEach() {
      this.clock.restore();
    });

    it('uses the current date and provided shortSha', function test() {
      this.clock.setSystemTime(new Date('2021-07-23T01:22:55.692Z').getTime());

      const currentVersion = '5.12.0-beta.1';
      const shortSha = '07f0efc45';

      const expected = '5.12.0-alpha.20210723.01-07f0efc45';
      const actual = generateAlphaVersion({ currentVersion, shortSha });

      assert.strictEqual(expected, actual);
    });

    it('same production version is semver.gt', function test() {
      const currentVersion = '5.12.0-beta.1';
      const shortSha = '07f0efc45';

      this.clock.setSystemTime(new Date('2021-07-23T01:22:55.692Z').getTime());
      const actual = generateAlphaVersion({ currentVersion, shortSha });

      assert.isTrue(semver.gt('5.12.0', actual));
    });

    it('same beta version is semver.gt', function test() {
      const currentVersion = '5.12.0-beta.1';
      const shortSha = '07f0efc45';

      this.clock.setSystemTime(new Date('2021-07-23T01:22:55.692Z').getTime());
      const actual = generateAlphaVersion({ currentVersion, shortSha });

      assert.isTrue(semver.gt(currentVersion, actual));
    });

    it('build earlier same day is semver.lt', function test() {
      const currentVersion = '5.12.0-beta.1';
      const shortSha = '07f0efc45';

      this.clock.setSystemTime(new Date('2021-07-23T00:22:55.692Z').getTime());
      const actualEarlier = generateAlphaVersion({ currentVersion, shortSha });

      this.clock.setSystemTime(new Date('2021-07-23T01:22:55.692Z').getTime());
      const actualLater = generateAlphaVersion({ currentVersion, shortSha });

      assert.isTrue(semver.lt(actualEarlier, actualLater));
    });

    it('build previous day is semver.lt', function test() {
      const currentVersion = '5.12.0-beta.1';
      const shortSha = '07f0efc45';

      this.clock.setSystemTime(new Date('2021-07-22T01:22:55.692Z').getTime());
      const actualEarlier = generateAlphaVersion({ currentVersion, shortSha });

      this.clock.setSystemTime(new Date('2021-07-23T01:22:55.692Z').getTime());
      const actualLater = generateAlphaVersion({ currentVersion, shortSha });

      assert.isTrue(semver.lt(actualEarlier, actualLater));
    });
  });
});
