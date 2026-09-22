import assert from 'node:assert/strict';
import test from 'node:test';

import { faviconResolutionRules } from '../src/js/fork/faviconResolutionRules.js';

async function loadGsUtils() {
  globalThis.chrome = {
    extension: { inIncognitoContext: false },
    runtime: {
      id: 'test-extension-id',
      getURL: (path) => `chrome-extension://test-extension-id/${path}`,
      getManifest: () => ({ version: '0.0.0' }),
    },
    i18n: { getMessage: () => '' },
  };
  return (await import('../src/js/gsUtils.js')).gsUtils;
}

test('Jira issue routes use issue identity instead of a shared tenant cache entry', () => {
  const pageUrl = 'https://team.atlassian.net/jira/software/c/projects/ABC/boards/7?selectedIssue=abc-42';

  assert.deepEqual(
    faviconResolutionRules.getCacheKey(pageUrl, 'team.atlassian.net/jira/software/c/projects/ABC/boards/7'),
    'team.atlassian.net/__atlassian_favicon__/issue/ABC-42',
  );
});

test('Jira issue identity is recognized in issueKey queries and path routes', () => {
  const cacheKey = (url) => faviconResolutionRules.getCacheKey(url, 'default-cache-key');

  assert.deepEqual(
    [
      cacheKey('https://team.atlassian.net/issues/?issueKey=ops-7'),
      cacheKey('https://team.atlassian.net/browse/mag-123'),
      cacheKey('https://team.atlassian.net/jira/software/c/projects/WEB/issues/web-9'),
    ],
    [
      'team.atlassian.net/__atlassian_favicon__/issue/OPS-7',
      'team.atlassian.net/__atlassian_favicon__/issue/MAG-123',
      'team.atlassian.net/__atlassian_favicon__/issue/WEB-9',
    ],
  );
});

test('generic Atlassian and Google Docs pages retain upstream full-path cache keys', () => {
  assert.deepEqual(
    [
      faviconResolutionRules.getCacheKey(
        'https://team.atlassian.net/wiki/spaces/ENG',
        'team.atlassian.net/wiki/spaces/ENG',
      ),
      faviconResolutionRules.getCacheKey(
        'https://docs.google.com/document/d/document-id/edit',
        'docs.google.com/document/d/document-id/edit',
      ),
      faviconResolutionRules.getCacheKey(
        'https://docs.google.com/spreadsheets/d/sheet-id/edit',
        'docs.google.com/spreadsheets/d/sheet-id/edit',
      ),
    ],
    [
      'team.atlassian.net/wiki/spaces/ENG',
      'docs.google.com/document/d/document-id/edit',
      'docs.google.com/spreadsheets/d/sheet-id/edit',
    ],
  );
});

test('Jira issues prefer an authoritative tab favicon before stored fallbacks', () => {
  assert.deepEqual(
    faviconResolutionRules.getResolutionPlan(
      'https://team.atlassian.net/browse/ABC-42',
      'https://team.atlassian.net/rest/api/2/universal_avatar/view/type/issuetype/avatar/10001',
    ),
    {
      preferSource: true,
      readStored: true,
      retryRoot: false,
    },
  );
});

test('cache-only resolution reads stored data without attempting any favicon source', () => {
  assert.deepEqual(
    faviconResolutionRules.getResolutionPlan(
      'https://team.atlassian.net/browse/ABC-42',
      'https://team.atlassian.net/rest/api/2/universal_avatar/view/type/issuetype/avatar/10001',
      { cacheOnly: true },
    ),
    {
      preferSource: false,
      readStored: true,
      retryRoot: false,
    },
  );
});

test('pages without an authoritative source avoid stale stored and Chrome fallbacks', () => {
  const plan = (url) => faviconResolutionRules.getResolutionPlan(url, '');

  assert.deepEqual(
    [
      plan('https://example.com/article'),
      plan('https://docs.google.com/document/d/document-id/edit'),
      plan('https://team.atlassian.net/browse/ABC-42'),
    ],
    [
      { preferSource: false, readStored: false, retryRoot: false },
      { preferSource: false, readStored: false, retryRoot: false },
      { preferSource: false, readStored: false, retryRoot: false },
    ],
  );
});

test('only YouTube watch pages retry favicon resolution at the root host', () => {
  const retryRoot = (url) => faviconResolutionRules.getResolutionPlan(url, '').retryRoot;

  assert.deepEqual(
    [
      retryRoot('https://www.youtube.com/watch?v=abc123'),
      retryRoot('https://www.youtube.com/@example'),
      retryRoot('https://youtube.com/watch?v=abc123'),
      retryRoot('https://example.com/watch?v=abc123'),
    ],
    [true, false, false, false],
  );
});

test('a root retry may read root caches but never recurses again', () => {
  assert.deepEqual(
    faviconResolutionRules.getResolutionPlan(
      'https://www.youtube.com/',
      '',
      { recursive: true },
    ),
    {
      preferSource: false,
      readStored: true,
      retryRoot: false,
    },
  );
});

test('only approved remote favicon sources require data URL normalization', () => {
  assert.deepEqual(
    [
      faviconResolutionRules.shouldNormalizeRemoteSource(
        'https://team.atlassian.net/rest/api/2/universal_avatar/view/type/issuetype/avatar/10001',
      ),
      faviconResolutionRules.shouldNormalizeRemoteSource(
        'https://www.google.com/s2/favicons?domain_url=team.atlassian.net',
      ),
      faviconResolutionRules.shouldNormalizeRemoteSource(
        'https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&url=https://team.atlassian.net',
      ),
      faviconResolutionRules.shouldNormalizeRemoteSource('https://example.com/favicon.ico'),
      faviconResolutionRules.shouldNormalizeRemoteSource('data:image/png;base64,AAAA'),
    ],
    [true, true, true, false, false],
  );
});

test('remote favicon sources are made canvas-loadable as data URLs', async () => {
  const originalFetch = globalThis.fetch;
  const originalFileReader = globalThis.FileReader;
  let fetchedUrl;
  let fetchOptions;
  globalThis.fetch = async (url, options) => {
    fetchedUrl = url;
    fetchOptions = options;
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
    const sourceUrl = 'https://team.atlassian.net/rest/api/2/universal_avatar/view/type/issuetype/avatar/10001';
    assert.equal(
      await faviconResolutionRules.getLoadableSource(sourceUrl),
      'data:image/png;base64,REMOTE',
    );
    assert.equal(fetchedUrl, sourceUrl);
    assert.ok(fetchOptions.signal instanceof AbortSignal);
  }
  finally {
    globalThis.fetch = originalFetch;
    globalThis.FileReader = originalFileReader;
  }
});

test('favicon transport embeds only approved sources for Atlassian pages', () => {
  const pageUrl = 'https://team.atlassian.net/browse/ABC-42';

  assert.deepEqual(
    [
      faviconResolutionRules.shouldEmbedSource(
        pageUrl,
        'https://team.atlassian.net/rest/api/2/universal_avatar/view/type/issuetype/avatar/10001',
      ),
      faviconResolutionRules.shouldEmbedSource(
        pageUrl,
        'https://www.google.com/s2/favicons?domain_url=team.atlassian.net',
      ),
      faviconResolutionRules.shouldEmbedSource(pageUrl, 'https://example.com/favicon.ico'),
      faviconResolutionRules.shouldEmbedSource(pageUrl, 'data:image/png;base64,AAAA'),
      faviconResolutionRules.shouldEmbedSource(
        'https://example.com/',
        'https://www.google.com/s2/favicons?domain_url=example.com',
      ),
    ],
    [true, true, false, false, false],
  );
});

test('suspended URL transport round-trips an approved favicon before the trailing raw URI', async () => {
  const gsUtils = await loadGsUtils();
  const pageUrl = 'https://team.atlassian.net/browse/ABC-42?focusedCommentId=100&src=tab';
  const sourceUrl = 'https://team.atlassian.net/rest/api/2/universal_avatar/view/type/issuetype/avatar/10001?size=small&x=1';

  const suspendedUrl = gsUtils.generateSuspendedUrl(pageUrl, 'Issue ABC-42', 17, sourceUrl);

  assert.equal(gsUtils.getSuspendedFavIconUrl(suspendedUrl), sourceUrl);
  assert.equal(gsUtils.getOriginalUrl(suspendedUrl), pageUrl);
  assert.ok(suspendedUrl.includes(`&favi=${encodeURIComponent(sourceUrl)}&uri=`));
  assert.ok(suspendedUrl.endsWith(`&uri=${pageUrl}`));
});

test('suspended URL transport omits unapproved favicon sources', async () => {
  const gsUtils = await loadGsUtils();
  const suspendedUrl = gsUtils.generateSuspendedUrl(
    'https://team.atlassian.net/browse/ABC-42',
    'Issue ABC-42',
    0,
    'https://example.com/favicon.ico',
  );

  assert.equal(gsUtils.getSuspendedFavIconUrl(suspendedUrl), '');
  assert.equal(suspendedUrl.includes('&favi='), false);
});
