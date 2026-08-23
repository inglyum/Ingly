// INGLY OS V2 — Magazzino UI (live). Schede: Giacenze (derivata) + Movimenti
// (ledger). Nuovo movimento (carico/scarico/rettifica/trasferimento) da catalogo.
import * as WH from './warehouse.js';
import * as CAT from './catalog.js';
import * as PUR from './purchases.js';
import { roleForTenant } from './context.js';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const eur = (n) => '€' + (Number(n || 0)).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const day = (s) => esc((s || '').slice(0, 10));

export function renderInventoryRows(rows) {
  if (!rows || !rows.length) return `<tr><td colspan="8"><div class="v2-empty">Nessuna giacenza. Registra un carico per iniziare.</div></td></tr>`;
  return rows.map((r) => `<tr class="v2-row${r.qty < 0 || r.below ? ' v2-row-warn' : ''}">
    <td>${esc(r.name)}${r.below ? ' <span class="v2-chip" style="background:rgba(220,38,38,.16);color:#f87171">sotto scorta</span>' : ''}</td>
    <td>${esc(r.sku || '—')}</td>
    <td class="v2-num">${r.qty}</td><td class="v2-num">${r.committed || 0}</td>
    <td class="v2-num">${r.incoming || 0}</td><td class="v2-num"><b>${r.available != null ? r.available : r.qty}</b></td>
    <td class="v2-num">${r.min_stock || 0}/${r.reorder_point || 0}</td>
    <td class="v2-num">${eur(r.value)}</td></tr>`).join('');
}

export function renderReorderRows(rows, w) {
  const crit = (rows || []).filter((r) => r.below);
  if (!crit.length) return `<tr><td colspan="6"><div class="v2-empty">Nessun articolo sotto scorta. Tutto ok ✅</div></td></tr>`;
  return crit.map((r) => `<tr class="v2-row v2-row-warn" data-reorder-row="${esc(r.id)}">
    <td>${esc(r.name)}</td><td>${esc(r.sku || '—')}</td>
    <td class="v2-num">${r.available}</td><td class="v2-num">${Math.max(r.reorder_point || 0, r.min_stock || 0)}</td>
    <td class="v2-num"><b>${r.toReorder}</b></td>
    <td>${w ? `<button class="v2-btn v2-sm" data-reorder="${esc(r.id)}" data-qty="${r.toReorder}" data-name="${esc(r.name)}">🛒 Riordina</button>` : '—'}</td></tr>`).join('');
}

export function renderMovementRows(list, productName) {
  if (!list || !list.length) return `<tr><td colspan="5"><div class="v2-empty">Nessun movimento registrato.</div></td></tr>`;
  return list.map((m) => {
    const d = WH.movementDelta(m);
    return `<tr class="v2-row">
      <td>${day(m.created_at)}</td><td><span class="v2-chip">${esc(WH.TYPE_LABEL[m.type] || m.type)}</span></td>
      <td>${esc(productName ? productName(m.product_id) : m.product_id)}</td>
      <td class="v2-num" style="color:${d >= 0 ? '#4ade80' : '#f87171'}">${d >= 0 ? '+' : ''}${d}</td>
      <td>${esc(m.location || 'MAIN')}${m.location_to ? ' → ' + esc(m.location_to) : ''}</td></tr>`;
  }).join('');
}

export function renderMovementForm(products) {
  const opts = (products || []).map((p) => `<option value="${esc(p.id)}">${esc(p.name)}${p.sku ? ' · ' + esc(p.sku) : ''}</option>`).join('');
  return `<form class="v2-form" data-mov-form>
    <h3>Nuovo movimento</h3>
    <label>Prodotto*<select name="product_id" required><option value="">— seleziona —</option>${opts}</select></label>
    <div class="v2-form-row">
      <label>Tipo<select name="type">${WH.MOVEMENT_TYPES.map((t) => `<option value="${t}">${WH.TYPE_LABEL[t]}</option>`).join('')}</select></label>
      <label>Quantità<input name="quantity" type="number" step="0.01" value="1"></label></div>
    <div class="v2-form-row">
      <label>Ubicazione<input name="location" value="MAIN"></label>
      <label>Verso (trasferimento)<input name="location_to" placeholder="—"></label></div>
    <label>Note<textarea name="note"></textarea></label>
    <div class="v2-form-actions"><button type="button" class="v2-btn v2-ghost" data-mov-cancel>Annulla</button>
      <button type="submit" class="v2-btn">Registra</button></div>
    <div class="v2-form-msg" data-mov-msg></div></form>`;
}

const loading = (m) => `<div class="v2-loading">⏳ ${esc(m || 'Caricamento…')}</div>`;
const errorBox = (m) => `<div class="v2-errbox">⚠️ ${esc(m || 'Errore')}</div>`;
const toast = (root, msg) => { const t = document.createElement('div'); t.className = 'v2-toast'; t.textContent = msg; root.appendChild(t); setTimeout(() => t.remove(), 2600); };

export function mount(container, { sb, ctx }) {
  if (!container) return;
  const role = roleForTenant(ctx || {}, (ctx || {}).activeTenant) || '—';
  const tenantId = (ctx || {}).activeTenant || null;
  const w = WH.canWrite(role);
  const root = container.querySelector('[data-warehouse-root]') || container;
  root.innerHTML = `
    <div class="v2-tabs" data-wh-tabs>
      <button class="v2-tab active" data-wh-tab="stock">📊 Giacenze</button>
      <button class="v2-tab" data-wh-tab="reorder">⚠️ Sotto scorta</button>
      <button class="v2-tab" data-wh-tab="moves">🔄 Movimenti</button>
    </div>
    <div data-wh-pane>${loading('Inizializzazione…')}</div>`;
  const pane = root.querySelector('[data-wh-pane]');
  let productMap = {};
  root.querySelectorAll('[data-wh-tab]').forEach((b) => b.addEventListener('click', () => {
    root.querySelectorAll('[data-wh-tab]').forEach((x) => x.classList.toggle('active', x === b));
    const t = b.getAttribute('data-wh-tab');
    if (t === 'stock') stock(); else if (t === 'reorder') reorder(); else moves();
  }));

  async function stock() {
    pane.innerHTML = loading('Carico giacenze…');
    try {
      const inv = await WH.loadInventory(sb, {});
      pane.innerHTML = `
        <div class="v2-grid">
          <div class="v2-kpi"><div class="v2-kpi-l">SKU a stock</div><div class="v2-kpi-v">${inv.skuInStock}</div></div>
          <div class="v2-kpi"><div class="v2-kpi-l">Unità totali</div><div class="v2-kpi-v">${inv.totalUnits}</div></div>
          <div class="v2-kpi"><div class="v2-kpi-l">Valore magazzino</div><div class="v2-kpi-v">${eur(inv.totalValue)}</div></div>
          <div class="v2-kpi"><div class="v2-kpi-l">Sotto scorta</div><div class="v2-kpi-v">${inv.belowCount}</div></div>
        </div>
        <div class="v2-toolbar" style="margin-top:12px">
          <input class="v2-search" data-q placeholder="🔍 Cerca prodotto/SKU…">
          ${w ? '<button class="v2-btn" data-new-mov>+ Movimento</button>' : ''}
        </div>
        <div class="v2-table-wrap"><table class="v2-table"><thead><tr>
          <th>Prodotto</th><th>SKU</th><th>Giacenza</th><th>Impegnato</th><th>In arrivo</th><th>Disponibile</th><th>Min/Riord.</th><th>Valore</th></tr></thead>
          <tbody>${renderInventoryRows(inv.rows)}</tbody></table></div>`;
      const q = pane.querySelector('[data-q]');
      if (q) q.addEventListener('input', async () => {
        const filtered = await WH.loadInventory(sb, { search: q.value });
        pane.querySelector('tbody').innerHTML = renderInventoryRows(filtered.rows);
      });
      const nm = pane.querySelector('[data-new-mov]'); if (nm) nm.addEventListener('click', () => movementForm(stock));
    } catch (e) { pane.innerHTML = errorBox(WH.friendlyError(e)); }
  }

  async function reorder() {
    pane.innerHTML = loading('Analizzo le scorte…');
    try {
      const inv = await WH.loadInventory(sb, {});
      pane.innerHTML = `
        <div class="v2-grid">
          <div class="v2-kpi"><div class="v2-kpi-l">Prodotti critici</div><div class="v2-kpi-v">${inv.belowCount}</div></div>
          <div class="v2-kpi"><div class="v2-kpi-l">Valore magazzino</div><div class="v2-kpi-v">${eur(inv.totalValue)}</div></div>
        </div>
        <p class="v2-muted" style="margin:8px 0">Articoli con disponibile sotto la soglia (punto di riordino / scorta minima). "Riordina" crea una bozza di ordine di acquisto.</p>
        <div class="v2-table-wrap"><table class="v2-table"><thead><tr>
          <th>Prodotto</th><th>SKU</th><th>Disponibile</th><th>Soglia</th><th>Da riordinare</th><th></th></tr></thead>
          <tbody>${renderReorderRows(inv.rows, w)}</tbody></table></div>`;
      pane.querySelectorAll('[data-reorder]').forEach((b) => b.addEventListener('click', async () => {
        const pid = b.getAttribute('data-reorder'); const qty = Number(b.getAttribute('data-qty')) || 0; const name = b.getAttribute('data-name');
        if (qty <= 0) return;
        try {
          const po = await PUR.createPurchase(sb, tenantId, { notes: 'Riordino automatico da scorte minime' });
          await PUR.addLine(sb, tenantId, po.id, { product_id: pid, description: name, quantity: qty, unit_price: 0 });
          toast(root, `Bozza acquisto ${po.number || ''} creata (${qty} ${name})`);
          location.hash = '#/purchases';
        } catch (e) { toast(root, WH.friendlyError(e)); }
      }));
    } catch (e) { pane.innerHTML = errorBox(WH.friendlyError(e)); }
  }

  async function moves() {
    pane.innerHTML = loading('Carico movimenti…');
    try {
      const [list, products] = await Promise.all([WH.listMovements(sb, {}), CAT.listProducts(sb, { limit: 1000 })]);
      productMap = Object.fromEntries(products.map((p) => [p.id, p.name]));
      pane.innerHTML = `
        <div class="v2-toolbar">
          <select class="v2-filter" data-ftype><option value="">Tutti i tipi</option>${WH.MOVEMENT_TYPES.map((t) => `<option value="${t}">${WH.TYPE_LABEL[t]}</option>`).join('')}</select>
          ${w ? '<button class="v2-btn" data-new-mov>+ Movimento</button>' : ''}
        </div>
        <div class="v2-table-wrap"><table class="v2-table"><thead><tr>
          <th>Data</th><th>Tipo</th><th>Prodotto</th><th>Delta</th><th>Ubicazione</th></tr></thead>
          <tbody>${renderMovementRows(list, (id) => productMap[id] || id)}</tbody></table></div>`;
      const ft = pane.querySelector('[data-ftype]'); if (ft) ft.addEventListener('change', async () => {
        const l = await WH.listMovements(sb, { type: ft.value });
        pane.querySelector('tbody').innerHTML = renderMovementRows(l, (id) => productMap[id] || id);
      });
      const nm = pane.querySelector('[data-new-mov]'); if (nm) nm.addEventListener('click', () => movementForm(moves));
    } catch (e) { pane.innerHTML = errorBox(WH.friendlyError(e)); }
  }

  async function movementForm(back) {
    let products = [];
    try { products = await CAT.listProducts(sb, { limit: 1000 }); } catch (_) { products = []; }
    const wrap = document.createElement('div'); wrap.innerHTML = renderMovementForm(products);
    pane.appendChild(wrap); wrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    const f = wrap.querySelector('[data-mov-form]');
    wrap.querySelector('[data-mov-cancel]').addEventListener('click', () => wrap.remove());
    f.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const msg = f.querySelector('[data-mov-msg]');
      const data = Object.fromEntries(new FormData(f).entries());
      msg.textContent = 'Registrazione…';
      try { await WH.createMovement(sb, tenantId, data); toast(root, 'Movimento registrato'); back(); }
      catch (e) { msg.textContent = WH.friendlyError(e).includes('permess') ? WH.friendlyError(e) : (e.message || WH.friendlyError(e)); }
    });
  }

  stock();
}
