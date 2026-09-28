// @ts-check
import  { gsFavicon }             from '../gsFavicon.js';
import  { gsUtils }               from '../gsUtils.js';

/**
 * Show Chrome's cached site icon before tgs.js's initTab message arrives. A
 * background tab Chrome freezes before that message lands would otherwise keep
 * the extension icon until focused. IndexedDB reads, fingerprinting and
 * faded-icon generation stay in suspended.js's initTab(), behind tgs.js's
 * concurrency limit, which later replaces this placeholder with a data: URL.
 *
 * @param {Document} doc
 */
export function showCachedFavicon(doc) {
  const link = doc.getElementById('gsFavicon');
  const originalUrl = gsUtils.getOriginalUrl(doc.location.href);
  if (!link || !originalUrl || link.getAttribute('href')?.startsWith('data:')) return;
  link.setAttribute('href', gsFavicon.getChromeFavIconUrl(originalUrl));
}

/**
 * True for the placeholder showCachedFavicon() sets, so favicon repair keeps
 * treating the tab as pending until initTab applies the processed icon.
 *
 * @param {string | undefined} url
 * @returns {boolean}
 */
export function isCachedFaviconPlaceholder(url) {
  if (!url) return false;
  try {
    const { protocol, pathname } = new URL(url);
    return protocol === 'chrome-extension:' && pathname === '/_favicon/';
  }
  catch {
    return false;
  }
}
