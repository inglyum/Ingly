// INGLY OS V2 — router hash-based. Ogni sezione (route) rende una vista reale.
import { renderView, wireView } from './views.js';
import { findModule } from './modules.js';

export function currentRoute() {
  const h = (typeof location !== 'undefined' && location.hash || '').replace(/^#\/?/, '');
  return h || 'dashboard';
}

export function mountRouter(root, ctx) {
  const view = root.querySelector('#v2-view');
  if (!view) return () => {};
  function render() {
    const r = currentRoute();
    view.innerHTML = renderView(r, ctx);
    wireView(view);
    root.querySelectorAll('[data-route]').forEach((b) =>
      b.classList.toggle('active', b.getAttribute('data-route') === r));
    const crumb = root.querySelector('#v2-crumb');
    const m = findModule(r);
    if (crumb) crumb.textContent = m ? m.n : r;
  }
  window.addEventListener('hashchange', render);
  render();
  return render;
}
