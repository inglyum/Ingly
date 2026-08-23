// INGLY OS V2 — Finanza UI (live). Dashboard finanziaria derivata: KPI +
// tab Entrate/Uscite/Scadenze/Cashflow/Esposizione. Filtro periodo.
import * as FIN from './finance.js';
import { roleForTenant } from './context.js';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const eur = (n) => '€' + (Number(n || 0)).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const day = (s) => esc((s || '').slice(0, 10));

export function renderFinanceKpis(f) {
  const cf = f.cashflow; const cfTone = cf >= 0 ? '#4ade80' : '#f87171';
  const cards = [
    ['Incassato', eur(f.incassato)], ['Da incassare', eur(f.daIncassare)], ['Scaduto', eur(f.scaduto)],
    ['Pagato fornitori', eur(f.pagatoFornitori)], ['Da pagare fornitori', eur(f.daPagareFornitori)],
  ];
  return `<div class="v2-grid">
    ${cards.map(([l, v]) => `<div class="v2-kpi"><div class="v2-kpi-l">${esc(l)}</div><div class="v2-kpi-v">${v}</div></div>`).join('')}
    <div class="v2-kpi"><div class="v2-kpi-l">Cashflow periodo</div><div class="v2-kpi-v" style="color:${cfTone}">${eur(cf)}</div></div>
  </div>`;
}

export function renderMovementRows(rows, sign) {
  if (!rows || !rows.length) return `<tr><td colspan="4"><div class="v2-empty">Nessun movimento nel periodo.</div></td></tr>`;
  return rows.map((m) => `<tr class="v2-row">
    <td>${day(m.date)}</td><td>${esc(m.source)}</td><td>${esc(FIN.METHOD_LABEL[m.method] || m.method || '—')}</td>
    <td class="v2-num" style="color:${sign < 0 ? '#f87171' : '#4ade80'}">${sign < 0 ? '-' : '+'}${eur(m.amount)}</td></tr>`).join('');
}

export function renderExposure(rows, label) {
  if (!rows || !rows.length) return `<div class="v2-empty">Nessuna esposizione ${esc(label)}.</div>`;
  return `<ul class="v2-list">${rows.map((r) => `<li class="v2-li-act"><span>${esc(r.name)}</span><b>${eur(r.value)}</b></li>`).join('')}</ul>`;
}

export function renderDueRows(rows, isSupplier) {
  if (!rows || !rows.length) return `<tr><td colspan="4"><div class="v2-empty">Nessuna scadenza aperta.</div></td></tr>`;
  return rows.map((r) => `<tr class="v2-row${r.overdue ? ' v2-row-warn' : ''}">
    <td>${esc(r.number || '—')}</td><td>${esc(r.name || '—')}</td>
    <td>${isSupplier ? '—' : day(r.due_date)}</td><td class="v2-num">${eur(r.residuo)}</td></tr>`).join('');
}

const loading = (m) => `<div class="v2-loading">⏳ ${esc(m || 'Caricamento…')}</div>`;
const errorBox = (m) => `<div class="v2-errbox">⚠️ ${esc(m || 'Errore')}</div>`;

export function mount(container, { sb, ctx }) {
  if (!container) return;
  const role = roleForTenant(ctx || {}, (ctx || {}).activeTenant) || '—';
  const root = container.querySelector('[data-finance-root]') || container;
  root.innerHTML = `
    <div class="v2-toolbar">
      <select class="v2-filter" data-period>
        <option value="all">Tutto</option>
        <option value="month" selected>Mese corrente</option>
        <option value="week">Ultima settimana</option>
      </select>
    </div>
    <div data-fin-kpis>${loading('Carico finanza…')}</div>
    <div class="v2-tabs" data-fin-tabs>
      <button class="v2-tab active" data-fin-tab="cashflow">💧 Cashflow</button>
      <button class="v2-tab" data-fin-tab="in">⬇️ Entrate</button>
      <button class="v2-tab" data-fin-tab="out">⬆️ Uscite</button>
      <button class="v2-tab" data-fin-tab="due">📅 Scadenze</button>
      <button class="v2-tab" data-fin-tab="exp">⚠️ Esposizione</button>
    </div>
    <div data-fin-pane></div>`;
  const kpisEl = root.querySelector('[data-fin-kpis]');
  const pane = root.querySelector('[data-fin-pane]');
  let data = null; let tab = 'cashflow';

  root.querySelector('[data-period]').addEventListener('change', (e) => { load(e.target.value); });
  root.querySelectorAll('[data-fin-tab]').forEach((b) => b.addEventListener('click', () => {
    root.querySelectorAll('[data-fin-tab]').forEach((x) => x.classList.toggle('active', x === b));
    tab = b.getAttribute('data-fin-tab'); renderTab();
  }));

  function renderTab() {
    if (!data) return;
    if (tab === 'in') {
      pane.innerHTML = `<div class="v2-table-wrap"><table class="v2-table"><thead><tr><th>Data</th><th>Origine</th><th>Metodo</th><th>Importo</th></tr></thead><tbody>${renderMovementRows(data.entrateRows, 1)}</tbody></table></div>`;
    } else if (tab === 'out') {
      pane.innerHTML = `<div class="v2-table-wrap"><table class="v2-table"><thead><tr><th>Data</th><th>Origine</th><th>Metodo</th><th>Importo</th></tr></thead><tbody>${renderMovementRows(data.usciteRows, -1)}</tbody></table></div>`;
    } else if (tab === 'due') {
      pane.innerHTML = `
        <div class="v2-cols">
          <div class="v2-card"><h3>Scadenze clienti (da incassare)</h3>
            <div class="v2-table-wrap"><table class="v2-table"><thead><tr><th>Doc</th><th>Cliente</th><th>Scadenza</th><th>Residuo</th></tr></thead><tbody>${renderDueRows(data.scadenzeClienti, false)}</tbody></table></div></div>
          <div class="v2-card"><h3>Scadenze fornitori (da pagare)</h3>
            <div class="v2-table-wrap"><table class="v2-table"><thead><tr><th>Doc</th><th>Fornitore</th><th></th><th>Residuo</th></tr></thead><tbody>${renderDueRows(data.scadenzeFornitori, true)}</tbody></table></div></div>
        </div>`;
    } else if (tab === 'exp') {
      pane.innerHTML = `<div class="v2-cols">
        <div class="v2-card"><h3>Esposizione clienti</h3>${renderExposure(data.esposizioneClienti, 'clienti')}</div>
        <div class="v2-card"><h3>Esposizione fornitori</h3>${renderExposure(data.esposizioneFornitori, 'fornitori')}</div></div>`;
    } else {
      pane.innerHTML = `
        <div class="v2-grid">
          <div class="v2-kpi"><div class="v2-kpi-l">Entrate periodo</div><div class="v2-kpi-v" style="color:#4ade80">${eur(data.entrate)}</div></div>
          <div class="v2-kpi"><div class="v2-kpi-l">Uscite periodo</div><div class="v2-kpi-v" style="color:#f87171">${eur(data.uscite)}</div></div>
          <div class="v2-kpi"><div class="v2-kpi-l">Cashflow netto</div><div class="v2-kpi-v" style="color:${data.cashflow >= 0 ? '#4ade80' : '#f87171'}">${eur(data.cashflow)}</div></div>
        </div>
        <p class="v2-muted">Entrate = incassi fatture · Uscite = pagamenti fornitori. Importi derivati dai documenti reali del periodo selezionato.</p>`;
    }
  }

  async function load(periodKind) {
    kpisEl.innerHTML = loading('Carico finanza…'); pane.innerHTML = '';
    try {
      const { from, to } = FIN.periodRange(periodKind || 'month');
      data = await FIN.loadFinance(sb, { from, to });
      if (data.error) { kpisEl.innerHTML = errorBox(FIN.friendlyError(data.error)); return; }
      kpisEl.innerHTML = renderFinanceKpis(data);
      renderTab();
    } catch (e) { kpisEl.innerHTML = errorBox(FIN.friendlyError(e)); }
  }

  load('month');
}
