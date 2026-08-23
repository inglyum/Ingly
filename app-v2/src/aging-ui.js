// INGLY OS V2 — Scadenziario UI (live, derivato dalle fatture). Riepilogo per
// fasce di aging + elenco scadenze aperte con residuo. Click → apre la fattura.
import * as AG from './aging.js';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const eur = (n) => '€' + (Number(n || 0)).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const day = (s) => esc((s || '').slice(0, 10));

export function renderAgingSummary(totals) {
  return `<div class="v2-grid">
    ${AG.BUCKETS.map((k) => `<div class="v2-kpi"><div class="v2-kpi-l">${esc(AG.BUCKET_LABEL[k])}</div><div class="v2-kpi-v">${eur(totals[k])}</div></div>`).join('')}
    <div class="v2-kpi"><div class="v2-kpi-l">Scaduto</div><div class="v2-kpi-v">${eur(totals.overdue)}</div></div>
    <div class="v2-kpi"><div class="v2-kpi-l">Totale aperto</div><div class="v2-kpi-v">${eur(totals.total)}</div></div>
  </div>`;
}

export function renderAgingRows(rows) {
  if (!rows || !rows.length) return `<tr><td colspan="6"><div class="v2-empty">Nessuna scadenza aperta. Tutto incassato 🎉</div></td></tr>`;
  return rows.map((r) => `<tr data-invoice="${esc(r.id)}" class="v2-row${r.overdue ? ' v2-row-warn' : ''}">
    <td>${esc(r.number || '—')}</td><td>${esc(r.customer_name || '—')}</td>
    <td>${day(r.due_date)}</td><td><span class="v2-chip">${esc(AG.BUCKET_LABEL[r.bucket])}</span></td>
    <td class="v2-num">${eur(r.total)}</td><td class="v2-num">${eur(r.residuo)}</td></tr>`).join('');
}

const loading = (m) => `<div class="v2-loading">⏳ ${esc(m || 'Caricamento…')}</div>`;
const errorBox = (m) => `<div class="v2-errbox">⚠️ ${esc(m || 'Errore')}</div>`;

export function mount(container, { sb }) {
  if (!container) return;
  const root = container.querySelector('[data-aging-root]') || container;
  root.innerHTML = `<div data-ag-pane>${loading('Carico scadenziario…')}</div>`;
  const pane = root.querySelector('[data-ag-pane]');
  const state = { bucket: '' };

  async function render() {
    pane.innerHTML = loading('Carico scadenziario…');
    try {
      const { rows, totals } = await AG.loadAging(sb, state.bucket ? { bucket: state.bucket } : {});
      pane.innerHTML = `
        ${renderAgingSummary(totals)}
        <div class="v2-toolbar" style="margin-top:12px">
          <select class="v2-filter" data-fbucket><option value="">Tutte le fasce</option>${AG.BUCKETS.map((k) => `<option value="${k}"${state.bucket === k ? ' selected' : ''}>${esc(AG.BUCKET_LABEL[k])}</option>`).join('')}</select>
        </div>
        <div class="v2-table-wrap"><table class="v2-table"><thead><tr>
          <th>Numero</th><th>Cliente</th><th>Scadenza</th><th>Fascia</th><th>Totale</th><th>Residuo</th></tr></thead>
          <tbody>${renderAgingRows(rows)}</tbody></table></div>`;
      const fb = pane.querySelector('[data-fbucket]'); if (fb) fb.addEventListener('change', () => { state.bucket = fb.value; render(); });
      pane.querySelectorAll('[data-invoice]').forEach((tr) => tr.addEventListener('click', () => { location.hash = '#/invoices'; }));
    } catch (e) { pane.innerHTML = errorBox(AG.friendlyError(e)); }
  }
  render();
}
