import assert from 'node:assert/strict';
import test from 'node:test';
import { createChromeStub } from './setup/chrome-stub.js';

const chromeStub = createChromeStub();
globalThis.chrome = {
  ...chromeStub,
  extension: { ...chromeStub.extension, inIncognitoContext: false },
  runtime: {
    id: 'test-extension-id',
    getURL: (path) => new URL(path, 'chrome-extension://test-extension-id/').href,
    getManifest: () => ({ version: '0.0.0' }),
    onMessage: { addListener: () => {} },
  },
  i18n: { getMessage: () => '' },
  tabs: {},
  windows: {},
};

const [{ gsFavicon }, { gsIndexedDb }, { gsStorage }, { gsUtils }] =
  await Promise.all([
    import('../src/js/gsFavicon.js'),
    import('../src/js/gsIndexedDb.js'),
    import('../src/js/gsStorage.js'),
    import('../src/js/gsUtils.js'),
  ]);

test('the early tab icon uses Chrome cache while full favicon processing waits for initTab', async (t) => {
  const originalUrl = 'https://example.com/page?one=1&two=2';
  const url = gsUtils.generateSuspendedUrl(originalUrl, 'Example', 0);
  const elements = new Map();
  const document = {
    getElementById(id) {
      if (!elements.has(id)) {
        const attributes = new Map();
        elements.set(id, {
          setAttribute: (name, value) => attributes.set(name, value),
          getAttribute: (name) => attributes.get(name),
        });
      }
      return elements.get(id);
    },
  };
  const previousDocument = globalThis.document;
  const previousWindow = globalThis.window;
  const previousAddEventListener = globalThis.addEventListener;
  globalThis.document = document;
  globalThis.window = { document, location: { href: url } };
  globalThis.addEventListener = () => {};
  t.after(() => {
    globalThis.document = previousDocument;
    globalThis.window = previousWindow;
    globalThis.addEventListener = previousAddEventListener;
  });

  let onMessage;
  t.mock.method(chrome.runtime.onMessage, 'addListener', (listener) => {
    onMessage = listener;
  });
  t.mock.method(gsUtils, 'documentReadyAsPromised', async () => {});
  t.mock.method(gsUtils, 'documentReadyAndLocalisedAsPromised', () => new Promise(() => {}));
  t.mock.method(gsUtils, 'log', () => {});
  t.mock.method(gsStorage, 'getOption', async () => false);
  const readTabInfo = t.mock.method(gsIndexedDb, 'fetchTabInfo', async () => null);
  const readFaviconMeta = t.mock.method(gsIndexedDb, 'fetchFaviconMeta', async () => null);
  const faviconMeta = {
    normalisedDataUrl: 'data:image/png;base64,NORMAL',
    transparentDataUrl: 'data:image/png;base64,FADED',
  };
  let finishFavicon;
  const resolveFavicon = t.mock.method(gsFavicon, 'getFaviconMeta', () => new Promise((resolve) => {
    finishFavicon = () => resolve(faviconMeta);
  }));

  await import('../src/js/suspended.js');

  assert.equal(resolveFavicon.mock.callCount(), 0);
  assert.equal(readTabInfo.mock.callCount(), 0);
  assert.equal(readFaviconMeta.mock.callCount(), 0);
  const earlyIcon = new URL(document.getElementById('gsFavicon').getAttribute('href'));
  assert.equal(earlyIcon.protocol, 'chrome-extension:');
  assert.equal(earlyIcon.hostname, chrome.runtime.id);
  assert.equal(earlyIcon.pathname, '/_favicon/');
  assert.equal(earlyIcon.searchParams.get('pageUrl'), originalUrl);
  assert.equal(earlyIcon.searchParams.get('size'), '32');

  const tab = { id: 42, url };
  let responded = false;
  const response = new Promise((resolve) => {
    assert.equal(onMessage({ action: 'initTab', tab, sessionId: 'test', quickInit: true }, {}, () => {
      responded = true;
      resolve();
    }), true);
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(resolveFavicon.mock.callCount(), 1);
  assert.equal(resolveFavicon.mock.calls[0].arguments[0], tab);
  assert.equal(responded, false);
  finishFavicon();
  await response;

  assert.equal(document.getElementById('gsFavicon').getAttribute('href'), faviconMeta.transparentDataUrl);
  assert.equal(document.getElementById('gsTopBarImg').getAttribute('src'), faviconMeta.normalisedDataUrl);
  assert.equal(resolveFavicon.mock.callCount(), 1);
});
