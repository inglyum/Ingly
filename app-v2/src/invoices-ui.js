// INGLY OS V2 — Fatture UI (live). Lista/ricerca/filtro stato, dettaglio con
// righe/totali/imponibile/IVA/saldo, cambio stato, archivia. Creazione tipica
// via conversione da ordine.
import * as INV from './invoices.js';
import * as CRM from './crm.js';
import { roleForTenant } from './context.js';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const eur = (n) => '€' + (Number(n || 0)).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const day = (s) => esc((s || '').slice(0, 10));
const SL = { DRAFT: 'Bozza', ISSUED: 'Emessa', PARTIALLY_PAID: 'Parziale', PAID: 'Pagata', OVERDUE: 'Scaduta', CANCELLED: 'Annullata' };

export function renderInvoiceRows(list) {
  if (!list || !list.length) return `<tr><td colspan="6"><div class="v2-empty">Nessuna fattura. Converti un ordine o modifica i filtri.</div></td></tr>`;
  return list.map((i) => `<tr data-invoice="${esc(i.id)}" class="v2-row">
    <td>${esc(i.number || '—')}</td><td>${esc(i.customer_name || '—')}</td>
    <td><span class="v2-chip">${esc(SL[i.status] || i.status)}</span></td>
    <td>${day(i.due_date)}</td><td class="v2-num">${eur(i.total)}</td>
    <td class="v2-num">${eur(INV.balanceDue(i))}</td></tr>`).join('');
}

export function renderInvoiceDetail(bundle, role) {
  const i = bundle.invoice;
  if (!i) return `<div class="v2-empty">Fattura non trovata.</div>`;
  const w = CRM.canWrite(role); const d = CRM.canDelete(role);
  const t = bundle.totals || INV.computeTotals(bundle.lines);
  const lines = (bundle.lines || []).map((l) => `<tr>
    <td>${esc(l.description)}</td><td class="v2-num">${Number(l.quantity)}</td>
    <td class="v2-num">${eur(l.unit_price)}</td><td class="v2-num">${eur(l.discount)}</td>
    <td class="v2-num">${eur(l.tax)}</td><td class="v2-num">${eur(l.line_total != null ? l.line_total : (l.quantity * l.unit_price - l.discount + l.tax))}</td></tr>`).join('')
    || `<tr><td colspan="6"><div class="v2-empty">Nessuna riga.</div></td></tr>`;
  const statusOpts = INV.INVOICE_STATUSES.map((s) => `<option value="${s}"${i.status === s ? ' selected' : ''}>${SL[s]}</option>`).join('');
  return `<div class="v2-detail">
    <div class="v2-detail-head"><button class="v2-btn v2-ghost" data-back>← Lista</button>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${d ? `<button class="v2-btn v2-danger" data-del="${esc(i.id)}">Archivia</button>` : ''}
      </div></div>
    <h2>${esc(i.number || 'Fattura')} <span class="v2-chip">${esc(SL[i.status] || i.status)}</span></h2>
    <div class="v2-kv"><div><span>Cliente</span>${esc(i.customer_name || '—')}</div>
      <div><span>Emissione</span>${day(i.issue_date)}</div>
      <div><span>Scadenza</span>${day(i.due_date)}</div>
      <div><span>Da ordine</span>${i.order_id ? 'sì' : '—'}</div>
      <div><span>Stato</span>${w ? `<select class="v2-filter" data-status>${statusOpts}</select>` : esc(SL[i.status] || i.status)}</div></div>
    ${i.notes ? `<p class="v2-notes">${esc(i.notes)}</p>` : ''}
    <div class="v2-table-wrap"><table class="v2-table"><thead><tr>
      <th>Descrizione</th><th>Qtà</th><th>Prezzo</th><th>Sconto</th><th>IVA</th><th>Totale</th></tr></thead>
      <tbody>${lines}</tbody></table></div>
    <div class="v2-summary">
      <div><span>Imponibile</span><b>${eur(t.subtotal)}</b></div>
      <div><span>Sconto</span><b>-${eur(t.discount)}</b></div>
      <div><span>IVA</span><b>${eur(t.tax)}</b></div>
      <div><span>Totale</span><b>${eur(t.total)}</b></div>
      <div><span>Pagato</span><b>${eur(i.paid_total)}</b></div>
      <div class="v2-summary-tot"><span>Saldo</span><b>${eur(INV.balanceDue(i))}</b></div>
    </div></div>`;
}

const loading = (m) => `<div class="v2-loading">⏳ ${esc(m || 'Caricamento…')}</div>`;
const errorBox = (m) => `<div class="v2-errbox">⚠️ ${esc(m || 'Errore')}</div>`;
const toast = (root, msg) => { const t = document.createElement('div'); t.className = 'v2-toast'; t.textContent = msg; root.appendChild(t); setTimeout(() => t.remove(), 2600); };

export function mount(container, { sb, ctx }) {
  if (!container) return;
  const role = roleForTenant(ctx || {}, (ctx || {}).activeTenant) || '—';
  const w = CRM.canWrite(role);
  const root = container.querySelector('[data-invoices-root]') || container;
  root.innerHTML = `<div data-i-pane></div>`;
  const pane = root.querySelector('[data-i-pane]');
  const state = { search: '', status: '' };
  let deb;

  async function list() {
    pane.innerHTML = loading('Carico fatture…');
    try {
      const items = await INV.listInvoices(sb, state);
      pane.innerHTML = `
        <div class="v2-toolbar">
          <input class="v2-search" data-q placeholder="🔍 Cerca per numero/cliente…" value="${esc(state.search)}">
          <select class="v2-filter" data-fstatus><option value="">Tutti gli stati</option>${INV.INVOICE_STATUSES.map((s) => `<option value="${s}"${state.status === s ? ' selected' : ''}>${SL[s]}</option>`).join('')}</select>
          ${w ? '' : '<span class="v2-muted">Sola lettura (ruolo ' + esc(role) + ')</span>'}
        </div>
        <div class="v2-table-wrap"><table class="v2-table"><thead><tr>
          <th>Numero</th><th>Cliente</th><th>Stato</th><th>Scadenza</th><th>Totale</th><th>Saldo</th></tr></thead>
          <tbody>${renderInvoiceRows(items)}</tbody></table></div>`;
      const q = pane.querySelector('[data-q]');
      if (q) q.addEventListener('input', () => { clearTimeout(deb); deb = setTimeout(() => { state.search = q.value; list(); }, 250); });
      const fs = pane.querySelector('[data-fstatus]'); if (fs) fs.addEventListener('change', () => { state.status = fs.value; list(); });
      pane.querySelectorAll('[data-invoice]').forEach((tr) => tr.addEventListener('click', () => detail(tr.getAttribute('data-invoice'))));
    } catch (e) { pane.innerHTML = errorBox(INV.friendlyError(e)); }
  }

  async function detail(id) {
    pane.innerHTML = loading('Carico fattura…');
    try {
      const bundle = await INV.getInvoice(sb, id);
      pane.innerHTML = renderInvoiceDetail(bundle, role);
      pane.querySelector('[data-back]').addEventListener('click', list);
      const dl = pane.querySelector('[data-del]'); if (dl) dl.addEventListener('click', async () => {
        if (!window.confirm('Archiviare questa fattura?')) return;
        try { await INV.softDeleteInvoice(sb, id); toast(root, 'Archiviata'); list(); }
        catch (e) { alert(INV.friendlyError(e)); }
      });
      const st = pane.querySelector('[data-status]'); if (st) st.addEventListener('change', async () => {
        try { await INV.changeStatus(sb, id, st.value); toast(root, 'Stato aggiornato'); detail(id); }
        catch (e) { alert(INV.friendlyError(e)); }
      });
    } catch (e) { pane.innerHTML = errorBox(INV.friendlyError(e)); }
  }

  list();
}
