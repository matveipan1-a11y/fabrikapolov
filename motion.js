// Анимации интерфейса не меняют данные заказа и отключаются при снижении движения.
(() => {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const main = document.querySelector('#main');
  const sheet = document.querySelector('#sheet');
  const layer = document.querySelector('#sheet-layer');
  const tabbar = document.querySelector('#tabbar');
  const tabItems = document.querySelector('#tab-items');
  const dockLens = tabbar.querySelector('.dock-lens');
  const atmosphere = document.querySelector('.liquid-atmosphere');
  let previousPage = document.querySelector('.tab.active')?.dataset.page;
  let firstContent = main.firstElementChild;
  const revealObserver = !reduced.matches && 'IntersectionObserver' in window
    ? new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('in-view');
            revealObserver.unobserve(entry.target);
          }
        });
      }, { rootMargin: '0px 0px -24px 0px', threshold: 0.08 })
    : null;

  function reveal(element) {
    if (!revealObserver || element.dataset.motionObserved) return;
    element.dataset.motionObserved = '1';
    revealObserver.observe(element);
  }

  function decorateHero() {
    const carousel = main.querySelector('.hero-scroll');
    if (!carousel || carousel.nextElementSibling?.classList.contains('hero-pagination')) return;
    const heroes = [...carousel.querySelectorAll('.hero')];
    heroes.forEach(hero => {
      const glint = document.createElement('span');
      glint.className = 'hero-glint';
      glint.setAttribute('aria-hidden', 'true');
      hero.append(glint);
    });
    const pagination = document.createElement('div');
    pagination.className = 'hero-pagination';
    pagination.setAttribute('aria-label', 'Баннеры');
    const dots = heroes.map((_, index) => {
      const dot = document.createElement('button');
      dot.className = 'hero-dot';
      dot.type = 'button';
      dot.setAttribute('aria-label', `Баннер ${index + 1}`);
      dot.addEventListener('click', () => {
        carousel.scrollTo({ left: heroes[index].offsetLeft - heroes[0].offsetLeft, behavior: reduced.matches ? 'auto' : 'smooth' });
      });
      pagination.append(dot);
      return dot;
    });
    const update = () => {
      const index = Math.max(0, Math.min(dots.length - 1, Math.round(carousel.scrollLeft / (heroes[0].getBoundingClientRect().width + 12))));
      dots.forEach((dot, i) => {
        dot.classList.toggle('active', i === index);
        dot.setAttribute('aria-current', i === index ? 'true' : 'false');
      });
    };
    carousel.addEventListener('scroll', update, { passive: true });
    carousel.after(pagination);
    update();
  }

  function celebrate() {
    const success = main.querySelector('.success');
    if (!success || success.querySelector('.success-confetti') || reduced.matches) return;
    const confetti = document.createElement('div');
    confetti.className = 'success-confetti';
    confetti.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < 18; i++) {
      const particle = document.createElement('span');
      particle.style.setProperty('--x', `${8 + (i * 47 % 84)}%`);
      particle.style.setProperty('--drift', `${i % 2 ? -35 - i * 2 : 35 + i * 2}px`);
      particle.style.setProperty('--spin', `${i % 2 ? -540 : 540}deg`);
      particle.style.setProperty('--delay', `${(i % 6) * 55}ms`);
      particle.style.setProperty('--color', ['#d4a574', '#f5e6d3', '#b8860b', '#ffffff'][i % 4]);
      confetti.append(particle);
    }
    success.prepend(confetti);
  }

  function decorate() {
    main.querySelectorAll('.product-grid').forEach(grid => {
      grid.querySelectorAll('.product-card').forEach((card, index) => {
        card.style.setProperty('--stagger', String(Math.min(index, 9)));
        reveal(card);
      });
    });
    main.querySelectorAll('.section-head,.category').forEach((element, index) => {
      element.style.setProperty('--stagger', String(Math.min(index, 6)));
      reveal(element);
    });
    decorateHero();
    celebrate();
  }
  if (revealObserver) document.documentElement.classList.add('motion-ready');
  decorate();

  // При смене раздела содержимое мягко появляется из глубины.
  new MutationObserver(() => {
    if (main.firstElementChild === firstContent) return;
    firstContent = main.firstElementChild;
    decorate();
    if (reduced.matches || document.activeElement?.id === 'catalog-search') return;
    main.animate([
      { opacity: 0.35, transform: 'translateY(12px) scale(.99)', filter: 'blur(5px)' },
      { opacity: 1, transform: 'translateY(0) scale(1)', filter: 'blur(0)' }
    ], { duration: 360, easing: 'cubic-bezier(.2,.8,.2,1)' });
  }).observe(main, { childList: true });

  // Подсветка карточек следует за курсором на устройствах с мышью.
  main.addEventListener('pointermove', event => {
    if (reduced.matches) return;
    const element = event.target.closest('.product-card,.hero');
    if (!element) return;
    const rect = element.getBoundingClientRect();
    const x = `${((event.clientX - rect.left) / rect.width) * 100}%`;
    const y = `${((event.clientY - rect.top) / rect.height) * 100}%`;
    element.style.setProperty(element.classList.contains('hero') ? '--glow-x' : '--spot-x', x);
    element.style.setProperty(element.classList.contains('hero') ? '--glow-y' : '--spot-y', y);
  }, { passive: true });

  // Стеклянная линза скользит между вкладками, не исчезая при смене экрана.
  function syncDock(initial = false) {
    const tab = document.querySelector('.tab.active');
    if (!tab) return;
    if (initial) dockLens.style.transition = 'none';
    dockLens.style.left = `${5 + tab.offsetLeft}px`;
    dockLens.style.width = `${tab.offsetWidth}px`;
    if (initial) requestAnimationFrame(() => { dockLens.style.transition = ''; });
    if (tab.dataset.page === previousPage) return;
    previousPage = tab.dataset.page;
    tabbar.style.setProperty('--nav-x', `${tab.offsetLeft + tab.offsetWidth / 2}px`);
    if (!reduced.matches) tab.querySelector('.icon')?.animate([
      { transform: 'translateY(5px) scale(.75)' },
      { transform: 'translateY(-6px) scale(1.2)' },
      { transform: 'translateY(-3px) scale(1.13)' }
    ], { duration: 430, easing: 'cubic-bezier(.22,1.32,.36,1)' });
  }
  new MutationObserver(() => syncDock()).observe(tabItems, { childList: true });
  window.addEventListener('resize', () => syncDock(), { passive: true });
  syncDock(true);
  const firstTab = tabbar.querySelector('.tab.active');
  if (firstTab) tabbar.style.setProperty('--nav-x', `${firstTab.offsetLeft + firstTab.offsetWidth / 2}px`);

  // Большая световая область плавно следует за пальцем или курсором.
  let pointerFrame = 0;
  window.addEventListener('pointermove', event => {
    if (reduced.matches || pointerFrame) return;
    const x = event.clientX, y = event.clientY;
    pointerFrame = requestAnimationFrame(() => {
      atmosphere.style.setProperty('--pointer-x', `${x / innerWidth * 100}%`);
      atmosphere.style.setProperty('--pointer-y', `${y / innerHeight * 100}%`);
      pointerFrame = 0;
    });
  }, { passive: true });

  // Сердце и добавление в корзину откликаются короткими частицами света.
  document.addEventListener('click', event => {
    if (reduced.matches) return;
    const target = event.target.closest('[data-favorite],[data-add]');
    if (!target) return;
    const rect = target.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    for (let i = 0; i < 8; i++) {
      const spark = document.createElement('span');
      const angle = (i / 8) * Math.PI * 2;
      spark.className = 'liquid-spark';
      spark.style.left = `${x}px`;
      spark.style.top = `${y}px`;
      spark.style.setProperty('--dx', `${Math.cos(angle) * (30 + i % 3 * 9)}px`);
      spark.style.setProperty('--dy', `${Math.sin(angle) * (30 + i % 3 * 9)}px`);
      spark.style.setProperty('--spark-color', i % 2 ? '#f5e6d3' : '#d4a574');
      document.body.append(spark);
      setTimeout(() => spark.remove(), 700);
    }
  }, { capture: true });

  // Тонкая линия показывает положение на длинной странице.
  const progress = document.createElement('div');
  progress.className = 'glass-scroll-progress';
  progress.setAttribute('aria-hidden', 'true');
  document.body.append(progress);
  let scrollScheduled = false;
  window.addEventListener('scroll', () => {
    if (scrollScheduled) return;
    scrollScheduled = true;
    requestAnimationFrame(() => {
      const distance = document.documentElement.scrollHeight - window.innerHeight;
      progress.style.setProperty('--scroll-progress', distance > 0 ? String(Math.min(1, scrollY / distance)) : '0');
      scrollScheduled = false;
    });
  }, { passive: true });

  // Bottom sheet можно закрыть привычным свайпом вниз за верхнюю ручку.
  let startY = null;
  sheet.addEventListener('touchstart', event => {
    if (event.target.closest('.grabber') || (sheet.scrollTop < 2 && event.touches[0].clientY < sheet.getBoundingClientRect().top + 90)) {
      startY = event.touches[0].clientY;
    }
  }, { passive: true });
  sheet.addEventListener('touchmove', event => {
    if (startY === null || reduced.matches) return;
    const delta = Math.max(0, event.touches[0].clientY - startY);
    if (delta > 0 && sheet.scrollTop < 2) {
      sheet.style.animation = 'none';
      sheet.style.transform = `translate(-50%, ${Math.min(delta, 210)}px)`;
    }
  }, { passive: true });
  sheet.addEventListener('touchend', event => {
    if (startY === null) return;
    const delta = event.changedTouches[0].clientY - startY;
    startY = null;
    sheet.style.animation = '';
    sheet.style.transform = '';
    if (delta > 100 && !layer.hidden) {
      const close = sheet.querySelector('[data-close-sheet]');
      close?.click();
      if (navigator.vibrate) navigator.vibrate(8);
    }
  }, { passive: true });
})();
