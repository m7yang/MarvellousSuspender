import  { gsUtils }               from '../gsUtils.js';
import  { tgs }                   from '../tgs.js';
import  { observeShortcutPresentation } from './shortcutPresentation.js';
import  { reloadSuspendedPage }   from './suspendedPageReload.js';
import  { showCachedFavicon }     from './suspendedPageFavicon.js';

(() => {

  const URL_INPUT_ID = 'gsTopBarUrl';
  const URL_SPINNER_ID = 'urlSpinner';
  const RELOAD_BUTTON_ID = 'reloadSuspendedPage';
  const HOTKEY_WRAPPER_ID = 'hotkeyWrapper';

  let currentTab;
  let urlInput;

  function showUrlSpinner() {
    document.body.classList.add('waking');
    document.getElementById(URL_SPINNER_ID)?.classList.add('loading');
  }

  function normalizeUrlInput(value) {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) {
      return trimmed;
    }
    return `https://${trimmed}`;
  }

  function stopWakeHandler(event) {
    event.stopImmediatePropagation();
  }

  function setUrlInputValue(url) {
    if (!urlInput || !url) {
      return;
    }
    urlInput.value = url;
    urlInput.defaultValue = url;
  }

  function observeUpstreamUrlUpdates() {
    const observer = new MutationObserver(() => {
      const url = urlInput.getAttribute('href');
      if (!url) {
        return;
      }
      setUrlInputValue(url);
      urlInput.removeAttribute('href');
      urlInput.replaceChildren();
    });
    observer.observe(urlInput, {
      attributes: true,
      attributeFilter: ['href'],
      childList: true,
    });
  }

  function buildUrlInput(urlAnchor) {
    const input = document.createElement('input');
    input.id = URL_INPUT_ID;
    input.className = `${urlAnchor.className} suspendedPageUrlInput`;
    input.type = 'text';
    input.spellcheck = false;
    input.autocomplete = 'off';
    input.setAttribute('aria-label', 'URL');

    const spinner = document.createElement('span');
    spinner.id = URL_SPINNER_ID;
    spinner.className = 'suspendedPageUrlSpinner';
    spinner.setAttribute('aria-hidden', 'true');

    const urlRow = urlAnchor.parentElement;
    urlRow.classList.add('suspendedPageUrlRow');
    urlRow.insertBefore(spinner, urlAnchor);
    urlAnchor.replaceWith(input);

    urlInput = input;
    setUrlInputValue(urlAnchor.getAttribute('href'));
    observeUpstreamUrlUpdates();

    input.addEventListener('mousedown', stopWakeHandler, true);
    input.addEventListener('click', stopWakeHandler, true);
    input.addEventListener('keydown', (event) => {
      stopWakeHandler(event);
      if (event.key === 'Enter') {
        event.preventDefault();
        const target = normalizeUrlInput(input.value);
        if (target) {
          showUrlSpinner();
          window.location.href = target;
        }
      }
      else if (event.key === 'Escape') {
        input.value = input.defaultValue;
        input.blur();
      }
    }, true);
  }

  function installUrlEditor() {
    if (urlInput) {
      return;
    }
    const urlAnchor = document.getElementById(URL_INPUT_ID);
    if (urlAnchor?.tagName !== 'A') {
      return;
    }
    buildUrlInput(urlAnchor);
    if (currentTab) {
      setUrlInputValue(gsUtils.getOriginalUrl(currentTab.url));
    }
  }

  function installUrlEditorWhenInitialised() {
    if (document.body.classList.contains('visible')) {
      installUrlEditor();
      return;
    }

    const observer = new MutationObserver(() => {
      if (!document.body.classList.contains('visible')) {
        return;
      }
      observer.disconnect();
      installUrlEditor();
    });
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['class'],
    });
  }

  async function resolveCurrentTab() {
    currentTab ??= await chrome.tabs.getCurrent();
    return currentTab;
  }

  function showReloadFailure(button, error) {
    gsUtils.error(
      'suspendedPageEnhancement',
      'Failed to preserve suspended state before reload',
      error,
    );
    button.classList.add('reloadFailed');
    button.title = 'Reload Suspended Page failed';
  }

  function injectReloadButton() {
    const button = document.createElement('button');
    button.id = RELOAD_BUTTON_ID;
    button.className = 'reloadSuspendedPageButton';
    button.type = 'button';
    button.textContent = '↻';
    button.title = 'Reload Suspended Page';
    button.setAttribute('aria-label', 'Reload Suspended Page');

    button.addEventListener('mousedown', stopWakeHandler, true);
    button.addEventListener('click', async (event) => {
      stopWakeHandler(event);
      button.disabled = true;
      button.classList.remove('reloadFailed');
      button.title = 'Reload Suspended Page';

      try {
        await reloadSuspendedPage({
          resolveTab: resolveCurrentTab,
          preserveSuspendedState: (tabId) => tgs.setTabStatePropForTabId(
            tabId,
            tgs.STATE_DISABLE_UNSUSPEND_ON_RELOAD,
            true,
          ),
          reload: () => window.location.reload(),
        });
      }
      catch (error) {
        button.disabled = false;
        showReloadFailure(button, error);
      }
    }, true);

    document.body.appendChild(button);
  }

  async function installShortcutPresentation() {
    const wrapper = document.getElementById(HOTKEY_WRAPPER_ID);
    if (!wrapper) {
      return;
    }

    const { os } = await chrome.runtime.getPlatformInfo();
    observeShortcutPresentation(wrapper, os);
  }

  function showSpinnerForWakeClick(event) {
    if (event.which !== 1 || event.target.closest('#setKeyboardShortcut')) {
      return;
    }
    if (event.target.closest('#suspendedMsg, #gsPreviewContainer, #tmsUpdateAvailable')) {
      showUrlSpinner();
    }
  }

  function showSpinnerForTopBarWake(event) {
    if (
      event.which !== 1 ||
      !event.target.closest('#gsTopBar') ||
      event.target.closest(`#${URL_INPUT_ID}, #gsTopBarTitle`)
    ) {
      return;
    }
    showUrlSpinner();
  }

  function trackInitialisedTab(request) {
    if (request?.action !== 'initTab' || !request.tab) {
      return;
    }
    currentTab = request.tab;
    setUrlInputValue(gsUtils.getOriginalUrl(request.tab.url));
  }

  function install() {
    showCachedFavicon(document);
    document.body.classList.add('suspendedPageEnhanced');
    injectReloadButton();
    installUrlEditorWhenInitialised();
    installShortcutPresentation().catch((error) => {
      gsUtils.warning(
        'suspendedPageEnhancement',
        'Unable to format the suspension shortcut',
        error,
      );
    });
    document.addEventListener('click', showSpinnerForWakeClick, true);
    document.addEventListener('mousedown', showSpinnerForTopBarWake, true);
    chrome.runtime.onMessage.addListener(trackInitialisedTab);
    resolveCurrentTab().catch((error) => {
      gsUtils.warning(
        'suspendedPageEnhancement',
        'Unable to resolve the current tab before initialisation',
        error,
      );
    });
  }

  install();

})();
