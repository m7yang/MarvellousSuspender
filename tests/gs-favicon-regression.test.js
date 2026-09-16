import assert from 'node:assert/strict';
import test from 'node:test';

globalThis.chrome = {
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
  { gsFavicon },
  { gsIndexedDb },
  { gsStorage },
  { gsUtils },
] = await Promise.all([
  import('../src/js/gsFavicon.js'),
  import('../src/js/gsIndexedDb.js'),
  import('../src/js/gsStorage.js'),
  import('../src/js/gsUtils.js'),
]);

const originalUrl = 'https://github.com/emilkowalski/sonner';
const savedFavIconUrl = 'https://github.githubassets.com/favicons/favicon.svg';
const suspendedUrl =
  'chrome-extension://test-extension-id/suspended.html' +
  '#ttl=sonner&pos=0&uri=https://github.com/emilkowalski/sonner';
const cachedFaviconMeta = {
  v: 2,
  favIconUrl: savedFavIconUrl,
  isDark: false,
  normalisedDataUrl: 'data:image/png;base64,NORMAL',
  transparentDataUrl: 'data:image/png;base64,TRANSPARENT',
};
const chromeStyleFallbackDataUrl =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAABJUlEQVR42mKgOogpKJBMTM08kJCS+RXAJ1UbVBRDUWQIRmACWmwEpHxuN8GpkRIdAOuRfehwnQDXe7696C+eJkdvoox+ceEd/7DWFZyUcinO6JNBf3FOP/z+HGXirkX0hzXs8YJbG78ZvHp2dtaP/3E+Owqwcv1aJLDGSl8Ap6kY7JDmcjfK6UklaDvR4iBfy/Zq+19cyCETqF7AdAiilF6RGbYV0hFWOm9dbyYBiu0QIBcK85XLm090guoDGI3AUPiOM3HJrtbhKs8XBvh7k4mO+DkNMWC0CL6saS5D1Q0IERcRrBKdVy729Ti0apaojlEFHvI1k+Q03t6HESOeMUbjILUJCpo0bK8C7DxI9ezFMtibDuiLQY8oDJn/h5yUKctM1AYAkF4mBkXjJukAAAAASUVORK5CYII=';

function installFaviconDom() {
  const previousImage = globalThis.Image;
  const previousDocument = globalThis.document;
  const opaqueImageData = new Uint8ClampedArray(16 * 16 * 4);
  for (let index = 3; index < opaqueImageData.length; index += 4) {
    opaqueImageData[index] = 255;
  }

  globalThis.Image = class {
    width = 16;
    height = 16;

    set src(value) {
      this.currentSrc = value;
      queueMicrotask(() => this.onload());
    }
  };
  globalThis.document = {
    createElement: () => ({
      getContext: () => ({
        drawImage: () => {},
        getImageData: () => ({ data: opaqueImageData.slice() }),
        putImageData: () => {},
      }),
      toDataURL: () => 'data:image/png;base64,FINGERPRINT',
    }),
  };

  return () => {
    globalThis.Image = previousImage;
    globalThis.document = previousDocument;
  };
}

test('generic Suspended Pages recover saved favicon sources without weakening source-less fallback', async () => {
  const restoreDom = installFaviconDom();
  const originalMethods = {
    fetchFaviconMeta: gsIndexedDb.fetchFaviconMeta,
    fetchTabInfo: gsIndexedDb.fetchTabInfo,
    getNewURL: gsUtils.getNewURL,
    getOriginalUrl: gsUtils.getOriginalUrl,
    getRootUrl: gsUtils.getRootUrl,
    getRootUrlNew: gsUtils.getRootUrlNew,
    getStorageJSON: gsStorage.getStorageJSON,
    getSuspendedFavIconUrl: gsUtils.getSuspendedFavIconUrl,
    isFileTab: gsUtils.isFileTab,
    isSuspendedTab: gsUtils.isSuspendedTab,
    log: gsUtils.log,
  };

  let savedTabInfo = { favIconUrl: savedFavIconUrl };
  let fetchTabInfoCalls = 0;
  let fetchFaviconMetaCalls = 0;

  gsIndexedDb.fetchTabInfo = async () => {
    fetchTabInfoCalls += 1;
    return savedTabInfo;
  };
  gsIndexedDb.fetchFaviconMeta = async () => {
    fetchFaviconMetaCalls += 1;
    return cachedFaviconMeta;
  };
  gsStorage.getStorageJSON = async () => ({
    default: 'data:image/png;base64,DEFAULT_FINGERPRINT',
  });
  gsUtils.getNewURL = (url) => new URL(url);
  gsUtils.getOriginalUrl = () => originalUrl;
  gsUtils.getRootUrl = () => 'github.com/emilkowalski/sonner';
  gsUtils.getRootUrlNew = () => 'https://github.com/';
  gsUtils.getSuspendedFavIconUrl = () => '';
  gsUtils.isFileTab = () => false;
  gsUtils.isSuspendedTab = () => true;
  gsUtils.log = () => {};

  try {
    const recoveredMeta = await gsFavicon.getFaviconMeta({ url: suspendedUrl });

    assert.equal(fetchTabInfoCalls, 1);
    assert.equal(fetchFaviconMetaCalls, 1);
    assert.equal(recoveredMeta.favIconUrl, savedFavIconUrl);

    savedTabInfo = null;
    fetchTabInfoCalls = 0;
    fetchFaviconMetaCalls = 0;

    const fallbackMeta = await gsFavicon.getFaviconMeta({ url: suspendedUrl });

    assert.equal(fetchTabInfoCalls, 1);
    assert.equal(fetchFaviconMetaCalls, 0);
    assert.equal(fallbackMeta.normalisedDataUrl, chromeStyleFallbackDataUrl);
    assert.equal(fallbackMeta.transparentDataUrl, chromeStyleFallbackDataUrl);
  }
  finally {
    restoreDom();
    gsIndexedDb.fetchFaviconMeta = originalMethods.fetchFaviconMeta;
    gsIndexedDb.fetchTabInfo = originalMethods.fetchTabInfo;
    gsStorage.getStorageJSON = originalMethods.getStorageJSON;
    gsUtils.getNewURL = originalMethods.getNewURL;
    gsUtils.getOriginalUrl = originalMethods.getOriginalUrl;
    gsUtils.getRootUrl = originalMethods.getRootUrl;
    gsUtils.getRootUrlNew = originalMethods.getRootUrlNew;
    gsUtils.getSuspendedFavIconUrl = originalMethods.getSuspendedFavIconUrl;
    gsUtils.isFileTab = originalMethods.isFileTab;
    gsUtils.isSuspendedTab = originalMethods.isSuspendedTab;
    gsUtils.log = originalMethods.log;
  }
});

test('Jira refreshes a cached favicon only when its source URL changes', async () => {
  const restoreDom = installFaviconDom();
  const originalFetch = globalThis.fetch;
  const originalFileReader = globalThis.FileReader;
  const originalMethods = {
    addFaviconMeta: gsIndexedDb.addFaviconMeta,
    fetchFaviconMeta: gsIndexedDb.fetchFaviconMeta,
    getOption: gsStorage.getOption,
    getStorageJSON: gsStorage.getStorageJSON,
    log: gsUtils.log,
  };

  const jiraUrl = 'https://team.atlassian.net/browse/ABC-42';
  const cachedSourceUrl =
    'https://team.atlassian.net/rest/api/2/universal_avatar/view/type/issuetype/avatar/10001';
  const changedSourceUrl =
    'https://team.atlassian.net/rest/api/2/universal_avatar/view/type/issuetype/avatar/10002';
  const cachedMeta = {
    v: 2,
    favIconUrl: cachedSourceUrl,
    isDark: false,
    normalisedDataUrl: 'data:image/png;base64,CACHED_NORMAL',
    transparentDataUrl: 'data:image/png;base64,CACHED_TRANSPARENT',
  };
  const fetchedUrls = [];

  gsIndexedDb.fetchFaviconMeta = async () => cachedMeta;
  gsIndexedDb.addFaviconMeta = async () => {};
  gsStorage.getOption = async () => false;
  gsStorage.getStorageJSON = async () => ({
    default: 'data:image/png;base64,DEFAULT_FINGERPRINT',
  });
  gsUtils.log = () => {};
  globalThis.fetch = async (url) => {
    fetchedUrls.push(url);
    return {
      ok: true,
      blob: async () => ({ type: 'image/png' }),
    };
  };
  globalThis.FileReader = class {
    readAsDataURL() {
      this.result = 'data:image/png;base64,REMOTE';
      queueMicrotask(() => this.onloadend());
    }
  };

  try {
    const cachedResult = await gsFavicon.getFaviconMeta({
      url: jiraUrl,
      favIconUrl: cachedSourceUrl,
    });
    const refreshedResult = await gsFavicon.getFaviconMeta({
      url: jiraUrl,
      favIconUrl: changedSourceUrl,
    });

    assert.deepEqual(
      {
        cachedNormalisedDataUrl: cachedResult.normalisedDataUrl,
        refreshedSourceUrl: refreshedResult.favIconUrl,
        fetchedUrls,
      },
      {
        cachedNormalisedDataUrl: cachedMeta.normalisedDataUrl,
        refreshedSourceUrl: changedSourceUrl,
        fetchedUrls: [changedSourceUrl],
      },
    );
  }
  finally {
    restoreDom();
    globalThis.fetch = originalFetch;
    globalThis.FileReader = originalFileReader;
    gsIndexedDb.addFaviconMeta = originalMethods.addFaviconMeta;
    gsIndexedDb.fetchFaviconMeta = originalMethods.fetchFaviconMeta;
    gsStorage.getOption = originalMethods.getOption;
    gsStorage.getStorageJSON = originalMethods.getStorageJSON;
    gsUtils.log = originalMethods.log;
  }
});

test('successful favicon generation clears its pending image timeout', async () => {
  const restoreDom = installFaviconDom();
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  const timeoutHandle = { id: 'favicon-load-timeout' };
  let clearedTimeout;

  globalThis.setTimeout = (callback, delay) => {
    assert.equal(typeof callback, 'function');
    assert.equal(delay, 5000);
    return timeoutHandle;
  };
  globalThis.clearTimeout = (handle) => {
    clearedTimeout = handle;
  };

  try {
    await gsFavicon.buildFaviconMeta('data:image/png;base64,SOURCE');
    assert.equal(clearedTimeout, timeoutHandle);
  }
  finally {
    restoreDom();
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
  }
});
