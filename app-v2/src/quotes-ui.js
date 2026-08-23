// INGLY OS V2 — Preventivi UI (live). Lista/ricerca/filtri, nuovo (cliente →
// righe → totali → bozza), dettaglio, modifica, cambio stato, duplica, archivia.
// Totali calcolati lato DB; qui display ottimistico via computeTotals.
import * as Q from './quotes.js';
import * as CRM from './crm.js';
import * as CAT from './catalog.js';
import { convertQuoteToOrder } from './orders.js';
import { addQuoterLineToQuote } from './quoter.js';
import { openQuoterDrawer } from './quoter-drawer.js';
import { roleForTenant } from './context.js';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const eur = (n) => '€' + (Number(n || 0)).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const day = (s) => esc((s || '').slice(0, 10));
const STATUS_LABEL = { DRAFT: 'Bozza', SENT: 'Inviato', ACCEPTED: 'Accettato', REJECTED: 'Rifiutato', EXPIRED: 'Scaduto', CANCELLED: 'Annullato' };

export function renderQuoteRows(list) {
  if (!list || !list.length) return `<tr><td colspan="6"><div class="v2-empty">Nessun preventivo. Crea il primo o modifica i filtri.</div></td></tr>`;
  return list.map((q) => `<tr data-quote="${esc(q.id)}" class="v2-row">
    <td>${esc(q.number || '—')}</td><td>${esc(q.customer_name || '—')}</td>
    <td><span class="v2-chip">${esc(STATUS_LABEL[q.status] || q.status)}</span></td>
    <td>${day(q.issue_date)}</td><td>${day(q.valid_until)}</td>
    <td class="v2-num">${eur(q.total)}</td></tr>`).join('');
}

export function renderQuoteDetail(bundle, role) {
  const q = bundle.quote;
  if (!q) return `<div class="v2-empty">Preventivo non trovato.</div>`;
  const w = CRM.canWrite(role); const d = CRM.canDelete(role);
  const t = bundle.totals || Q.computeTotals(bundle.lines);
  const lines = (bundle.lines || []).map((l) => `<tr>
    <td>${esc(l.description)}</td><td class="v2-num">${Number(l.quantity)}</td>
    <td class="v2-num">${eur(l.unit_price)}</td><td class="v2-num">${eur(l.discount)}</td>
    <td class="v2-num">${eur(l.tax)}</td><td class="v2-num">${eur(l.line_total != null ? l.line_total : (l.quantity * l.unit_price - l.discount + l.tax))}</td>
    ${w ? `<td><button class="v2-btn v2-xs v2-danger" data-del-line="${esc(l.id)}">🗑</button></td>` : '<td></td>'}</tr>`).join('')
    || `<tr><td colspan="7"><div class="v2-empty">Nessuna riga. Aggiungi un prodotto/servizio.</div></td></tr>`;
  const statusOpts = Q.QUOTE_STATUSES.map((s) => `<option value="${s}"${q.status === s ? ' selected' : ''}>${STATUS_LABEL[s]}</option>`).join('');
  return `<div class="v2-detail">
    <div class="v2-detail-head"><button class="v2-btn v2-ghost" data-back>← Lista</button>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${w ? `<button class="v2-btn" data-edit="${esc(q.id)}">Modifica</button>` : ''}
        ${w ? `<button class="v2-btn" data-dup="${esc(q.id)}">Duplica</button>` : ''}
        ${w && q.status === 'ACCEPTED' ? `<button class="v2-btn" data-convert="${esc(q.id)}">➡️ Converti in ordine</button>` : ''}
        ${d ? `<button class="v2-btn v2-danger" data-del="${esc(q.id)}">Archivia</button>` : ''}
      </div></div>
    <h2>${esc(q.number || 'Bozza')} <span class="v2-chip">${esc(STATUS_LABEL[q.status] || q.status)}</span></h2>
    <div class="v2-kv"><div><span>Cliente</span>${esc(q.customer_name || '—')}</div>
      <div><span>Emissione</span>${day(q.issue_date)}</div>
      <div><span>Validità</span>${day(q.valid_until)}</div>
      <div><span>Stato</span>${w ? `<select class="v2-filter" data-status>${statusOpts}</select>` : esc(STATUS_LABEL[q.status] || q.status)}</div></div>
    ${q.notes ? `<p class="v2-notes">${esc(q.notes)}</p>` : ''}
    <div class="v2-table-wrap"><table class="v2-table"><thead><tr>
      <th>Descrizione</th><th>Qtà</th><th>Prezzo</th><th>Sconto</th><th>Imposta</th><th>Totale</th><th></th></tr></thead>
      <tbody>${lines}</tbody></table></div>
    ${w ? '<button class="v2-btn v2-sm" data-add-line>+ Riga</button> <button class="v2-btn v2-sm" data-quoter-line="' + esc(q.id) + '">🧮 Riga da Smart Quoter</button>' : ''}
    <div class="v2-summary">
      <div><span>Subtotale</span><b>${eur(t.subtotal)}</b></div>
      <div><span>Sconto</span><b>-${eur(t.discount)}</b></div>
      <div><span>Imposte</span><b>${eur(t.tax)}</b></div>
      <div class="v2-summary-tot"><span>Totale</span><b>${eur(t.total)}</b></div>
    </div></div>`;
}

export function renderQuoteForm(q, customers) {
  q = q || {};
  const opts = (customers || []).map((c) => `<option value="${esc(c.id)}"${q.customer_id === c.id ? ' selected' : ''}>${esc(c.name)}</option>`).join('');
  return `<form class="v2-form" data-quote-form="${esc(q.id || '')}">
    <h2>${q.id ? 'Modifica preventivo' : 'Nuovo preventivo'}</h2>
    <label>Cliente*<select name="customer_id" required><option value="">— seleziona —</option>${opts}</select></label>
    <div class="v2-form-row">
      <label>Emissione<input name="issue_date" type="date" value="${esc(q.issue_date || '')}"></label>
      <label>Validità<input name="valid_until" type="date" value="${esc(q.valid_until || '')}"></label></div>
    <label>Note<textarea name="notes">${esc(q.notes || '')}</textarea></label>
    <div class="v2-form-actions"><button type="button" class="v2-btn v2-ghost" data-cancel>Annulla</button>
      <button type="submit" class="v2-btn">${q.id ? 'Salva' : 'Salva bozza'}</button></div>
    <div class="v2-form-msg" data-msg></div></form>`;
}

export function renderLineForm(products) {
  const opts = (products || []).map((p) => `<option value="${esc(p.id)}" data-price="${p.price}" data-name="${esc(p.name)}">${esc(p.name)} · ${eur(p.price)}</option>`).join('');
  return `<form class="v2-form" data-line-form>
    <h3>Aggiungi riga</h3>
    <label>Prodotto/Servizio<select name="product_id"><option value="">— libero —</option>${opts}</select></label>
    <label>Descrizione*<input name="description" required></label>
    <div class="v2-form-row">
      <label>Quantità<input name="quantity" type="number" step="0.01" value="1"></label>
      <label>Prezzo €<input name="unit_price" type="number" step="0.01" value="0"></label></div>
    <div class="v2-form-row">
      <label>Sconto €<input name="discount" type="number" step="0.01" value="0"></label>
      <label>Imposta €<input name="tax" type="number" step="0.01" value="0"></label></div>
    <div class="v2-form-actions"><button type="button" class="v2-btn v2-ghost" data-line-cancel>Annulla</button>
      <button type="submit" class="v2-btn">Aggiungi</button></div></form>`;
}

const loading = (m) => `<div class="v2-loading">⏳ ${esc(m || 'Caricamento…')}</div>`;
const errorBox = (m) => `<div class="v2-errbox">⚠️ ${esc(m || 'Errore')}</div>`;
const toast = (root, msg) => { const t = document.createElement('div'); t.className = 'v2-toast'; t.textContent = msg; root.appendChild(t); setTimeout(() => t.remove(), 2600); };

export function mount(container, { sb, ctx }) {
  if (!container) return;
  const role = roleForTenant(ctx || {}, (ctx || {}).activeTenant) || '—';
  const tenantId = (ctx || {}).activeTenant || null;
  const w = CRM.canWrite(role);
  const root = container.querySelector('[data-quotes-root]') || container;
  root.innerHTML = `<div data-q-pane></div>`;
  const pane = root.querySelector('[data-q-pane]');
  const state = { search: '', status: '' };
  let deb;

  async function list() {
    pane.innerHTML = loading('Carico preventivi…');
    try {
      const items = await Q.listQuotes(sb, state);
      pane.innerHTML = `
        <div class="v2-toolbar">
          <input class="v2-search" data-q placeholder="🔍 Cerca per numero/cliente…" value="${esc(state.search)}">
          <select class="v2-filter" data-fstatus><option value="">Tutti gli stati</option>${Q.QUOTE_STATUSES.map((s) => `<option value="${s}"${state.status === s ? ' selected' : ''}>${STATUS_LABEL[s]}</option>`).join('')}</select>
          ${w ? '<button class="v2-btn" data-new>+ Nuovo preventivo</button>' : '<span class="v2-muted">Sola lettura (ruolo ' + esc(role) + ')</span>'}
        </div>
        <div class="v2-table-wrap"><table class="v2-table"><thead><tr>
          <th>Numero</th><th>Cliente</th><th>Stato</th><th>Emissione</th><th>Validità</th><th>Totale</th></tr></thead>
          <tbody>${renderQuoteRows(items)}</tbody></table></div>`;
      const q = pane.querySelector('[data-q]');
      if (q) q.addEventListener('input', () => { clearTimeout(deb); deb = setTimeout(() => { state.search = q.value; list(); }, 250); });
      const fs = pane.querySelector('[data-fstatus]'); if (fs) fs.addEventListener('change', () => { state.status = fs.value; list(); });
      const nw = pane.querySelector('[data-new]'); if (nw) nw.addEventListener('click', () => form());
      pane.querySelectorAll('[data-quote]').forEach((tr) => tr.addEventListener('click', () => detail(tr.getAttribute('data-quote'))));
    } catch (e) { pane.innerHTML = errorBox(Q.friendlyError(e)); }
  }

  async function form(existing) {
    if (!w) return list();
    pane.innerHTML = loading('Carico clienti…');
    let customers = [];
    try { customers = await CRM.listCustomers(sb, { limit: 500 }); } catch (_) { customers = []; }
    pane.innerHTML = renderQuoteForm(existing, customers);
    const f = pane.querySelector('[data-quote-form]');
    pane.querySelector('[data-cancel]').addEventListener('click', () => (existing ? detail(existing.id) : list()));
    f.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const msg = f.querySelector('[data-msg]');
      const data = Object.fromEntries(new FormData(f).entries());
      if (!data.customer_id) { msg.textContent = 'Seleziona un cliente.'; return; }
      const sel = f.querySelector('select[name="customer_id"]');
      data.customer_name = sel.options[sel.selectedIndex].textContent;
      msg.textContent = 'Salvataggio…';
      try {
        if (existing && existing.id) { await Q.updateQuote(sb, existing.id, data); toast(root, 'Preventivo aggiornato'); detail(existing.id); }
        else { const out = await Q.createQuote(sb, tenantId, data); toast(root, 'Bozza creata'); detail(out.id); }
      } catch (e) { msg.textContent = Q.friendlyError(e); }
    });
  }

  async function detail(id) {
    pane.innerHTML = loading('Carico preventivo…');
    try {
      const bundle = await Q.getQuote(sb, id);
      pane.innerHTML = renderQuoteDetail(bundle, role);
      pane.querySelector('[data-back]').addEventListener('click', list);
      const ed = pane.querySelector('[data-edit]'); if (ed) ed.addEventListener('click', () => form(bundle.quote));
      const dp = pane.querySelector('[data-dup]'); if (dp) dp.addEventListener('click', async () => {
        try { const c = await Q.duplicateQuote(sb, tenantId, id); toast(root, 'Duplicato: ' + (c.number || 'nuova bozza')); detail(c.id); }
        catch (e) { alert(Q.friendlyError(e)); }
      });
      const cv = pane.querySelector('[data-convert]'); if (cv) cv.addEventListener('click', async () => {
        if (!window.confirm('Creare un ordine da questo preventivo?')) return;
        try { const o = await convertQuoteToOrder(sb, tenantId, id); toast(root, 'Ordine creato: ' + (o.number || '')); location.hash = '#/gestione_ordini'; }
        catch (e) { alert(Q.friendlyError(e)); }
      });
      const dl = pane.querySelector('[data-del]'); if (dl) dl.addEventListener('click', async () => {
        if (!window.confirm('Archiviare questo preventivo?')) return;
        try { await Q.softDeleteQuote(sb, id); toast(root, 'Archiviato'); list(); }
        catch (e) { alert(Q.friendlyError(e)); }
      });
      const st = pane.querySelector('[data-status]'); if (st) st.addEventListener('change', async () => {
        try { await Q.changeStatus(sb, id, st.value); toast(root, 'Stato aggiornato'); detail(id); }
        catch (e) { alert(Q.friendlyError(e)); }
      });
      pane.querySelectorAll('[data-del-line]').forEach((b) => b.addEventListener('click', async () => {
        try { await Q.deleteLine(sb, b.getAttribute('data-del-line')); detail(id); }
        catch (e) { alert(Q.friendlyError(e)); }
      }));
      const al = pane.querySelector('[data-add-line]'); if (al) al.addEventListener('click', () => lineForm(id, bundle.lines.length));
      const ql = pane.querySelector('[data-quoter-line]'); if (ql) ql.addEventListener('click', () => {
        openQuoterDrawer({ sb, ctx, confirmLabel: 'Aggiungi al preventivo', onConfirm: async (calc, description) => {
          await addQuoterLineToQuote(sb, tenantId, id, { description, calc, sortOrder: bundle.lines.length });
          toast(root, 'Riga aggiunta dal Quoter'); detail(id);
        } });
      });
    } catch (e) { pane.innerHTML = errorBox(Q.friendlyError(e)); }
  }

  async function lineForm(quoteId, sortOrder) {
    let products = [];
    try { products = await CAT.listProducts(sb, { limit: 500 }); } catch (_) { products = []; }
    const wrap = document.createElement('div'); wrap.innerHTML = renderLineForm(products);
    pane.appendChild(wrap);
    const f = wrap.querySelector('[data-line-form]');
    const sel = f.querySelector('select[name="product_id"]');
    sel.addEventListener('change', () => {
      const o = sel.options[sel.selectedIndex];
      if (o && o.value) { f.querySelector('input[name="unit_price"]').value = o.getAttribute('data-price') || 0;
        if (!f.querySelector('input[name="description"]').value) f.querySelector('input[name="description"]').value = o.getAttribute('data-name') || ''; }
    });
    wrap.querySelector('[data-line-cancel]').addEventListener('click', () => wrap.remove());
    f.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const data = Object.fromEntries(new FormData(f).entries());
      if (!data.description) return;
      data.sort_order = sortOrder || 0;
      try { await Q.addLine(sb, tenantId, quoteId, data); detail(quoteId); }
      catch (e) { alert(Q.friendlyError(e)); }
    });
  }

  list();
}
