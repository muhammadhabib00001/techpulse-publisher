/**
 * GenAlphaMagazines - Theme & UI Handler
 * Fallback alias for main.js to maintain 100% backward compatibility
 */
document.addEventListener('DOMContentLoaded', () => {
  const t = document.getElementById('theme-toggle');
  const stored = localStorage.getItem('techpulse-theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  function sync(theme) {
    if (!t) return;
    const icon = t.querySelector('.theme-icon');
    const txt = t.querySelector('.theme-text');
    if (theme === 'dark') { if (icon) icon.textContent = '☀️'; if (txt) txt.textContent = 'Light'; }
    else { if (icon) icon.textContent = '🌙'; if (txt) txt.textContent = 'Dark'; }
  }
  document.documentElement.setAttribute('data-theme', stored);
  sync(stored);
  if (t) {
    t.addEventListener('click', () => {
      const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('techpulse-theme', next);
      sync(next);
    });
  }
});
