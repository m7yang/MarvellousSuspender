import assert from 'node:assert/strict';
import { test } from 'node:test';
import { shouldSkipAutomaticSuspension } from '../src/js/fork/automaticSuspensionEligibility.js';

test('the fork protects popup windows during Automatic Suspension and leaves app windows to upstream', async () => {
  const cases = [
    ['undefined tab', undefined, 3, 'app', false, 0],
    ['null tab', null, 3, 'app', false, 0],
    ['missing window id', {}, 3, 'app', false, 0],
    ['non-numeric window id', { windowId: '42' }, 3, 'app', false, 0],
    ['missing force level', { windowId: 42 }, undefined, 'app', false, 0],
    ['force level 1', { windowId: 42 }, 1, 'app', false, 0],
    ['force level 2', { windowId: 42 }, 2, 'app', false, 0],
    ['app window', { windowId: 42 }, 3, 'app', false, 1],
    ['popup window', { windowId: 42 }, 3, 'popup', true, 1],
    ['normal window', { windowId: 42 }, 3, 'normal', false, 1],
    ['missing window', { windowId: 42 }, 3, null, false, 1],
  ];

  for (const [
    name,
    tab,
    forceLevel,
    windowType,
    expected,
    expectedLookupCount,
  ] of cases) {
    let lookupCount = 0;
    const getWindowById = async (windowId) => {
      lookupCount += 1;
      assert.equal(windowId, 42, name);
      return windowType ? { type: windowType } : null;
    };

    assert.equal(
      await shouldSkipAutomaticSuspension(tab, forceLevel, getWindowById),
      expected,
      name,
    );
    assert.equal(lookupCount, expectedLookupCount, name);
  }
});
