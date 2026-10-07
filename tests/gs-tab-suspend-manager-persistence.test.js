import assert from 'node:assert/strict';
import test from 'node:test';
import { createChromeStub } from './setup/chrome-stub.js';

globalThis.chrome = createChromeStub();
await chrome.storage.local.set({
  gsSettings: {
    discardInPlaceOfSuspend: false,
  },
});
let tabUpdateCount = 0;

chrome.storage.session.set = async () => {
  throw new Error('session storage rejected');
};
chrome.tabs.update = (tabId, _properties, callback) => {
  tabUpdateCount += 1;
  callback({ id: tabId });
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
      chrome.runtime.getURL('suspended.html#uri=https://example.com/'),
    ),
    new Promise((resolve) => {
      setTimeout(() => resolve(didNotSettle), 25);
    }),
  ]);

  assert.equal(result, false);
  assert.equal(tabUpdateCount, 0);
});
