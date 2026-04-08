const STORAGE_KEY = 'clipstack_history';
const SETTINGS_KEY = 'clipstack_settings';
const MAX_HISTORY = 100;

function detectType(text) {
  if (/^https?:\/\/[^\s]+$/.test(text.trim())) return 'url';
  if (
    /^\s*(function|const|let|var|if|for|while|class|import|export|return|def |public |private |<\?php|\{|\[)/.test(text) ||
    text.includes('\n') && /[{};()=>]/.test(text)
  ) return 'code';
  return 'text';
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

async function getHistory() {
  return new Promise((resolve) => {
    chrome.storage.local.get([STORAGE_KEY], (result) => {
      resolve(result[STORAGE_KEY] || []);
    });
  });
}

async function saveHistory(items) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [STORAGE_KEY]: items }, resolve);
  });
}

async function addEntry(text) {
  if (!text || !text.trim()) return null;
  const items = await getHistory();

  const lastNonPinned = items.filter(i => !i.pinned)[0];
  if (lastNonPinned && lastNonPinned.text === text) {
    lastNonPinned.copyCount = (lastNonPinned.copyCount || 1) + 1;
    lastNonPinned.timestamp = Date.now();
    await saveHistory(items);
    return lastNonPinned;
  }

  const existing = items.find(i => i.text === text);
  if (existing) {
    existing.copyCount = (existing.copyCount || 1) + 1;
    existing.timestamp = Date.now();
    if (existing.pinned) {
      // Pinned items stay where they are — just update in place
      await saveHistory(items);
      return existing;
    }
    // Non-pinned: move to the top of the non-pinned section
    const idx = items.indexOf(existing);
    items.splice(idx, 1);
    const firstNonPinned = items.findIndex(i => !i.pinned);
    if (firstNonPinned === -1) {
      items.push(existing);
    } else {
      items.splice(firstNonPinned, 0, existing);
    }
    await saveHistory(items);
    return existing;
  }

  const newEntry = {
    id: generateId(),
    text,
    type: detectType(text),
    timestamp: Date.now(),
    pinned: false,
    sensitive: false,
    copyCount: 1,
  };

  const pinned = items.filter(i => i.pinned);
  let nonPinned = items.filter(i => !i.pinned);
  nonPinned.unshift(newEntry);
  if (nonPinned.length > MAX_HISTORY) {
    nonPinned = nonPinned.slice(0, MAX_HISTORY);
  }

  await saveHistory([...pinned, ...nonPinned]);
  return newEntry;
}

async function removeEntry(id) {
  const items = await getHistory();
  const filtered = items.filter(i => i.id !== id);
  await saveHistory(filtered);
}

async function togglePin(id) {
  const items = await getHistory();
  const item = items.find(i => i.id === id);
  if (!item) return;
  item.pinned = !item.pinned;
  const pinned = items.filter(i => i.pinned);
  let nonPinned = items.filter(i => !i.pinned);
  // Enforce cap after unpinning (item moved to non-pinned pool may push it over limit)
  if (nonPinned.length > MAX_HISTORY) {
    nonPinned = nonPinned.slice(0, MAX_HISTORY);
  }
  await saveHistory([...pinned, ...nonPinned]);
  return item;
}

async function toggleSensitive(id) {
  const items = await getHistory();
  const item = items.find(i => i.id === id);
  if (!item) return;
  item.sensitive = !item.sensitive;
  await saveHistory(items);
  return item;
}

async function clearNonPinned() {
  const items = await getHistory();
  const pinned = items.filter(i => i.pinned);
  await saveHistory(pinned);
}

async function getSettings() {
  return new Promise((resolve) => {
    chrome.storage.local.get([SETTINGS_KEY], (result) => {
      resolve(result[SETTINGS_KEY] || { maxHistory: MAX_HISTORY });
    });
  });
}
