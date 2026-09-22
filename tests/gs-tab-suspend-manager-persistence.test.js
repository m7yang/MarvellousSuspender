import assert from 'node:assert/strict';
import test from 'node:test';

const localState = {
  gsSettings: {
    discardInPlaceOfSuspend: false,
  },
};
let tabUpdateCount = 0;

function pick(state, keys) {
  return Object.fromEntries(
    keys
      .filter((key) => Object.hasOwn(state, key))
      .map((key) => [key, state[key]]),
  );
}

globalThis.chrome = {
  extension: { inIncognitoContext: false },
  i18n: {
    getMessage: () => '',
  },
  runtime: {
    getManifest: () => ({ version: '0.0.0' }),
    getURL: (path = '') => `chrome-extension://test/${path}`,
    id: 'test',
    lastError: null,
  },
  storage: {
    onChanged: { addListener: () => {} },
    local: {
      get: async (keys, callback) => {
        const result = pick(localState, keys);
        callback?.(result);
        return result;
      },
      set: async (values) => Object.assign(localState, values),
    },
    session: {
      get: async () => ({}),
      set: async () => {
        throw new Error('session storage rejected');
      },
    },
  },
  tabs: {
    update: (_tabId, _properties, callback) => {
      tabUpdateCount += 1;
      callback({ id: _tabId });
    },
  },
  windows: {},
};

const { gsTabSuspendManager } = await import('../src/js/gsTabSuspendManager.js');

test('suspension settles false without navigating when session state cannot persist', async () => {
  const didNotSettle = Symbol('did not settle');
  const result = await Promise.race([
    gsTabSuspendManager.executeTabSuspension(
      {
        id: 42,
        title: 'Example',
        url: 'https://example.com/',
      },
      'chrome-extension://test/suspended.html#uri=https://example.com/',
    ),
    new Promise((resolve) => {
      setTimeout(() => resolve(didNotSettle), 25);
    }),
  ]);

  assert.equal(result, false);
  assert.equal(tabUpdateCount, 0);
});
