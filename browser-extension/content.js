(function () {
  'use strict';

  if (window.__clipstackInjected) return;
  window.__clipstackInjected = true;

  // ─── Intercept programmatic clipboard.writeText() calls ─────────────────────
  // Inject into MAIN world so we can patch navigator.clipboard before page code runs
  function injectClipboardInterceptor() {
    const script = document.createElement('script');
    script.textContent = `(function() {
      try {
        const orig = navigator.clipboard.writeText.bind(navigator.clipboard);
        navigator.clipboard.writeText = function(text) {
          window.postMessage({ __clipstack__: true, text: String(text) }, '*');
          return orig(text);
        };
      } catch(e) {}
    })();`;
    (document.head || document.documentElement).appendChild(script);
    script.remove();
  }
  injectClipboardInterceptor();

  // Listen for messages from the injected page script
  window.addEventListener('message', (e) => {
    if (e.source !== window) return;
    if (e.data && e.data.__clipstack__ && typeof e.data.text === 'string' && e.data.text.trim()) {
      chrome.runtime.sendMessage({ type: 'ADD_ENTRY', text: e.data.text });
    }
  });

  // ─── Clipboard capture via copy event (Ctrl+C and right-click copy) ─────────
  document.addEventListener('copy', () => {
    // Slight delay so the clipboard is populated
    setTimeout(() => {
      navigator.clipboard.readText().then((text) => {
        if (text && text.trim()) {
          chrome.runtime.sendMessage({ type: 'ADD_ENTRY', text });
        }
      }).catch(() => {});
    }, 50);
  });

  // ─── Overlay state ──────────────────────────────────────────────────────────

  let overlayVisible = false;
  let overlayEl = null;
  let allItems = [];
  let searchQuery = '';
  let focusedIndex = -1;
  let visibleItems = [];
  let toastTimer = null;

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

  function truncate(text, max = 70) {
    if (text.length <= max) return text;
    return text.slice(0, max) + '…';
  }

  function showToast(msg) {
    if (!overlayEl) return;
    const t = overlayEl.querySelector('.cs-toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 1600);
  }

  function buildOverlay() {
    const overlay = document.createElement('div');
    overlay.id = 'clipstack-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-label', 'Clipboard History');
    overlay.innerHTML = `
      <div class="cs-backdrop"></div>
      <div class="cs-panel">
        <div class="cs-header">
          <div class="cs-logo">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="8" y="2" width="8" height="4" rx="1" fill="currentColor" opacity="0.8"/>
              <path d="M6 4H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-1" stroke="currentColor" stroke-width="1.5" fill="none"/>
              <line x1="9" y1="12" x2="15" y2="12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              <line x1="9" y1="16" x2="13" y2="16" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
            <span>Clipstack</span>
          </div>
          <div class="cs-hint">↑↓ navigate · Enter copy · Esc close</div>
          <button class="cs-close" aria-label="Close">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div class="cs-search-wrap">
          <svg class="cs-search-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input type="text" class="cs-search" placeholder="Search history…" autocomplete="off" />
          <button class="cs-search-clear">×</button>
        </div>
        <div class="cs-list-wrap">
          <div class="cs-list" id="cs-list"></div>
          <div class="cs-empty">
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" opacity="0.35">
              <rect x="8" y="2" width="8" height="4" rx="1"/>
              <path d="M6 4H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-1"/>
            </svg>
            <p>No items found</p>
          </div>
        </div>
        <div class="cs-toast"></div>
      </div>
    `;
    return overlay;
  }

  function buildItem(item, index) {
    const el = document.createElement('div');
    el.className = 'cs-item' + (item.pinned ? ' cs-pinned' : '');
    el.dataset.id = item.id;
    el.dataset.index = index;

    const displayText = item.sensitive ? maskText(item.text) : truncate(item.text);
    const isSensitive = item.sensitive;
    const codeClass = item.type === 'code' ? ' cs-code' : '';
    const sensitiveClass = isSensitive ? ' cs-sensitive' : '';

    el.innerHTML = `
      <div class="cs-item-body">
        <div class="cs-item-text${codeClass}${sensitiveClass}">
          ${isSensitive ? `<span class="cs-lock">
            <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor">
              <rect x="5" y="11" width="14" height="10" rx="2"/>
              <path d="M8 11V7a4 4 0 0 1 8 0v4" fill="none" stroke="currentColor" stroke-width="2"/>
            </svg>
          </span>` : ''}${escapeHtml(displayText)}
        </div>
        <div class="cs-item-meta">
          <span class="cs-badge cs-badge-${item.type}">${item.type}</span>
          <span class="cs-time">${timeAgo(item.timestamp)}</span>
          ${item.copyCount > 1 ? `<span class="cs-count">${item.copyCount}×</span>` : ''}
          ${item.pinned ? `<span class="cs-pin-tag">pinned</span>` : ''}
        </div>
      </div>
      <div class="cs-actions">
        <button class="cs-act cs-act-pin ${item.pinned ? 'active' : ''}" title="${item.pinned ? 'Unpin' : 'Pin'}">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" opacity="${item.pinned ? '1' : '0.45'}">
            <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z"/>
          </svg>
        </button>
        <button class="cs-act cs-act-eye ${item.sensitive ? 'active' : ''}" title="${item.sensitive ? 'Unmask' : 'Mask (sensitive)'}">
          ${item.sensitive ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
            <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
            <line x1="1" y1="1" x2="23" y2="23"/>
          </svg>` : `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
            <circle cx="12" cy="12" r="3"/>
          </svg>`}
        </button>
        <button class="cs-act cs-act-del" title="Remove">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
    `;

    el.addEventListener('click', (e) => {
      if (e.target.closest('.cs-act')) return;
      copyItem(item);
    });

    el.querySelector('.cs-act-pin').addEventListener('click', (e) => {
      e.stopPropagation();
      chrome.runtime.sendMessage({ type: 'TOGGLE_PIN', id: item.id }, () => loadItems());
    });

    el.querySelector('.cs-act-eye').addEventListener('click', (e) => {
      e.stopPropagation();
      chrome.runtime.sendMessage({ type: 'TOGGLE_SENSITIVE', id: item.id }, () => loadItems());
    });

    el.querySelector('.cs-act-del').addEventListener('click', (e) => {
      e.stopPropagation();
      chrome.runtime.sendMessage({ type: 'REMOVE_ENTRY', id: item.id }, () => loadItems());
    });

    return el;
  }

  function copyItem(item) {
    navigator.clipboard.writeText(item.text).then(() => {
      showToast('Copied!');
      setTimeout(() => hideOverlay(), 600);
    }).catch(() => {
      showToast('Could not copy — try again');
    });
  }

  function filterItems(items, query) {
    if (!query) return items;
    const q = query.toLowerCase();
    return items.filter(i => i.text.toLowerCase().includes(q));
  }

  function renderList() {
    if (!overlayEl) return;
    const list = overlayEl.querySelector('#cs-list');
    const emptyEl = overlayEl.querySelector('.cs-empty');
    list.innerHTML = '';

    const pinned = allItems.filter(i => i.pinned);
    const nonPinned = allItems.filter(i => !i.pinned);
    const combined = [...pinned, ...nonPinned];
    visibleItems = filterItems(combined, searchQuery);
    focusedIndex = -1;

    if (visibleItems.length === 0) {
      emptyEl.style.display = 'flex';
    } else {
      emptyEl.style.display = 'none';
      visibleItems.forEach((item, i) => {
        list.appendChild(buildItem(item, i));
      });
    }
  }

  function updateFocus() {
    if (!overlayEl) return;
    const items = overlayEl.querySelectorAll('.cs-item');
    items.forEach((el, i) => {
      el.classList.toggle('cs-focused', i === focusedIndex);
      if (i === focusedIndex) {
        el.scrollIntoView({ block: 'nearest' });
      }
    });
  }

  function loadItems() {
    chrome.runtime.sendMessage({ type: 'GET_HISTORY' }, (items) => {
      allItems = items || [];
      renderList();
    });
  }

  function showOverlay() {
    if (overlayVisible) return;
    overlayVisible = true;

    if (!overlayEl) {
      overlayEl = buildOverlay();
      document.body.appendChild(overlayEl);

      overlayEl.querySelector('.cs-backdrop').addEventListener('click', hideOverlay);
      overlayEl.querySelector('.cs-close').addEventListener('click', hideOverlay);

      const searchEl = overlayEl.querySelector('.cs-search');
      const searchClearEl = overlayEl.querySelector('.cs-search-clear');

      searchEl.addEventListener('input', (e) => {
        searchQuery = e.target.value;
        searchClearEl.style.display = searchQuery ? 'block' : 'none';
        renderList();
      });

      searchClearEl.addEventListener('click', () => {
        searchEl.value = '';
        searchQuery = '';
        searchClearEl.style.display = 'none';
        renderList();
        searchEl.focus();
      });

      overlayEl.addEventListener('keydown', handleKeydown);
    }

    overlayEl.style.display = 'flex';
    requestAnimationFrame(() => {
      overlayEl.classList.add('cs-visible');
    });

    loadItems();

    setTimeout(() => {
      const searchEl = overlayEl.querySelector('.cs-search');
      if (searchEl) searchEl.focus();
    }, 50);
  }

  function hideOverlay() {
    if (!overlayVisible) return;
    overlayVisible = false;
    if (overlayEl) {
      overlayEl.classList.remove('cs-visible');
      setTimeout(() => {
        if (overlayEl) overlayEl.style.display = 'none';
      }, 200);
    }
  }

  function handleKeydown(e) {
    if (!overlayVisible) return;

    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      hideOverlay();
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      focusedIndex = Math.min(focusedIndex + 1, visibleItems.length - 1);
      updateFocus();
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      focusedIndex = Math.max(focusedIndex - 1, 0);
      updateFocus();
      return;
    }

    if (e.key === 'Enter' && focusedIndex >= 0) {
      e.preventDefault();
      const item = visibleItems[focusedIndex];
      if (item) copyItem(item);
      return;
    }
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overlayVisible) {
      e.preventDefault();
      hideOverlay();
    }
  }, true);

  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'TOGGLE_OVERLAY') {
      if (overlayVisible) {
        hideOverlay();
      } else {
        showOverlay();
      }
    }
    if (message.type === 'CLIPBOARD_UPDATED' && overlayVisible) {
      loadItems();
    }
  });
})();
