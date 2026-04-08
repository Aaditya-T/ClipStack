importScripts('storage.js');

// Handle all storage operations via messages from popup and content scripts
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'GET_HISTORY') {
    getHistory().then(sendResponse);
    return true;
  }
  if (message.type === 'ADD_ENTRY') {
    addEntry(message.text).then((entry) => {
      sendResponse({ ok: true, entry });
      // Notify any open popup
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

// Handle the keyboard shortcut command to toggle the in-page overlay
chrome.commands.onCommand.addListener((command) => {
  if (command === 'toggle-overlay') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0] && tabs[0].id) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'TOGGLE_OVERLAY' }).catch(() => {});
      }
    });
  }
});
