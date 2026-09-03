document.addEventListener('DOMContentLoaded', () => {
  // Theme Toggle
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

  // Mobile Hamburger Dropdown Menu Toggle
  const menuBtn = document.getElementById('mobile-menu-btn');
  const mobileNav = document.getElementById('main-nav');
  const menuBackdrop = document.getElementById('menu-backdrop');

  function toggleMenu() {
    const isOpen = mobileNav.classList.contains('open');
    if (isOpen) {
      mobileNav.classList.remove('open');
      if (menuBtn) menuBtn.setAttribute('aria-expanded', 'false');
      if (menuBackdrop) menuBackdrop.classList.remove('active');
      document.body.style.overflow = '';
    } else {
      mobileNav.classList.add('open');
      if (menuBtn) menuBtn.setAttribute('aria-expanded', 'true');
      if (menuBackdrop) menuBackdrop.classList.add('active');
      document.body.style.overflow = 'hidden';
    }
  }

  if (menuBtn) {
    menuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleMenu();
    });
  }

  if (menuBackdrop) {
    menuBackdrop.addEventListener('click', () => {
      if (mobileNav && mobileNav.classList.contains('open')) {
        toggleMenu();
      }
    });
  }

  // Close menu when clicking on any mobile nav link
  const navLinks = document.querySelectorAll('.main-nav-links a');
  navLinks.forEach(link => {
    link.addEventListener('click', () => {
      if (window.innerWidth <= 960 && mobileNav && mobileNav.classList.contains('open')) {
        toggleMenu();
      }
    });
  });

  // Cookie banner
  const banner = document.getElementById('cookie-banner');
  const accept = document.getElementById('accept-cookies');
  const reject = document.getElementById('reject-cookies');
  if (banner) {
    if (!localStorage.getItem('techpulse-cookie-consent')) { banner.classList.remove('hidden'); }
    if (accept) { accept.addEventListener('click', () => { localStorage.setItem('techpulse-cookie-consent', 'accepted'); banner.classList.add('hidden'); }); }
    if (reject) { reject.addEventListener('click', () => { localStorage.setItem('techpulse-cookie-consent', 'essential-only'); banner.classList.add('hidden'); }); }
  }

  // Reading progress
  const bar = document.getElementById('reading-progress');
  if (bar) {
    window.addEventListener('scroll', () => {
      const doc = document.documentElement.scrollHeight - document.documentElement.clientHeight;
      if (doc > 0) { bar.style.width = Math.min(100, Math.max(0, (window.scrollY / doc) * 100)) + '%'; }
    }, { passive: true });
  }

  // Contact form feedback
  const form = document.getElementById('contact-form');
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const fb = document.getElementById('form-feedback');
      if (fb) {
        fb.textContent = 'Thank you! Your message has been sent successfully. Our editorial team will review and reply within 24 to 48 hours.';
        fb.style.display = 'block';
        fb.style.color = '#10b981';
        fb.style.marginTop = '1rem';
        fb.style.padding = '0.75rem';
        fb.style.borderRadius = '6px';
        fb.style.backgroundColor = 'rgba(16, 185, 129, 0.1)';
        form.reset();
      }
    });
  }
});
