// INGLY OS V2 — Acquisti UI (live). Lista/ricerca/filtro stato, nuovo (fornitore
// → righe → totali → bozza), dettaglio con righe/totali, cambio stato, archivia.
import * as PUR from './purchases.js';
import * as SUP from './suppliers.js';
import * as CAT from './catalog.js';
import { roleForTenant } from './context.js';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const eur = (n) => '€' + (Number(n || 0)).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const day = (s) => esc((s || '').slice(0, 10));
const SL = { DRAFT: 'Bozza', ORDERED: 'Ordinato', PARTIALLY_RECEIVED: 'Ric. parziale', RECEIVED: 'Ricevuto', CANCELLED: 'Annullato' };

export function renderPurchaseRows(list) {
  if (!list || !list.length) return `<tr><td colspan="6"><div class="v2-empty">Nessun ordine di acquisto. Crea il primo o modifica i filtri.</div></td></tr>`;
  return list.map((o) => `<tr data-po="${esc(o.id)}" class="v2-row">
    <td>${esc(o.number || '—')}</td><td>${esc(o.supplier_name || '—')}</td>
    <td><span class="v2-chip">${esc(SL[o.status] || o.status)}</span></td>
    <td>${day(o.order_date)}</td><td>${day(o.expected_date)}</td><td class="v2-num">${eur(o.total)}</td></tr>`).join('');
}

export function renderPurchaseDetail(bundle, role) {
  const o = bundle.order;
  if (!o) return `<div class="v2-empty">Ordine di acquisto non trovato.</div>`;
  const w = PUR.canWrite(role); const d = PUR.canDelete(role);
  const t = bundle.totals || PUR.computeTotals(bundle.lines);
  const lines = (bundle.lines || []).map((l) => `<tr>
    <td>${esc(l.description)}</td><td class="v2-num">${Number(l.quantity)}</td>
    <td class="v2-num">${eur(l.unit_price)}</td><td class="v2-num">${eur(l.discount)}</td>
    <td class="v2-num">${eur(l.tax)}</td><td class="v2-num">${eur(l.line_total != null ? l.line_total : (l.quantity * l.unit_price - l.discount + l.tax))}</td>
    ${w ? `<td><button class="v2-btn v2-xs v2-danger" data-del-line="${esc(l.id)}">🗑</button></td>` : '<td></td>'}</tr>`).join('')
    || `<tr><td colspan="7"><div class="v2-empty">Nessuna riga. Aggiungi un prodotto.</div></td></tr>`;
  const statusOpts = PUR.PURCHASE_STATUSES.map((s) => `<option value="${s}"${o.status === s ? ' selected' : ''}>${SL[s]}</option>`).join('');
  return `<div class="v2-detail">
    <div class="v2-detail-head"><button class="v2-btn v2-ghost" data-back>← Lista</button>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${w ? `<button class="v2-btn" data-edit="${esc(o.id)}">Modifica</button>` : ''}
        ${w && o.status !== 'RECEIVED' && o.status !== 'CANCELLED' ? `<button class="v2-btn" data-receive="${esc(o.id)}">📥 Ricevi merce</button>` : ''}
        ${d ? `<button class="v2-btn v2-danger" data-del="${esc(o.id)}">Archivia</button>` : ''}
      </div></div>
    <h2>${esc(o.number || 'Bozza')} <span class="v2-chip">${esc(SL[o.status] || o.status)}</span></h2>
    <div class="v2-kv"><div><span>Fornitore</span>${esc(o.supplier_name || '—')}</div>
      <div><span>Data ordine</span>${day(o.order_date)}</div>
      <div><span>Ricezione prevista</span>${day(o.expected_date)}</div>
      <div><span>Stato</span>${w ? `<select class="v2-filter" data-status>${statusOpts}</select>` : esc(SL[o.status] || o.status)}</div></div>
    ${o.notes ? `<p class="v2-notes">${esc(o.notes)}</p>` : ''}
    <div class="v2-table-wrap"><table class="v2-table"><thead><tr>
      <th>Descrizione</th><th>Qtà</th><th>Prezzo</th><th>Sconto</th><th>Imposta</th><th>Totale</th><th></th></tr></thead>
      <tbody>${lines}</tbody></table></div>
    ${w ? '<button class="v2-btn v2-sm" data-add-line>+ Riga</button>' : ''}
    <div class="v2-summary">
      <div><span>Subtotale</span><b>${eur(t.subtotal)}</b></div>
      <div><span>Sconto</span><b>-${eur(t.discount)}</b></div>
      <div><span>Imposte</span><b>${eur(t.tax)}</b></div>
      <div class="v2-summary-tot"><span>Totale</span><b>${eur(t.total)}</b></div>
    </div></div>`;
}

export function renderPurchaseForm(o, suppliers) {
  o = o || {};
  const opts = (suppliers || []).map((s) => `<option value="${esc(s.id)}"${o.supplier_id === s.id ? ' selected' : ''}>${esc(s.name)}</option>`).join('');
  return `<form class="v2-form" data-po-form="${esc(o.id || '')}">
    <h2>${o.id ? 'Modifica ordine di acquisto' : 'Nuovo ordine di acquisto'}</h2>
    <label>Fornitore*<select name="supplier_id" required><option value="">— seleziona —</option>${opts}</select></label>
    <div class="v2-form-row">
      <label>Data ordine<input name="order_date" type="date" value="${esc(o.order_date || '')}"></label>
      <label>Ricezione prevista<input name="expected_date" type="date" value="${esc(o.expected_date || '')}"></label></div>
    <label>Note<textarea name="notes">${esc(o.notes || '')}</textarea></label>
    <div class="v2-form-actions"><button type="button" class="v2-btn v2-ghost" data-cancel>Annulla</button>
      <button type="submit" class="v2-btn">${o.id ? 'Salva' : 'Salva bozza'}</button></div>
    <div class="v2-form-msg" data-msg></div></form>`;
}

export function renderLineForm(products) {
  const opts = (products || []).map((p) => `<option value="${esc(p.id)}" data-cost="${p.cost != null ? p.cost : p.price}" data-name="${esc(p.name)}">${esc(p.name)}</option>`).join('');
  return `<form class="v2-form" data-line-form>
    <h3>Aggiungi riga</h3>
    <label>Prodotto<select name="product_id"><option value="">— libero —</option>${opts}</select></label>
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
  const w = PUR.canWrite(role);
  const root = container.querySelector('[data-purchases-root]') || container;
  root.innerHTML = `<div data-po-pane></div>`;
  const pane = root.querySelector('[data-po-pane]');
  const state = { search: '', status: '' };
  let deb;

  async function list() {
    pane.innerHTML = loading('Carico ordini di acquisto…');
    try {
      const items = await PUR.listPurchases(sb, state);
      pane.innerHTML = `
        <div class="v2-toolbar">
          <input class="v2-search" data-q placeholder="🔍 Cerca per numero/fornitore…" value="${esc(state.search)}">
          <select class="v2-filter" data-fstatus><option value="">Tutti gli stati</option>${PUR.PURCHASE_STATUSES.map((s) => `<option value="${s}"${state.status === s ? ' selected' : ''}>${SL[s]}</option>`).join('')}</select>
          ${w ? '<button class="v2-btn" data-new>+ Nuovo acquisto</button>' : '<span class="v2-muted">Sola lettura</span>'}
        </div>
        <div class="v2-table-wrap"><table class="v2-table"><thead><tr>
          <th>Numero</th><th>Fornitore</th><th>Stato</th><th>Data</th><th>Ricezione</th><th>Totale</th></tr></thead>
          <tbody>${renderPurchaseRows(items)}</tbody></table></div>`;
      const q = pane.querySelector('[data-q]');
      if (q) q.addEventListener('input', () => { clearTimeout(deb); deb = setTimeout(() => { state.search = q.value; list(); }, 250); });
      const fs = pane.querySelector('[data-fstatus]'); if (fs) fs.addEventListener('change', () => { state.status = fs.value; list(); });
      const nw = pane.querySelector('[data-new]'); if (nw) nw.addEventListener('click', () => form());
      pane.querySelectorAll('[data-po]').forEach((tr) => tr.addEventListener('click', () => detail(tr.getAttribute('data-po'))));
    } catch (e) { pane.innerHTML = errorBox(PUR.friendlyError(e)); }
  }

  async function form(existing) {
    if (!w) return list();
    pane.innerHTML = loading('Carico fornitori…');
    let suppliers = [];
    try { suppliers = await SUP.listSuppliers(sb, { limit: 500 }); } catch (_) { suppliers = []; }
    pane.innerHTML = renderPurchaseForm(existing, suppliers);
    const f = pane.querySelector('[data-po-form]');
    pane.querySelector('[data-cancel]').addEventListener('click', () => (existing ? detail(existing.id) : list()));
    f.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const msg = f.querySelector('[data-msg]');
      const data = Object.fromEntries(new FormData(f).entries());
      if (!data.supplier_id) { msg.textContent = 'Seleziona un fornitore.'; return; }
      const sel = f.querySelector('select[name="supplier_id"]');
      data.supplier_name = sel.options[sel.selectedIndex].textContent;
      msg.textContent = 'Salvataggio…';
      try {
        if (existing && existing.id) { await PUR.updatePurchase(sb, existing.id, data); toast(root, 'Aggiornato'); detail(existing.id); }
        else { const out = await PUR.createPurchase(sb, tenantId, data); toast(root, 'Bozza creata'); detail(out.id); }
      } catch (e) { msg.textContent = PUR.friendlyError(e); }
    });
  }

  async function detail(id) {
    pane.innerHTML = loading('Carico ordine…');
    try {
      const bundle = await PUR.getPurchase(sb, id);
      pane.innerHTML = renderPurchaseDetail(bundle, role);
      pane.querySelector('[data-back]').addEventListener('click', list);
      const ed = pane.querySelector('[data-edit]'); if (ed) ed.addEventListener('click', () => form(bundle.order));
      const dl = pane.querySelector('[data-del]'); if (dl) dl.addEventListener('click', async () => {
        if (!window.confirm('Archiviare questo ordine di acquisto?')) return;
        try { await PUR.softDeletePurchase(sb, id); toast(root, 'Archiviato'); list(); }
        catch (e) { alert(PUR.friendlyError(e)); }
      });
      const st = pane.querySelector('[data-status]'); if (st) st.addEventListener('change', async () => {
        try { await PUR.changeStatus(sb, id, st.value); toast(root, 'Stato aggiornato'); detail(id); }
        catch (e) { alert(PUR.friendlyError(e)); }
      });
      const rc = pane.querySelector('[data-receive]'); if (rc) rc.addEventListener('click', async () => {
        if (!window.confirm('Caricare a magazzino le righe di questo ordine e segnarlo RICEVUTO?')) return;
        try { const r = await PUR.receivePurchase(sb, tenantId, id); toast(root, `Merce ricevuta (${r.received} righe a magazzino)`); detail(id); }
        catch (e) { alert(PUR.friendlyError(e)); }
      });
      pane.querySelectorAll('[data-del-line]').forEach((b) => b.addEventListener('click', async () => {
        try { await PUR.deleteLine(sb, b.getAttribute('data-del-line')); detail(id); }
        catch (e) { alert(PUR.friendlyError(e)); }
      }));
      const al = pane.querySelector('[data-add-line]'); if (al) al.addEventListener('click', () => lineForm(id, bundle.lines.length));
    } catch (e) { pane.innerHTML = errorBox(PUR.friendlyError(e)); }
  }

  async function lineForm(poId, sortOrder) {
    let products = [];
    try { products = await CAT.listProducts(sb, { limit: 500 }); } catch (_) { products = []; }
    const wrap = document.createElement('div'); wrap.innerHTML = renderLineForm(products);
    pane.appendChild(wrap);
    const f = wrap.querySelector('[data-line-form]');
    const sel = f.querySelector('select[name="product_id"]');
    sel.addEventListener('change', () => {
      const o = sel.options[sel.selectedIndex];
      if (o && o.value) { f.querySelector('input[name="unit_price"]').value = o.getAttribute('data-cost') || 0;
        if (!f.querySelector('input[name="description"]').value) f.querySelector('input[name="description"]').value = o.getAttribute('data-name') || ''; }
    });
    wrap.querySelector('[data-line-cancel]').addEventListener('click', () => wrap.remove());
    f.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const data = Object.fromEntries(new FormData(f).entries());
      if (!data.description) return;
      data.sort_order = sortOrder || 0;
      try { await PUR.addLine(sb, tenantId, poId, data); detail(poId); }
      catch (e) { alert(PUR.friendlyError(e)); }
    });
  }

  list();
}
