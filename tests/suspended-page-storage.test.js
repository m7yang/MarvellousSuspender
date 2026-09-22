import assert from 'node:assert/strict';
import test from 'node:test';

globalThis.chrome = {
  extension: { inIncognitoContext: false },
  i18n: {
    getMessage: () => '',
  },
  runtime: {
    getURL: (path = '') => `chrome-extension://test/${path}`,
    id: 'test',
    lastError: null,
  },
};

const { gsStorage } = await import('../src/js/gsStorage.js');

test('saveTabState exposes session persistence completion and failure', async () => {
  const originalSaveStorage = gsStorage.saveStorage;
  let completeSave;

  try {
    gsStorage.saveStorage = (store, key, state) => {
      assert.equal(store, 'session');
      assert.equal(key, 'gsTab42');
      assert.deepEqual(state, { keepSuspended: true });
      return new Promise((resolve) => {
        completeSave = resolve;
      });
    };

    let settled = false;
    const save = gsStorage
      .saveTabState(42, { keepSuspended: true })
      .then((value) => {
        settled = true;
        return value;
      });

    await Promise.resolve();
    assert.equal(settled, false);
    completeSave('persisted');
    assert.equal(await save, 'persisted');

    const persistenceFailure = new Error('session storage rejected');
    gsStorage.saveStorage = () => Promise.reject(persistenceFailure);
    await assert.rejects(
      gsStorage.saveTabState(42, { keepSuspended: true }),
      persistenceFailure,
    );
  }
  finally {
    gsStorage.saveStorage = originalSaveStorage;
  }
});
