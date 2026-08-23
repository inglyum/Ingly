// INGLY OS V2 — Ricerca globale UI (live). Un solo campo che interroga tutti i
// moduli e raggruppa i risultati; il click porta al modulo relativo.
import * as SEARCH from './search.js';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const loading = () => `<div class="v2-loading">⏳ Cerco…</div>`;
const errorBox = (m) => `<div class="v2-errbox">⚠️ ${esc(m || 'Errore')}</div>`;

export function renderResults(res) {
  if (res.tooShort) return `<div class="v2-empty">Digita almeno ${SEARCH.MIN_QUERY} caratteri per cercare in tutto l'ERP.</div>`;
  if (res.error) return errorBox(SEARCH.friendlyError(res.error));
  if (!res.total) return `<div class="v2-empty">Nessun risultato per “${esc(res.query)}”.</div>`;
  return `<div class="v2-search-groups">${res.groups.map((g) => `
    <div class="v2-search-group">
      <div class="v2-search-group-h">${g.icon} ${esc(g.label)} <span class="v2-kcount">${g.items.length}</span></div>
      <ul class="v2-search-list">${g.items.map((it) => `
        <li class="v2-search-item" data-route="${esc(it.route)}" data-id="${esc(it.id)}" tabindex="0">
          <span class="v2-search-item-l">${esc(it.label)}</span>
          ${it.sublabel ? `<span class="v2-search-item-s">${esc(it.sublabel)}</span>` : ''}
        </li>`).join('')}</ul>
    </div>`).join('')}</div>`;
}

export function mount(container, { sb }) {
  if (!container) return;
  const root = container.querySelector('[data-search-root]') || container;
  root.innerHTML = `
    <div class="v2-toolbar">
      <input class="v2-search" data-gq placeholder="🔍 Cerca clienti, prodotti, preventivi, ordini, fatture, fornitori, spedizioni…" autofocus>
    </div>
    <div data-gpane><div class="v2-empty">Digita almeno ${SEARCH.MIN_QUERY} caratteri per cercare in tutto l'ERP.</div></div>`;
  const input = root.querySelector('[data-gq]');
  const pane = root.querySelector('[data-gpane]');
  let deb; let token = 0;

  async function run() {
    const q = input.value;
    pane.innerHTML = loading();
    const my = ++token;
    try {
      const res = await SEARCH.globalSearch(sb, q);
      if (my !== token) return; // risposta obsoleta: ignora
      pane.innerHTML = renderResults(res);
      pane.querySelectorAll('[data-route]').forEach((el) => {
        const go = () => { location.hash = '#/' + el.getAttribute('data-route'); };
        el.addEventListener('click', go);
        el.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
      });
    } catch (e) { if (my === token) pane.innerHTML = errorBox(SEARCH.friendlyError(e)); }
  }

  input.addEventListener('input', () => { clearTimeout(deb); deb = setTimeout(run, 220); });
  try { input.focus(); } catch (_) { /* headless */ }
}
