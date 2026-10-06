/**
 * GenAlpha Magazines - International Newsroom Interactive Controller
 */
document.addEventListener('DOMContentLoaded', () => {
  initLiveClock();
  initThemeToggle();
  initModals();
  initBreakingTicker();
  initSearch();
  initNewsletter();
  initReadingProgress();
  initShareButtons();
});

// 1. Live Local Clock
function initLiveClock() {
  const clockEl = document.getElementById('liveClock');
  if (!clockEl) return;
  const update = () => {
    const now = new Date();
    const options = { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' };
    clockEl.textContent = now.toLocaleDateString(document.documentElement.lang || 'en', options);
  };
  update();
  setInterval(update, 60000);
}

// 2. Light / Dark Theme Toggle
function initThemeToggle() {
  const toggleBtn = document.getElementById('themeToggleBtn');
  const storedTheme = localStorage.getItem('gam_theme') || 'light';
  document.documentElement.setAttribute('data-theme', storedTheme);

  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme') || 'light';
      const next = current === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('gam_theme', next);
      toggleBtn.setAttribute('aria-label', `Switch to ${current} mode`);
    });
  }
}

// 3. Modals (Language Picker, Search, Newsletter)
function initModals() {
  const openBtns = document.querySelectorAll('[data-open-modal]');
  const closeBtns = document.querySelectorAll('[data-close-modal]');

  openBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const targetId = btn.getAttribute('data-open-modal');
      const targetModal = document.getElementById(targetId);
      if (targetModal) {
        targetModal.classList.add('active');
        const input = targetModal.querySelector('input');
        if (input) input.focus();
      }
    });
  });

  closeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const modal = btn.closest('.newsroom-modal');
      if (modal) modal.classList.remove('active');
    });
  });

  window.addEventListener('click', (e) => {
    if (e.target.classList.contains('newsroom-modal')) {
      e.target.classList.remove('active');
    }
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.newsroom-modal.active').forEach(m => m.classList.remove('active'));
    }
  });
}

// 4. Breaking News Ticker
function initBreakingTicker() {
  const tickerWrap = document.querySelector('.breaking-banner');
  if (!tickerWrap) return;

  let isPaused = false;
  tickerWrap.addEventListener('mouseenter', () => isPaused = true);
  tickerWrap.addEventListener('mouseleave', () => isPaused = false);
}

// 5. Live Search Filter
function initSearch() {
  const searchInput = document.getElementById('liveSearchInput');
  const resultsContainer = document.getElementById('searchResultsContainer');
  if (!searchInput || !resultsContainer) return;

  let articlesCache = [];

  // Fetch articles index
  fetch('/data/articles.json')
    .then(res => res.json())
    .then(data => { articlesCache = data; })
    .catch(() => {});

  searchInput.addEventListener('input', () => {
    const query = searchInput.value.trim().toLowerCase();
    if (!query) {
      resultsContainer.innerHTML = '<p class="text-muted" style="padding:1rem 0;">Type at least 2 characters to search the newsroom archive...</p>';
      return;
    }

    const currentLang = document.documentElement.lang || 'en';
    const matches = articlesCache.filter(art => {
      const trans = art.translations[currentLang] || art.translations['en'] || {};
      const titleMatch = (trans.title || '').toLowerCase().includes(query);
      const deckMatch = (trans.deck || '').toLowerCase().includes(query);
      const tagMatch = (art.tags || []).some(t => t.toLowerCase().includes(query));
      return titleMatch || deckMatch || tagMatch;
    });

    if (matches.length === 0) {
      resultsContainer.innerHTML = '<p class="text-muted" style="padding:1rem 0;">No articles found matching "' + escapeHTML(query) + '".</p>';
      return;
    }

    let html = '<div style="display:flex;flex-direction:column;gap:0.75rem;margin-top:1rem;max-height:350px;overflow-y:auto;">';
    matches.forEach(m => {
      const trans = m.translations[currentLang] || m.translations['en'] || {};
      html += `
        <div style="border-bottom:1px solid var(--border-light);padding-bottom:0.75rem;">
          <a href="/articles/${m.slug}" style="color:var(--text-primary);font-family:var(--font-headline);font-weight:700;font-size:1.05rem;text-decoration:none;display:block;">
            ${escapeHTML(trans.title)}
          </a>
          <span style="font-size:0.75rem;color:var(--text-muted);text-transform:uppercase;font-weight:600;">
            ${escapeHTML(m.category_id)} · ${new Date(m.published_at).toLocaleDateString()}
          </span>
        </div>
      `;
    });
    html += '</div>';
    resultsContainer.innerHTML = html;
  });
}

// 6. Newsletter Subscription
function initNewsletter() {
  const forms = document.querySelectorAll('.newsletter-form');
  forms.forEach(form => {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const input = form.querySelector('input[type="email"]');
      if (!input || !input.value) return;
      
      const email = input.value.trim();
      let subscribers = JSON.parse(localStorage.getItem('gam_subscribers') || '[]');
      if (!subscribers.includes(email)) {
        subscribers.push(email);
        localStorage.setItem('gam_subscribers', JSON.stringify(subscribers));
      }

      const parent = form.parentElement;
      form.style.display = 'none';
      const msg = document.createElement('div');
      msg.style.cssText = 'color:#4ade80;font-weight:700;padding:1rem;background:rgba(255,255,255,0.1);border-radius:4px;margin-top:0.5rem;';
      msg.textContent = 'Thank you for subscribing. You will receive tomorrow’s morning briefing.';
      parent.appendChild(msg);
    });
  });
}

// 7. Reading Progress Bar
function initReadingProgress() {
  const article = document.querySelector('.article-body');
  if (!article) return;

  const bar = document.createElement('div');
  bar.style.cssText = 'position:fixed;top:0;left:0;height:3px;background:var(--brand-red);width:0%;z-index:999;transition:width 0.1s ease;';
  document.body.appendChild(bar);

  window.addEventListener('scroll', () => {
    const rect = article.getBoundingClientRect();
    const totalHeight = article.scrollHeight;
    const progress = Math.min(100, Math.max(0, ((-rect.top) / (totalHeight - window.innerHeight)) * 100));
    bar.style.width = `${progress}%`;
  });
}

// 8. Share Article Actions
function initShareButtons() {
  const copyBtns = document.querySelectorAll('[data-share-copy]');
  copyBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      navigator.clipboard.writeText(window.location.href).then(() => {
        const orig = btn.textContent;
        btn.textContent = 'Copied!';
        setTimeout(() => { btn.textContent = orig; }, 2000);
      });
    });
  });
}

function escapeHTML(str) {
  if (!str) return '';
  return str.replace(/[&<>'"]/g, 
    tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
  );
}
