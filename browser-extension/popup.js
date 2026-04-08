let allItems = [];
let searchQuery = '';
let focusedIndex = -1;
let toastTimer = null;

const pinnedList = document.getElementById('pinnedList');
const historyList = document.getElementById('historyList');
const pinnedSection = document.getElementById('pinnedSection');
const historySection = document.getElementById('historySection');
const emptyState = document.getElementById('emptyState');
const noResults = document.getElementById('noResults');
const searchInput = document.getElementById('searchInput');
const searchClear = document.getElementById('searchClear');
const clearBtn = document.getElementById('clearBtn');
const toast = document.getElementById('toast');

function timeAgo(ts) {
  const diff = Date.now() - ts;
  const s = Math.floor(diff / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function maskText(text) {
  return '•'.repeat(Math.min(text.length, 12));
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function truncate(text, max = 80) {
  if (text.length <= max) return text;
  return text.slice(0, max) + '…';
}

function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 1800);
}

function buildItem(item, isPinned) {
  const el = document.createElement('div');
  el.className = 'clip-item' + (isPinned ? ' pinned-item' : '');
  el.dataset.id = item.id;
  el.tabIndex = 0;

  const displayText = item.sensitive ? maskText(item.text) : truncate(item.text);
  const isSensitive = item.sensitive;
  const codeClass = item.type === 'code' ? ' code-font' : '';
  const sensitiveClass = isSensitive ? ' sensitive' : '';

  el.innerHTML = `
    <div class="item-body">
      <div class="item-text${codeClass}${sensitiveClass}">
        ${isSensitive ? `<span class="lock-indicator">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
            <rect x="5" y="11" width="14" height="10" rx="2" ry="2"/>
            <path d="M8 11V7a4 4 0 0 1 8 0v4" fill="none" stroke="currentColor" stroke-width="2"/>
          </svg>
        </span>` : ''}${escapeHtml(displayText)}
      </div>
      <div class="item-meta">
        <span class="type-badge ${item.type}">${item.type}</span>
        <span class="item-time">${timeAgo(item.timestamp)}</span>
        ${item.copyCount > 1 ? `<span class="copy-count">
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
          </svg>
          ${item.copyCount}
        </span>` : ''}
      </div>
    </div>
    <div class="item-actions">
      <button class="action-btn pin-btn ${item.pinned ? 'active' : ''}" title="${item.pinned ? 'Unpin' : 'Pin'}">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="${item.pinned ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
          <circle cx="12" cy="10" r="3" fill="${item.pinned ? 'white' : 'none'}" stroke="${item.pinned ? 'none' : 'currentColor'}"/>
        </svg>
      </button>
      <button class="action-btn sensitive-btn ${item.sensitive ? 'active' : ''}" title="${item.sensitive ? 'Unmask' : 'Mask (sensitive)'}">
        ${item.sensitive ? `
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
            <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
            <line x1="1" y1="1" x2="23" y2="23"/>
          </svg>
        ` : `
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
            <circle cx="12" cy="12" r="3"/>
          </svg>
        `}
      </button>
      <button class="action-btn delete-btn" title="Remove">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>
  `;

  el.addEventListener('click', (e) => {
    if (e.target.closest('.action-btn')) return;
    copyItem(item);
  });

  el.querySelector('.pin-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    chrome.runtime.sendMessage({ type: 'TOGGLE_PIN', id: item.id }, () => {
      loadHistory();
    });
  });

  el.querySelector('.sensitive-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    chrome.runtime.sendMessage({ type: 'TOGGLE_SENSITIVE', id: item.id }, () => {
      loadHistory();
    });
  });

  el.querySelector('.delete-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    el.style.opacity = '0';
    el.style.transform = 'translateX(8px)';
    el.style.transition = 'opacity 0.15s, transform 0.15s';
    setTimeout(() => {
      chrome.runtime.sendMessage({ type: 'REMOVE_ENTRY', id: item.id }, () => {
        loadHistory();
      });
    }, 150);
  });

  return el;
}

function copyItem(item) {
  navigator.clipboard.writeText(item.text).then(() => {
    showToast('Copied!');
  }).catch(() => {
    showToast('Could not copy — try again');
  });
}

function filterItems(items, query) {
  if (!query) return items;
  const q = query.toLowerCase();
  return items.filter(i => i.text.toLowerCase().includes(q));
}

function render(items) {
  pinnedList.innerHTML = '';
  historyList.innerHTML = '';

  const pinned = items.filter(i => i.pinned);
  const nonPinned = items.filter(i => !i.pinned);
  const filtered = filterItems(nonPinned, searchQuery);
  const filteredPinned = filterItems(pinned, searchQuery);

  const hasAny = filteredPinned.length > 0 || filtered.length > 0;
  const hasHistory = items.length === 0;

  emptyState.classList.toggle('visible', hasHistory);
  noResults.classList.toggle('visible', !hasHistory && !hasAny && !!searchQuery);

  if (filteredPinned.length > 0) {
    pinnedSection.classList.add('visible');
    filteredPinned.forEach(item => pinnedList.appendChild(buildItem(item, true)));
  } else {
    pinnedSection.classList.remove('visible');
  }

  if (filtered.length > 0) {
    historySection.classList.add('visible');
    filtered.forEach(item => historyList.appendChild(buildItem(item, false)));
  } else {
    historySection.classList.remove('visible');
  }

  if (filteredPinned.length > 0 && filtered.length > 0) {
    const divider = document.createElement('div');
    divider.className = 'section-divider';
    pinnedSection.appendChild(divider);
  }
}

async function loadHistory() {
  chrome.runtime.sendMessage({ type: 'GET_HISTORY' }, (items) => {
    allItems = items || [];
    render(allItems);
  });
}

searchInput.addEventListener('input', (e) => {
  searchQuery = e.target.value;
  searchClear.classList.toggle('visible', !!searchQuery);
  render(allItems);
});

searchClear.addEventListener('click', () => {
  searchInput.value = '';
  searchQuery = '';
  searchClear.classList.remove('visible');
  render(allItems);
  searchInput.focus();
});

clearBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'CLEAR_NON_PINNED' }, () => {
    loadHistory();
    showToast('History cleared');
  });
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && searchQuery) {
    searchInput.value = '';
    searchQuery = '';
    searchClear.classList.remove('visible');
    render(allItems);
  }
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'CLIPBOARD_UPDATED') {
    loadHistory();
  }
});

loadHistory();
setInterval(loadHistory, 2000);
