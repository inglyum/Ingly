// INGLY OS V2 — Cassa Profit-First & KPI UI (live). Ripartizione incassi nei
// conti (default KB 15/10/15/60) + cruscotto KPI ufficiali. Deterministico,
// spiegabile (fonte per ogni valore). Premium, responsive, no alert nativi.
import * as PF from './profitfirst.js';
import { roleForTenant } from './context.js';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const eur = (n) => '€' + (Number(n || 0)).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const loading = (m) => `<div class="v2-loading">⏳ ${esc(m || 'Caricamento…')}</div>`;
const errorBox = (m) => `<div class="v2-errbox">⚠️ ${esc(m || 'Errore')}</div>`;

const BUCKETS = [
  { k: 'tax', label: 'Tasse', icon: '🏛️' }, { k: 'reserve', label: 'Riserva', icon: '🛡️' },
  { k: 'goals', label: 'Obiettivi', icon: '🎯' }, { k: 'operational', label: 'Operativo', icon: '⚙️' },
];

export function renderProfitFirst(data) {
  if (data.error) return errorBox(PF.friendlyError(data.error));
  const b = data.buckets || { percentages: {} };
  const cards = BUCKETS.map((x) => `<div class="v2-kpi">
    <div class="v2-kpi-l">${x.icon} ${esc(x.label)} <span class="v2-muted">${b.percentages[x.k] != null ? b.percentages[x.k] + '%' : '—'}</span></div>
    <div class="v2-kpi-v">${eur(b[x.k])}</div></div>`).join('');
  const warn = b.valid ? '' : `<div class="v2-note">⚠️ Le percentuali di cassa sommano ${b.sumPct}% (dovrebbero fare 100%). Correggile nelle Impostazioni.</div>`;
  const kpiRows = (data.kpis || []).map((k) => {
    const val = k.na ? 'N/D' : (k.unit === '€' ? eur(k.actual) : (k.unit === '%' ? k.actual + '%' : k.actual + (k.unit ? ' ' + k.unit : '')));
    const tgt = k.unit === '€' ? '≥ ' + k.target : (k.unit === '%' ? '≥ ' + k.target + '%' : (k.unit === 'h' ? '≥ ' + k.target + 'h' : k.target));
    const badge = k.na ? '<span class="v2-chip">N/D</span>' : (k.ok ? '<span class="v2-chip v2-ok">✅ target</span>' : '<span class="v2-chip v2-bad">⚠️ sotto</span>');
    return `<tr><td>${esc(k.label)}</td><td class="v2-num">${val}</td><td class="v2-num v2-muted">${esc(String(tgt))}</td><td>${badge}</td><td class="v2-muted">${esc(k.source)}</td></tr>`;
  }).join('');
  return `
    <div class="v2-tabs" data-pf-tabs>
      <button class="v2-tab${data.period === 'month' ? ' active' : ''}" data-pf-period="month">Mese</button>
      <button class="v2-tab${data.period === 'week' ? ' active' : ''}" data-pf-period="week">Settimana</button>
    </div>
    <div class="v2-card"><h3>Cassa profit-first · incassato ${data.period === 'month' ? 'del mese' : 'della settimana'}: <b>${eur(data.incassato)}</b></h3>
      ${warn}
      <div class="v2-grid">${cards}</div>
      <p class="v2-muted" style="margin-top:8px">Ripartizione derivata dagli incassi reali (Finanza). Percentuali da Impostazioni ERP · default KB 15/10/15/60.</p>
    </div>
    <div class="v2-card"><h3>KPI ufficiali (${data.period === 'month' ? 'mese' : 'settimana'})</h3>
      <div class="v2-table-wrap"><table class="v2-table"><thead><tr>
        <th>KPI</th><th>Attuale</th><th>Target KB</th><th>Stato</th><th>Fonte</th></tr></thead>
        <tbody>${kpiRows || '<tr><td colspan="5"><div class="v2-empty">Nessun KPI.</div></td></tr>'}</tbody></table></div>
    </div>`;
}

export function mount(container, { sb, ctx }) {
  if (!container) return;
  const tenantId = (ctx || {}).activeTenant || null;
  roleForTenant(ctx || {}, tenantId); // no gating: sola lettura per tutti
  const root = container.querySelector('[data-profitfirst-root]') || container;
  root.innerHTML = loading('Elaboro cassa e KPI…');
  let period = 'month';

  async function draw() {
    root.innerHTML = loading('Elaboro cassa e KPI…');
    try {
      const data = await PF.loadProfitFirst(sb, { period, tenantId });
      root.innerHTML = renderProfitFirst(data);
      root.querySelectorAll('[data-pf-period]').forEach((b) => b.addEventListener('click', () => { period = b.getAttribute('data-pf-period'); draw(); }));
    } catch (e) { root.innerHTML = errorBox(PF.friendlyError(e)); }
  }
  draw();
}
