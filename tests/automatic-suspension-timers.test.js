import assert from 'node:assert/strict';
import test from 'node:test';

const tabs = [
  { id: 11, windowId: 101, url: 'https://example.com/one' },
  { id: 12, windowId: 102, url: 'https://example.com/two' },
];
const createdAlarms = [];
let resolveTimersCreated;
let windowLookupCount = 0;

const timersCreated = new Promise((resolve) => {
  resolveTimersCreated = resolve;
});

globalThis.chrome = {
  extension: { inIncognitoContext: false },
  alarms: {
    clear: async () => true,
    getAll(callback) {
      callback([]);
    },
    create(name, details) {
      createdAlarms.push({ name, details });
      if (createdAlarms.length === tabs.length) {
        resolveTimersCreated();
      }
      return Promise.resolve();
    },
  },
  i18n: { getMessage: () => '' },
  runtime: {
    getManifest: () => ({ version: '0.0.0' }),
    getURL: (path = '') => `chrome-extension://test-extension-id/${path}`,
    id: 'test-extension-id',
    lastError: null,
  },
  tabs: {
    query(queryInfo, callback) {
      assert.deepEqual(queryInfo, {});
      callback(tabs);
    },
  },
  windows: {
    get(windowId, options, callback) {
      windowLookupCount += 1;
      callback({ id: windowId, type: 'normal' });
    },
  },
};

const [
  { tgs },
  { gsStorage },
  { gsUtils },
] = await Promise.all([
  import('../src/js/tgs.js'),
  import('../src/js/gsStorage.js'),
  import('../src/js/gsUtils.js'),
]);

test('bulk Automatic Suspension timer setup does not inspect every tab window', async () => {
  const originalGetOption = gsStorage.getOption;
  const originalGetStorageJSON = gsStorage.getStorageJSON;
  const originalIsNormalTab = gsUtils.isNormalTab;
  const originalIsProtectedActiveTab = gsUtils.isProtectedActiveTab;
  const originalLog = gsUtils.log;

  gsStorage.getOption = async (key) => {
    assert.equal(key, gsStorage.SUSPEND_TIME);
    return '60';
  };
  gsStorage.getStorageJSON = async () => undefined;
  gsUtils.isNormalTab = () => true;
  gsUtils.isProtectedActiveTab = async () => false;
  gsUtils.log = () => {};

  try {
    tgs.resetAutoSuspendTimerForAllTabs();
    await timersCreated;

    assert.equal(windowLookupCount, 0);
    assert.deepEqual(
      createdAlarms.map(({ name }) => name),
      ['11', '12'],
    );
  }
  finally {
    gsStorage.getOption = originalGetOption;
    gsStorage.getStorageJSON = originalGetStorageJSON;
    gsUtils.isNormalTab = originalIsNormalTab;
    gsUtils.isProtectedActiveTab = originalIsProtectedActiveTab;
    gsUtils.log = originalLog;
  }
});
