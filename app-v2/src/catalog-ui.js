// INGLY OS V2 — Catalogo UI (live). Lista/ricerca/filtri/detail/create/edit/
// archivia prodotti e servizi. Stati loading/empty/error, RBAC lato UI, toast.
import * as CAT from './catalog.js';
import { roleForTenant } from './context.js';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const eur = (n) => '€' + (Number(n || 0)).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function renderProductRows(list) {
  if (!list || !list.length) return `<tr><td colspan="6"><div class="v2-empty">Nessun prodotto. Crea il primo prodotto/servizio o modifica i filtri.</div></td></tr>`;
  return list.map((p) => `<tr data-prod="${esc(p.id)}" class="v2-row">
    <td>${esc(p.name)}</td><td>${esc(p.sku || '—')}</td>
    <td><span class="v2-chip">${esc(p.kind === 'service' ? 'servizio' : 'prodotto')}</span></td>
    <td>${esc(p.category || '—')}</td><td class="v2-num">${eur(p.price)}</td>
    <td>${p.active ? '<span class="v2-chip">attivo</span>' : '<span class="v2-muted">disattivo</span>'}</td></tr>`).join('');
}

export function renderProductDetail(p, role) {
  if (!p) return `<div class="v2-empty">Prodotto non trovato.</div>`;
  const w = CAT.canWrite(role); const d = CAT.canDelete(role);
  return `<div class="v2-detail">
    <div class="v2-detail-head"><button class="v2-btn v2-ghost" data-back>← Lista</button>
      <div style="display:flex;gap:8px">
        ${w ? `<button class="v2-btn" data-edit="${esc(p.id)}">Modifica</button>` : ''}
        ${d ? `<button class="v2-btn v2-danger" data-del="${esc(p.id)}">Archivia</button>` : ''}
      </div></div>
    <h2>${esc(p.name)} <span class="v2-chip">${esc(p.kind === 'service' ? 'servizio' : 'prodotto')}</span></h2>
    <div class="v2-kv"><div><span>SKU</span>${esc(p.sku || '—')}</div>
      <div><span>Categoria</span>${esc(p.category || '—')}</div>
      <div><span>Prezzo</span>${eur(p.price)}</div>
      <div><span>Costo</span>${eur(p.cost)}</div>
      <div><span>Margine</span>${CAT.margin(p)}%</div>
      <div><span>Unità</span>${esc(p.unit || 'pz')}</div>
      <div><span>Stato</span>${p.active ? 'attivo' : 'disattivo'}</div></div>
    ${p.notes ? `<p class="v2-notes">${esc(p.notes)}</p>` : ''}</div>`;
}

export function renderProductForm(p) {
  p = p || {};
  const opt = (v, cur) => `<option${cur === v ? ' selected' : ''}>${v}</option>`;
  return `<form class="v2-form" data-prod-form="${esc(p.id || '')}">
    <h2>${p.id ? 'Modifica prodotto/servizio' : 'Nuovo prodotto/servizio'}</h2>
    <label>Nome*<input name="name" required value="${esc(p.name || '')}"></label>
    <div class="v2-form-row">
      <label>SKU<input name="sku" value="${esc(p.sku || '')}"></label>
      <label>Categoria<input name="category" value="${esc(p.category || '')}"></label></div>
    <div class="v2-form-row">
      <label>Tipo<select name="kind"><option${p.kind === 'service' ? '' : ' selected'}>product</option><option${p.kind === 'service' ? ' selected' : ''}>service</option></select></label>
      <label>Unità<select name="unit">${['pz', 'h', 'm', 'm²', 'kg'].map((u) => opt(u, p.unit || 'pz')).join('')}</select></label></div>
    <div class="v2-form-row">
      <label>Prezzo €<input name="price" type="number" step="0.01" value="${esc(p.price != null ? p.price : '')}"></label>
      <label>Costo €<input name="cost" type="number" step="0.01" value="${esc(p.cost != null ? p.cost : '')}"></label></div>
    <label class="v2-chk"><input type="checkbox" name="active" ${p.active === false ? '' : 'checked'}> Attivo</label>
    <label>Note<textarea name="notes">${esc(p.notes || '')}</textarea></label>
    <div class="v2-form-actions"><button type="button" class="v2-btn v2-ghost" data-cancel>Annulla</button>
      <button type="submit" class="v2-btn">Salva</button></div>
    <div class="v2-form-msg" data-msg></div></form>`;
}

const loading = (m) => `<div class="v2-loading">⏳ ${esc(m || 'Caricamento…')}</div>`;
const errorBox = (m) => `<div class="v2-errbox">⚠️ ${esc(m || 'Errore')}</div>`;
const toast = (root, msg) => {
  const t = document.createElement('div'); t.className = 'v2-toast'; t.textContent = msg;
  root.appendChild(t); setTimeout(() => t.remove(), 2600);
};

export function mount(container, { sb, ctx }) {
  if (!container) return;
  const role = roleForTenant(ctx || {}, (ctx || {}).activeTenant) || '—';
  const tenantId = (ctx || {}).activeTenant || null;
  const w = CAT.canWrite(role);
  const root = container.querySelector('[data-catalog-root]') || container;
  root.innerHTML = `<div data-cat-pane></div>`;
  const pane = root.querySelector('[data-cat-pane]');
  const state = { search: '', kind: '' };
  let deb;

  async function list() {
    pane.innerHTML = loading('Carico catalogo…');
    try {
      const items = await CAT.listProducts(sb, state);
      pane.innerHTML = `
        <div class="v2-toolbar">
          <input class="v2-search" data-q placeholder="🔍 Cerca per nome/SKU…" value="${esc(state.search)}">
          <select class="v2-filter" data-fkind><option value="">Tutti</option><option value="product"${state.kind === 'product' ? ' selected' : ''}>Prodotti</option><option value="service"${state.kind === 'service' ? ' selected' : ''}>Servizi</option></select>
          ${w ? '<button class="v2-btn" data-new>+ Nuovo</button>' : '<span class="v2-muted">Sola lettura (ruolo ' + esc(role) + ')</span>'}
        </div>
        <div class="v2-table-wrap"><table class="v2-table"><thead><tr>
          <th>Nome</th><th>SKU</th><th>Tipo</th><th>Categoria</th><th>Prezzo</th><th>Stato</th></tr></thead>
          <tbody>${renderProductRows(items)}</tbody></table></div>`;
      const q = pane.querySelector('[data-q]');
      if (q) q.addEventListener('input', () => { clearTimeout(deb); deb = setTimeout(() => { state.search = q.value; list(); }, 250); });
      const fk = pane.querySelector('[data-fkind]'); if (fk) fk.addEventListener('change', () => { state.kind = fk.value; list(); });
      const nw = pane.querySelector('[data-new]'); if (nw) nw.addEventListener('click', () => form());
      pane.querySelectorAll('[data-prod]').forEach((tr) => tr.addEventListener('click', () => detail(tr.getAttribute('data-prod'))));
    } catch (e) { pane.innerHTML = errorBox(CAT.friendlyError(e)); }
  }

  async function detail(id) {
    pane.innerHTML = loading('Carico scheda…');
    try {
      const p = await CAT.getProduct(sb, id);
      pane.innerHTML = renderProductDetail(p, role);
      pane.querySelector('[data-back]').addEventListener('click', list);
      const ed = pane.querySelector('[data-edit]'); if (ed) ed.addEventListener('click', () => form(p));
      const dl = pane.querySelector('[data-del]'); if (dl) dl.addEventListener('click', async () => {
        if (!window.confirm('Archiviare questo elemento?')) return;
        try { await CAT.softDeleteProduct(sb, id); toast(root, 'Archiviato'); list(); }
        catch (e) { alert(CAT.friendlyError(e)); }
      });
    } catch (e) { pane.innerHTML = errorBox(CAT.friendlyError(e)); }
  }

  function form(p) {
    if (!w) return list();
    pane.innerHTML = renderProductForm(p);
    const f = pane.querySelector('[data-prod-form]');
    pane.querySelector('[data-cancel]').addEventListener('click', () => (p ? detail(p.id) : list()));
    f.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const msg = f.querySelector('[data-msg]');
      const raw = Object.fromEntries(new FormData(f).entries());
      if (!raw.name) { msg.textContent = 'Il nome è obbligatorio.'; return; }
      const data = { name: raw.name, sku: raw.sku || null, category: raw.category || null,
        kind: raw.kind || 'product', unit: raw.unit || 'pz',
        price: Number(raw.price || 0), cost: Number(raw.cost || 0), active: raw.active === 'on',
        notes: raw.notes || null };
      msg.textContent = 'Salvataggio…';
      try {
        if (p && p.id) { await CAT.updateProduct(sb, p.id, data); toast(root, 'Aggiornato'); detail(p.id); }
        else { const out = await CAT.createProduct(sb, tenantId, data); toast(root, 'Creato'); detail(out.id); }
      } catch (e) { msg.textContent = CAT.friendlyError(e); }
    });
  }

  list();
}
