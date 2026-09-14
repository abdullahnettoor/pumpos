/** A self-contained, sample-data presentation. No API calls or financial writes. */
export function initialiseCollectionTour(root: HTMLElement) {
  const tabs = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-tour-step]'));
  const panels = Array.from(root.querySelectorAll<HTMLElement>('[data-tour-panel]'));
  const play = root.querySelector<HTMLButtonElement>('[data-tour-play]')!;
  const playLabel = play.querySelector('span')!;
  const back = root.querySelector<HTMLButtonElement>('[data-tour-back]')!;
  const next = root.querySelector<HTMLButtonElement>('[data-tour-next]')!;
  const position = root.querySelector<HTMLElement>('[data-tour-position]')!;
  const status = root.querySelector<HTMLElement>('[data-tour-status]')!;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let current = 0;
  let playing = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let animations: Animation[] = [];
  let progress: Animation | undefined;
  const sceneDuration = 6000;
  let autoplayConsumed = false;
  let viewportObserver: IntersectionObserver | undefined;

  function stop() {
    playing = false;
    clearTimeout(timer);
    progress?.cancel();
    playLabel.textContent = current === panels.length - 1 ? 'Replay walkthrough' : 'Play walkthrough';
    play.setAttribute('aria-pressed', 'false');
    root.dataset.playing = 'false';
  }

  function select(index: number, announce = true) {
    animations.forEach((animation) => animation.cancel());
    animations = [];
    current = Math.max(0, Math.min(index, panels.length - 1));
    tabs.forEach((tab, i) => {
      tab.setAttribute('aria-selected', String(i === current));
      tab.tabIndex = i === current ? 0 : -1;
    });
    panels.forEach((panel, i) => { panel.hidden = i !== current; });
    back.disabled = current === 0;
    next.disabled = current === panels.length - 1;
    position.textContent = `${current + 1} / ${panels.length}`;
    if (!playing) playLabel.textContent = current === panels.length - 1 ? 'Replay walkthrough' : 'Play walkthrough';
    if (announce) status.textContent = `Step ${current + 1} of ${panels.length}. ${panels[current].querySelector('h3')?.textContent}`;
    if (announce && !reduceMotion.matches && typeof Element.prototype.animate === 'function') {
      const stage = panels[current].querySelector<HTMLElement>('.tour-stage')!;
      animations.push(stage.animate([{ opacity: 0.65, transform: 'translateY(10px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 420, easing: 'cubic-bezier(.16,1,.3,1)' }));
      panels[current].querySelectorAll<HTMLElement>('[data-motion-detail]').forEach((detail) => {
        animations.push(detail.animate([{ opacity: 0.6, transform: 'translateX(9px)' }, { opacity: 1, transform: 'translateX(0)' }], { duration: 550, delay: 90, easing: 'cubic-bezier(.16,1,.3,1)' }));
      });
    }
  }

  function schedule() {
    progress?.cancel();
    if (!reduceMotion.matches && typeof Element.prototype.animate === 'function') {
      progress = tabs[current].querySelector<HTMLElement>('.step-progress')!.animate([{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], { duration: sceneDuration, easing: 'linear' });
    }
    timer = setTimeout(() => {
      if (current === panels.length - 1) { stop(); return; }
      select(current + 1, false);
      animateScene();
      schedule();
    }, sceneDuration);
  }

  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => { autoplayConsumed = true; stop(); select(i); });
    tab.addEventListener('keydown', (event) => {
      const target = event.key === 'ArrowRight' ? (i + 1) % tabs.length
        : event.key === 'ArrowLeft' ? (i - 1 + tabs.length) % tabs.length
          : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : null;
      if (target === null) return;
      event.preventDefault();
      autoplayConsumed = true;
      stop();
      select(target);
      tabs[target].focus();
    });
  });
  back.addEventListener('click', () => { autoplayConsumed = true; stop(); select(current - 1); });
  next.addEventListener('click', () => { autoplayConsumed = true; stop(); select(current + 1); });
  function start() {
    if (playing) return;
    if (current === panels.length - 1) select(0);
    playing = true;
    playLabel.textContent = 'Pause walkthrough';
    play.setAttribute('aria-pressed', 'true');
    root.dataset.playing = 'true';
    schedule();
  }
  function animateScene() {
    if (reduceMotion.matches || typeof Element.prototype.animate !== 'function') return;
    const stage = panels[current].querySelector<HTMLElement>('.tour-stage')!;
    animations.push(stage.animate([{ opacity: .65, transform: 'translateX(8px)' }, { opacity: 1, transform: 'translateX(0)' }], { duration: 450, easing: 'cubic-bezier(.16,1,.3,1)' }));
  }
  play.addEventListener('click', () => {
    autoplayConsumed = true;
    if (playing) { stop(); return; }
    start();
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
  reduceMotion.addEventListener('change', () => { stop(); animations.forEach((animation) => animation.cancel()); });
  if ('IntersectionObserver' in window) {
    viewportObserver = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) { stop(); return; }
      if (!autoplayConsumed && !reduceMotion.matches && !document.hidden) {
        autoplayConsumed = true;
        start();
      }
    }, { threshold: .35 });
    viewportObserver.observe(root.querySelector('.tour-panels')!);
  }

  // Inspecting the contents with a keyboard must not hide the focused panel.
  root.addEventListener('focusin', (event) => {
    if (event.target instanceof Element && event.target.closest('.tour-panels')) { autoplayConsumed = true; stop(); }
  });

  panels.forEach((panel, i) => {
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', tabs[i].id);
    panel.tabIndex = 0;
  });
  select(0, false);
  stop();
  root.querySelectorAll<HTMLElement>('[data-tour-controls]').forEach((control) => { control.hidden = false; });
}
