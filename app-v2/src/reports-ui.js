// INGLY OS V2 — Reporting/BI UI (live). Cruscotto direzionale read-only che
// aggrega vendite/finanza/magazzino/acquisti/commesse + alert con fonte.
import * as REP from './reports.js';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const eur = (n) => '€' + (Number(n || 0)).toLocaleString('it-IT', { maximumFractionDigits: 0 });

function kpiGrid(items) {
  return `<div class="v2-grid">${items.map(([l, v]) => `<div class="v2-kpi"><div class="v2-kpi-l">${esc(l)}</div><div class="v2-kpi-v">${esc(v)}</div></div>`).join('')}</div>`;
}
function rankList(rows, valFmt) {
  if (!rows || !rows.length) return '<div class="v2-empty">Dati insufficienti.</div>';
  const max = Math.max(...rows.map((r) => r.value || r.qty || 0), 1);
  return `<ul class="v2-list">${rows.map((r) => {
    const v = r.value != null ? r.value : r.qty; const pct = Math.round((v / max) * 100);
    return `<li class="rep-bar-row"><span class="rep-bar-name">${esc(r.name)}</span>
      <span class="rep-bar-track"><span class="rep-bar-fill" style="width:${pct}%"></span></span>
      <b>${valFmt ? valFmt(r) : v}</b></li>`;
  }).join('')}</ul>`;
}

export function renderReports(d) {
  const alertCls = { danger: 'rep-alert-danger', warn: 'rep-alert-warn', info: 'rep-alert-info' };
  const alerts = (d.alerts || []).length
    ? d.alerts.map((a) => `<div class="rep-alert ${alertCls[a.level] || ''}" ${a.link ? `data-goto="${esc(a.link)}"` : ''}>
        <b>${esc(a.text)}</b><span class="v2-muted"> · ${esc(a.source)}</span></div>`).join('')
    : '<div class="v2-empty">Nessun alert. Tutto sotto controllo ✅</div>';
  return `
    <h3 class="rep-h">Alert & anomalie</h3>
    <div class="rep-alerts">${alerts}</div>

    <h3 class="rep-h">Vendite</h3>
    ${kpiGrid([['Ricavi ordini', eur(d.sales.revenue)], ['Ordini', d.sales.orders], ['Preventivi', d.sales.quotes],
      ['Conversione', d.sales.conversion + '%'], ['Ticket medio', eur(d.sales.avgTicket)]])}

    <div class="v2-cols">
      <div class="v2-card"><h3>Top clienti (per ordinato)</h3>${rankList(d.topCustomers, (r) => eur(r.value))}</div>
      <div class="v2-card"><h3>Top prodotti (per quantità)</h3>${rankList(d.topProducts, (r) => r.qty + ' pz')}</div>
    </div>

    <h3 class="rep-h">Finanza</h3>
    ${kpiGrid([['Incassato', eur(d.finance.incassato)], ['Da incassare', eur(d.finance.daIncassare)], ['Scaduto', eur(d.finance.scaduto)],
      ['Da pagare fornitori', eur(d.finance.daPagareFornitori)], ['Cashflow', eur(d.finance.cashflow)]])}

    <h3 class="rep-h">Magazzino & Acquisti</h3>
    ${kpiGrid([['Valore magazzino', eur(d.warehouse.value)], ['Sotto scorta', d.warehouse.below], ['Unità a stock', d.warehouse.units],
      ['Valore acquisti', eur(d.purchases.value)], ['Ordini acquisto', d.purchases.count]])}

    <h3 class="rep-h">Commesse</h3>
    ${kpiGrid([['Commesse', d.projects.total], ['Attive', d.projects.active], ['Ricavi', eur(d.projects.revenue)],
      ['Costi', eur(d.projects.cost)], ['Margine', eur(d.projects.margin)]])}`;
}

const loading = (m) => `<div class="v2-loading">⏳ ${esc(m || 'Caricamento…')}</div>`;
const errorBox = (m) => `<div class="v2-errbox">⚠️ ${esc(m || 'Errore')}</div>`;

export function mount(container, { sb }) {
  if (!container) return;
  const root = container.querySelector('[data-reports-root]') || container;
  root.innerHTML = loading('Elaboro i report…');
  REP.loadReports(sb).then((d) => {
    if (d.error) { root.innerHTML = errorBox(REP.friendlyError(d.error)); return; }
    root.innerHTML = renderReports(d);
    root.querySelectorAll('[data-goto]').forEach((el) => { el.style.cursor = 'pointer'; el.addEventListener('click', () => { location.hash = '#/' + el.getAttribute('data-goto'); }); });
  }).catch((e) => { root.innerHTML = errorBox(REP.friendlyError(e)); });
}
