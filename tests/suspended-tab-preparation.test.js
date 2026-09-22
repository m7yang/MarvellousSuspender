import assert from 'node:assert/strict';
import test from 'node:test';

globalThis.chrome = {
  extension: { inIncognitoContext: false },
  runtime: {
    id: 'test-extension-id',
    getURL: (path) => `chrome-extension://test-extension-id/${path}`,
    getManifest: () => ({ version: '0.0.0' }),
  },
  i18n: { getMessage: () => '' },
  tabs: {},
  windows: {},
};

const [
  { prepareSuspendedTab },
  { gsIndexedDb },
  { gsUtils },
] = await Promise.all([
  import('../src/js/fork/suspendedTabPreparation.js'),
  import('../src/js/gsIndexedDb.js'),
  import('../src/js/gsUtils.js'),
]);

test('preparing a generic Suspended Page persists its favicon source before navigation', async () => {
  const originalAddSuspendedTabInfo = gsIndexedDb.addSuspendedTabInfo;
  const persistedTabInfo = [];
  let finishPersistence;
  const persistence = new Promise((resolve) => {
    finishPersistence = resolve;
  });

  gsIndexedDb.addSuspendedTabInfo = async (tabInfo) => {
    persistedTabInfo.push(tabInfo);
    await persistence;
  };

  const tab = {
    favIconUrl: 'https://github.githubassets.com/favicons/favicon.svg',
    index: 4,
    pinned: true,
    title: 'Sonner',
    url: 'https://github.com/emilkowalski/sonner',
    windowId: 7,
  };

  try {
    let settled = false;
    const preparation = prepareSuspendedTab(tab, 12).then((url) => {
      settled = true;
      return url;
    });

    await Promise.resolve();
    assert.equal(settled, false);
    assert.equal(persistedTabInfo.length, 1);
    assert.deepEqual(
      { ...persistedTabInfo[0], date: undefined },
      {
        date: undefined,
        favIconUrl: tab.favIconUrl,
        index: 4,
        pinned: true,
        title: 'Sonner',
        url: tab.url,
        windowId: 7,
      },
    );
    assert.ok(persistedTabInfo[0].date instanceof Date);

    finishPersistence();
    const suspendedUrl = await preparation;

    assert.equal(gsUtils.getOriginalUrl(suspendedUrl), tab.url);
    assert.equal(gsUtils.getSuspendedFavIconUrl(suspendedUrl), '');
    assert.equal(gsUtils.getSuspendedScrollPosition(suspendedUrl), '12');
  }
  finally {
    gsIndexedDb.addSuspendedTabInfo = originalAddSuspendedTabInfo;
  }
});
