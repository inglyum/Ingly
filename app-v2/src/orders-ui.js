// INGLY OS V2 — Ordini UI (live). Lista + kanban per stato, ricerca, filtro,
// dettaglio con righe/totali, cambio stato, archivia. Righe read-only da
// snapshot (create tipicamente via conversione da preventivo).
import * as ORD from './orders.js';
import * as CRM from './crm.js';
import { convertOrderToInvoice } from './invoices.js';
import { createShipmentFromOrder } from './logistics.js';
import { roleForTenant } from './context.js';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const eur = (n) => '€' + (Number(n || 0)).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const day = (s) => esc((s || '').slice(0, 10));
const SL = { CONFIRMED: 'Confermato', IN_PRODUCTION: 'In produzione', READY: 'Pronto', DELIVERED: 'Consegnato', CANCELLED: 'Annullato' };

export function renderOrderRows(list) {
  if (!list || !list.length) return `<tr><td colspan="5"><div class="v2-empty">Nessun ordine. Converti un preventivo accettato o modifica i filtri.</div></td></tr>`;
  return list.map((o) => `<tr data-order="${esc(o.id)}" class="v2-row">
    <td>${esc(o.number || '—')}</td><td>${esc(o.customer_name || '—')}</td>
    <td><span class="v2-chip">${esc(SL[o.status] || o.status)}</span></td>
    <td>${day(o.order_date)}</td><td class="v2-num">${eur(o.total)}</td></tr>`).join('');
}

export function renderOrderKanban(list) {
  return `<div class="v2-kanban">${ORD.ORDER_STATUSES.map((k) => {
    const items = (list || []).filter((o) => o.status === k);
    const cards = items.map((o) => `<div class="v2-kcard" data-order="${esc(o.id)}">
      <b>${esc(o.number || '—')}</b><div class="v2-muted">${esc(o.customer_name || '—')}</div>
      <div class="v2-num">${eur(o.total)}</div></div>`).join('') || '<div class="v2-muted" style="padding:6px">—</div>';
    return `<div class="v2-kcol" data-col="${k}"><div class="v2-kcol-h">${esc(SL[k])} <span class="v2-kcount">${items.length}</span></div>
      <div class="v2-kbody">${cards}</div></div>`;
  }).join('')}</div>`;
}

export function renderOrderDetail(bundle, role) {
  const o = bundle.order;
  if (!o) return `<div class="v2-empty">Ordine non trovato.</div>`;
  const w = CRM.canWrite(role); const d = CRM.canDelete(role);
  const t = bundle.totals || ORD.computeTotals(bundle.lines);
  const lines = (bundle.lines || []).map((l) => `<tr>
    <td>${esc(l.description)}</td><td class="v2-num">${Number(l.quantity)}</td>
    <td class="v2-num">${eur(l.unit_price)}</td><td class="v2-num">${eur(l.discount)}</td>
    <td class="v2-num">${eur(l.tax)}</td><td class="v2-num">${eur(l.line_total != null ? l.line_total : (l.quantity * l.unit_price - l.discount + l.tax))}</td></tr>`).join('')
    || `<tr><td colspan="6"><div class="v2-empty">Nessuna riga.</div></td></tr>`;
  const statusOpts = ORD.ORDER_STATUSES.map((s) => `<option value="${s}"${o.status === s ? ' selected' : ''}>${SL[s]}</option>`).join('');
  return `<div class="v2-detail">
    <div class="v2-detail-head"><button class="v2-btn v2-ghost" data-back>← Lista</button>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${w && o.status !== 'CANCELLED' ? `<button class="v2-btn" data-invoice="${esc(o.id)}">🧮 Converti in fattura</button>` : ''}
        ${w && o.status !== 'CANCELLED' ? `<button class="v2-btn" data-shipment="${esc(o.id)}">🚚 Crea spedizione</button>` : ''}
        ${d ? `<button class="v2-btn v2-danger" data-del="${esc(o.id)}">Archivia</button>` : ''}
      </div></div>
    <h2>${esc(o.number || 'Ordine')} <span class="v2-chip">${esc(SL[o.status] || o.status)}</span></h2>
    <div class="v2-kv"><div><span>Cliente</span>${esc(o.customer_name || '—')}</div>
      <div><span>Data</span>${day(o.order_date)}</div>
      <div><span>Da preventivo</span>${o.quote_id ? 'sì' : '—'}</div>
      <div><span>Stato</span>${w ? `<select class="v2-filter" data-status>${statusOpts}</select>` : esc(SL[o.status] || o.status)}</div></div>
    ${o.notes ? `<p class="v2-notes">${esc(o.notes)}</p>` : ''}
    <div class="v2-table-wrap"><table class="v2-table"><thead><tr>
      <th>Descrizione</th><th>Qtà</th><th>Prezzo</th><th>Sconto</th><th>Imposta</th><th>Totale</th></tr></thead>
      <tbody>${lines}</tbody></table></div>
    <div class="v2-summary">
      <div><span>Subtotale</span><b>${eur(t.subtotal)}</b></div>
      <div><span>Sconto</span><b>-${eur(t.discount)}</b></div>
      <div><span>Imposte</span><b>${eur(t.tax)}</b></div>
      <div class="v2-summary-tot"><span>Totale</span><b>${eur(t.total)}</b></div>
    </div></div>`;
}

const loading = (m) => `<div class="v2-loading">⏳ ${esc(m || 'Caricamento…')}</div>`;
const errorBox = (m) => `<div class="v2-errbox">⚠️ ${esc(m || 'Errore')}</div>`;
const toast = (root, msg) => { const t = document.createElement('div'); t.className = 'v2-toast'; t.textContent = msg; root.appendChild(t); setTimeout(() => t.remove(), 2600); };

export function mount(container, { sb, ctx }) {
  if (!container) return;
  const role = roleForTenant(ctx || {}, (ctx || {}).activeTenant) || '—';
  const w = CRM.canWrite(role);
  const root = container.querySelector('[data-orders-root]') || container;
  root.innerHTML = `<div data-o-pane></div>`;
  const pane = root.querySelector('[data-o-pane]');
  const state = { search: '', status: '', view: 'kanban' };
  let deb;

  async function list() {
    pane.innerHTML = loading('Carico ordini…');
    try {
      const items = await ORD.listOrders(sb, { search: state.search, status: state.status });
      pane.innerHTML = `
        <div class="v2-toolbar">
          <input class="v2-search" data-q placeholder="🔍 Cerca per numero/cliente…" value="${esc(state.search)}">
          <select class="v2-filter" data-fstatus><option value="">Tutti gli stati</option>${ORD.ORDER_STATUSES.map((s) => `<option value="${s}"${state.status === s ? ' selected' : ''}>${SL[s]}</option>`).join('')}</select>
          <div class="v2-tabs"><button class="v2-tab${state.view === 'kanban' ? ' active' : ''}" data-view="kanban">Kanban</button><button class="v2-tab${state.view === 'list' ? ' active' : ''}" data-view="list">Lista</button></div>
        </div>
        ${state.view === 'kanban' ? renderOrderKanban(items)
          : `<div class="v2-table-wrap"><table class="v2-table"><thead><tr><th>Numero</th><th>Cliente</th><th>Stato</th><th>Data</th><th>Totale</th></tr></thead><tbody>${renderOrderRows(items)}</tbody></table></div>`}`;
      const q = pane.querySelector('[data-q]');
      if (q) q.addEventListener('input', () => { clearTimeout(deb); deb = setTimeout(() => { state.search = q.value; list(); }, 250); });
      const fs = pane.querySelector('[data-fstatus]'); if (fs) fs.addEventListener('change', () => { state.status = fs.value; list(); });
      pane.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => { state.view = b.getAttribute('data-view'); list(); }));
      pane.querySelectorAll('[data-order]').forEach((el) => el.addEventListener('click', () => detail(el.getAttribute('data-order'))));
    } catch (e) { pane.innerHTML = errorBox(ORD.friendlyError(e)); }
  }

  async function detail(id) {
    pane.innerHTML = loading('Carico ordine…');
    try {
      const bundle = await ORD.getOrder(sb, id);
      pane.innerHTML = renderOrderDetail(bundle, role);
      pane.querySelector('[data-back]').addEventListener('click', list);
      const dl = pane.querySelector('[data-del]'); if (dl) dl.addEventListener('click', async () => {
        if (!window.confirm('Archiviare questo ordine?')) return;
        try { await ORD.softDeleteOrder(sb, id); toast(root, 'Archiviato'); list(); }
        catch (e) { alert(ORD.friendlyError(e)); }
      });
      const st = pane.querySelector('[data-status]'); if (st) st.addEventListener('change', async () => {
        try { await ORD.changeStatus(sb, id, st.value); toast(root, 'Stato aggiornato'); detail(id); }
        catch (e) { alert(ORD.friendlyError(e)); }
      });
      const iv = pane.querySelector('[data-invoice]'); if (iv) iv.addEventListener('click', async () => {
        if (!window.confirm('Creare una fattura da questo ordine?')) return;
        try { const inv = await convertOrderToInvoice(sb, (ctx || {}).activeTenant || null, id); toast(root, 'Fattura creata: ' + (inv.number || '')); location.hash = '#/invoices'; }
        catch (e) { alert(ORD.friendlyError(e)); }
      });
      const sp = pane.querySelector('[data-shipment]'); if (sp) sp.addEventListener('click', async () => {
        if (!window.confirm('Creare una spedizione da questo ordine?')) return;
        try { const sh = await createShipmentFromOrder(sb, (ctx || {}).activeTenant || null, id); toast(root, 'Spedizione creata: ' + (sh.number || '')); location.hash = '#/logistics'; }
        catch (e) { alert(ORD.friendlyError(e)); }
      });
    } catch (e) { pane.innerHTML = errorBox(ORD.friendlyError(e)); }
  }

  list();
}
