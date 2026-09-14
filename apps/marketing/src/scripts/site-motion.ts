export function initialiseSiteMotion() {
  const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  const animations = new Set<Animation>();
  const run = (element: HTMLElement) => {
    if (preference.matches || document.hidden || typeof element.animate !== 'function') return;
    const animation = element.animate(
      [{ transform: 'translateY(12px)', opacity: .65 }, { transform: 'translateY(0)', opacity: 1 }],
      { duration: 650, easing: 'cubic-bezier(.16,1,.3,1)' },
    );
    animations.add(animation);
    animation.finished.then(() => animations.delete(animation), () => animations.delete(animation));
  };
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => { if (entry.isIntersecting) { run(entry.target as HTMLElement); observer.unobserve(entry.target); } });
    }, { threshold: .2 });
    document.querySelectorAll<HTMLElement>('[data-product-reveal]').forEach(el => observer.observe(el));
  }
  preference.addEventListener('change', () => { animations.forEach(a => a.cancel()); });
  const menu = document.querySelector<HTMLDetailsElement>('.mobile-menu');
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && menu?.open) { menu.open = false; menu.querySelector('summary')?.focus(); } });
  document.addEventListener('click', event => { if (menu?.open && event.target instanceof Node && !menu.contains(event.target)) menu.open = false; });
}
