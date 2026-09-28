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

const [{ gsUtils }, { showCachedFavicon, isCachedFaviconPlaceholder }] = await Promise.all([
  import('../src/js/gsUtils.js'),
  import('../src/js/fork/suspendedPageFavicon.js'),
]);

const originalUrl = 'https://example.com/page?one=1&two=2';

function createSuspendedDocument(faviconHref) {
  const attributes = new Map([['href', faviconHref]]);
  const link = {
    setAttribute: (name, value) => attributes.set(name, value),
    getAttribute: (name) => attributes.get(name),
  };
  return {
    location: { href: gsUtils.generateSuspendedUrl(originalUrl, 'Example', 0) },
    getElementById: (id) => (id === 'gsFavicon' ? link : null),
    faviconHref: () => attributes.get('href'),
  };
}

test('showCachedFavicon points the tab icon at Chrome cache for the original page', () => {
  const doc = createSuspendedDocument('img/ic_suspendy_16x16.webp');

  showCachedFavicon(doc);

  const earlyIcon = new URL(doc.faviconHref());
  assert.equal(earlyIcon.protocol, 'chrome-extension:');
  assert.equal(earlyIcon.hostname, chrome.runtime.id);
  assert.equal(earlyIcon.pathname, '/_favicon/');
  assert.equal(earlyIcon.searchParams.get('pageUrl'), originalUrl);
  assert.equal(isCachedFaviconPlaceholder(doc.faviconHref()), true);
});

test('showCachedFavicon never replaces a processed favicon from initTab', () => {
  const processed = 'data:image/png;base64,FADED';
  const doc = createSuspendedDocument(processed);

  showCachedFavicon(doc);

  assert.equal(doc.faviconHref(), processed);
});

test('isCachedFaviconPlaceholder only matches the Chrome favicon cache URL', () => {
  assert.equal(isCachedFaviconPlaceholder(undefined), false);
  assert.equal(isCachedFaviconPlaceholder('not a url'), false);
  assert.equal(isCachedFaviconPlaceholder('data:image/png;base64,AAAA'), false);
  assert.equal(isCachedFaviconPlaceholder('chrome-extension://test-extension-id/img/ic_suspendy_16x16.webp'), false);
  assert.equal(isCachedFaviconPlaceholder('https://example.com/_favicon/'), false);
});
