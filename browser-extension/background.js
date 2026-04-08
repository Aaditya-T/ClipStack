importScripts('storage.js');

// ─── Clipboard patcher ─────────────────────────────────────────────────────
// This function runs in the MAIN world of each page (bypasses page CSP).
// It patches navigator.clipboard.writeText so programmatic copies are captured,
// then communicates back to the content script via window.postMessage.
function clipboardPatcher() {
  if (window.__clipstackPatched) return;
  window.__clipstackPatched = true;
  try {
    const orig = navigator.clipboard.writeText.bind(navigator.clipboard);
    navigator.clipboard.writeText = function (text) {
      window.postMessage({ __clipstack__: true, text: String(text) }, '*');
      return orig(text);
    };
  } catch (e) {}
}

function injectPatcher(tabId) {
  chrome.scripting.executeScript({
    target: { tabId, allFrames: false },
    world: 'MAIN',
    func: clipboardPatcher,
  }).catch(() => {});
}

function isBrowserPage(url) {
  if (!url) return true;
  return (
    url.startsWith('chrome://') ||
    url.startsWith('chrome-extension://') ||
    url.startsWith('brave://') ||
    url.startsWith('about:') ||
    url.startsWith('edge://')
  );
}

// Inject into pages as they load
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && !isBrowserPage(tab.url)) {
    injectPatcher(tabId);
  }
});

// Also inject into the already-active tab when the extension starts up
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  if (tabs[0] && !isBrowserPage(tabs[0].url)) {
    injectPatcher(tabs[0].id);
  }
});

// ─── Message handling ──────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'GET_HISTORY') {
    getHistory().then(sendResponse);
    return true;
  }
  if (message.type === 'ADD_ENTRY') {
    addEntry(message.text).then((entry) => {
      sendResponse({ ok: true, entry });
      chrome.runtime.sendMessage({ type: 'CLIPBOARD_UPDATED' }).catch(() => {});
    });
    return true;
  }
  if (message.type === 'REMOVE_ENTRY') {
    removeEntry(message.id).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (message.type === 'TOGGLE_PIN') {
    togglePin(message.id).then(sendResponse);
    return true;
  }
  if (message.type === 'TOGGLE_SENSITIVE') {
    toggleSensitive(message.id).then(sendResponse);
    return true;
  }
  if (message.type === 'CLEAR_NON_PINNED') {
    clearNonPinned().then(() => sendResponse({ ok: true }));
    return true;
  }
});

// ─── Keyboard shortcut → toggle overlay ───────────────────────────────────
chrome.commands.onCommand.addListener((command) => {
  if (command === 'toggle-overlay') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0] && tabs[0].id) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'TOGGLE_OVERLAY' }).catch(() => {});
      }
    });
  }
});
