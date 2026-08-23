// INGLY OS V2 — Dashboard UI (live). Rende i KPI CRM reali con stati
// loading/empty/error. Renderer puro testabile + mount runtime.
import { loadDashboard } from './dashboard.js';
import * as CRM from './crm.js';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const eur = (n) => '€' + (Number(n || 0)).toLocaleString('it-IT', { maximumFractionDigits: 0 });
const day = (s) => esc((s || '').slice(0, 10));

export function renderDashboard(d) {
  const kpis = [
    ['Clienti', d.customers], ['Aziende', d.companies],
    ['Prodotti/Servizi', d.products || 0], ['Valore clienti', eur(d.totalValue)],
  ];
  const recent = (d.recentCustomers || []).map((c) =>
    `<li><b>${esc(c.name)}</b> <span class="v2-chip">${esc(c.type || 'B2C')}</span> <span class="v2-muted">${eur(c.value_cached)}</span></li>`).join('')
    || '<li class="v2-muted">Nessun cliente ancora. Vai al CRM per crearne uno.</li>';
  const acts = (d.recentActivities || []).map((a) =>
    `<li><span class="v2-chip">${esc(a.type)}</span> ${esc(a.body || '')} <span class="v2-muted">${day(a.occurred_at)}</span></li>`).join('')
    || '<li class="v2-muted">Nessuna attività registrata.</li>';
  return `<div class="v2-grid">${kpis.map(([l, v]) =>
    `<div class="v2-kpi"><div class="v2-kpi-l">${esc(l)}</div><div class="v2-kpi-v">${esc(v)}</div></div>`).join('')}</div>
    <div class="v2-grid" style="margin-top:10px">
      <div class="v2-kpi"><div class="v2-kpi-l">Clienti B2B</div><div class="v2-kpi-v">${d.b2b}</div></div>
      <div class="v2-kpi"><div class="v2-kpi-l">Clienti B2C</div><div class="v2-kpi-v">${d.b2c}</div></div>
      <div class="v2-kpi"><div class="v2-kpi-l">Preventivi</div><div class="v2-kpi-v">${d.quotesTotal || 0}</div></div>
      <div class="v2-kpi"><div class="v2-kpi-l">Bozze</div><div class="v2-kpi-v">${d.quotesDraft || 0}</div></div>
      <div class="v2-kpi"><div class="v2-kpi-l">Inviati</div><div class="v2-kpi-v">${d.quotesSent || 0}</div></div>
      <div class="v2-kpi"><div class="v2-kpi-l">Accettati</div><div class="v2-kpi-v">${d.quotesAccepted || 0}</div></div>
      <div class="v2-kpi"><div class="v2-kpi-l">Valore accettati</div><div class="v2-kpi-v">${eur(d.quotesAcceptedValue || 0)}</div></div>
      <div class="v2-kpi"><div class="v2-kpi-l">Ordini</div><div class="v2-kpi-v">${d.ordersTotal || 0}</div></div>
      <div class="v2-kpi"><div class="v2-kpi-l">Ordini aperti</div><div class="v2-kpi-v">${d.ordersOpen || 0}</div></div>
      <div class="v2-kpi"><div class="v2-kpi-l">Ricavo ordini</div><div class="v2-kpi-v">${eur(d.ordersRevenue || 0)}</div></div>
      <div class="v2-kpi"><div class="v2-kpi-l">Fatture</div><div class="v2-kpi-v">${d.invoicesTotal || 0}</div></div>
      <div class="v2-kpi"><div class="v2-kpi-l">Fatturato</div><div class="v2-kpi-v">${eur(d.invoicedTotal || 0)}</div></div>
      <div class="v2-kpi"><div class="v2-kpi-l">Incassato</div><div class="v2-kpi-v">${eur(d.collectedTotal || 0)}</div></div>
      <div class="v2-kpi"><div class="v2-kpi-l">Da incassare</div><div class="v2-kpi-v">${eur(d.outstandingTotal || 0)}</div></div>
      <div class="v2-kpi"><div class="v2-kpi-l">Scaduto</div><div class="v2-kpi-v">${eur(d.overdueTotal || 0)}</div></div>
    </div>
    <div class="v2-cols" style="margin-top:14px">
      <div class="v2-card"><h3>Ultimi clienti</h3><ul class="v2-list">${recent}</ul></div>
      <div class="v2-card"><h3>Attività recenti</h3><ul class="v2-list">${acts}</ul></div>
    </div>`;
}

export function mount(container, { sb }) {
  const pane = container.querySelector('[data-dash-pane]');
  if (!pane) return;
  pane.innerHTML = `<div class="v2-loading">⏳ Carico metriche…</div>`;
  loadDashboard(sb).then((d) => {
    if (d.error) { pane.innerHTML = `<div class="v2-errbox">⚠️ ${esc(CRM.friendlyError(d.error))}</div>`; return; }
    pane.innerHTML = renderDashboard(d);
  }).catch((e) => { pane.innerHTML = `<div class="v2-errbox">⚠️ ${esc(CRM.friendlyError(e))}</div>`; });
}
