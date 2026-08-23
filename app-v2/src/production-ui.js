// INGLY OS V2 — Produzione UI (live). Schede: Ordini produzione + Distinte base.
// Ordine: prodotto + qtà + BOM → "Completa" consuma componenti e carica finito.
import * as PRD from './production.js';
import * as CAT from './catalog.js';
import { roleForTenant } from './context.js';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const day = (s) => esc((s || '').slice(0, 10));
const SL = { PLANNED: 'Pianificato', IN_PROGRESS: 'In corso', DONE: 'Completato', CANCELLED: 'Annullato' };

export function renderPOrderRows(list, pname) {
  if (!list || !list.length) return `<tr><td colspan="5"><div class="v2-empty">Nessun ordine di produzione. Creane uno.</div></td></tr>`;
  return list.map((o) => `<tr data-po="${esc(o.id)}" class="v2-row">
    <td>${esc(o.number || '—')}</td><td>${esc(pname ? pname(o.product_id) : o.product_id)}</td>
    <td class="v2-num">${o.quantity}</td><td><span class="v2-chip">${esc(SL[o.status] || o.status)}</span></td>
    <td>${day(o.due_date)}</td></tr>`).join('');
}

export function renderPOrderDetail(bundle, role, pname) {
  const o = bundle.order;
  if (!o) return `<div class="v2-empty">Ordine di produzione non trovato.</div>`;
  const w = PRD.canWrite(role); const d = PRD.canDelete(role);
  const comps = (bundle.components || []).map((c) => `<li>${esc(pname ? pname(c.component_product_id) : c.component_product_id)} × ${c.quantity} <span class="v2-muted">(tot ${(Number(c.quantity) || 0) * (Number(o.quantity) || 0)})</span></li>`).join('') || '<li class="v2-muted">Nessun componente (BOM non associata).</li>';
  const statusOpts = PRD.PRODUCTION_STATUSES.map((s) => `<option value="${s}"${o.status === s ? ' selected' : ''}>${SL[s]}</option>`).join('');
  return `<div class="v2-detail">
    <div class="v2-detail-head"><button class="v2-btn v2-ghost" data-back>← Lista</button>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${w && o.status !== 'DONE' && o.status !== 'CANCELLED' ? `<button class="v2-btn" data-complete="${esc(o.id)}">✅ Completa (scarica/carica)</button>` : ''}
        ${d ? `<button class="v2-btn v2-danger" data-del="${esc(o.id)}">Archivia</button>` : ''}
      </div></div>
    <h2>${esc(o.number || '')} · ${esc(pname ? pname(o.product_id) : '')} <span class="v2-chip">${esc(SL[o.status] || o.status)}</span></h2>
    <div class="v2-kv"><div><span>Quantità</span>${o.quantity}</div>
      <div><span>Scadenza</span>${day(o.due_date)}</div>
      <div><span>Distinta</span>${o.bom_id ? 'sì' : '—'}</div>
      <div><span>Stato</span>${w ? `<select class="v2-filter" data-status>${statusOpts}</select>` : esc(SL[o.status] || o.status)}</div></div>
    <div class="v2-card"><h3>Componenti da consumare</h3><ul class="v2-list">${comps}</ul></div>
    ${o.notes ? `<p class="v2-notes">${esc(o.notes)}</p>` : ''}</div>`;
}

export function renderBomRows(list, pname) {
  if (!list || !list.length) return `<tr><td colspan="3"><div class="v2-empty">Nessuna distinta base. Creane una.</div></td></tr>`;
  return list.map((b) => `<tr data-bom="${esc(b.id)}" class="v2-row">
    <td>${esc(b.name)}</td><td>${esc(pname ? pname(b.product_id) : b.product_id)}</td>
    <td>${b.active === false ? '<span class="v2-muted">inattiva</span>' : '<span class="v2-chip">attiva</span>'}</td></tr>`).join('');
}

const loading = (m) => `<div class="v2-loading">⏳ ${esc(m || 'Caricamento…')}</div>`;
const errorBox = (m) => `<div class="v2-errbox">⚠️ ${esc(m || 'Errore')}</div>`;
const toast = (root, msg) => { const t = document.createElement('div'); t.className = 'v2-toast'; t.textContent = msg; root.appendChild(t); setTimeout(() => t.remove(), 2600); };

export function mount(container, { sb, ctx }) {
  if (!container) return;
  const role = roleForTenant(ctx || {}, (ctx || {}).activeTenant) || '—';
  const tenantId = (ctx || {}).activeTenant || null;
  const w = PRD.canWrite(role);
  const root = container.querySelector('[data-production-root]') || container;
  root.innerHTML = `
    <div class="v2-tabs" data-prd-tabs>
      <button class="v2-tab active" data-prd-tab="orders">🏭 Ordini produzione</button>
      <button class="v2-tab" data-prd-tab="bom">📋 Distinte base</button>
    </div>
    <div data-prd-pane>${loading('Inizializzazione…')}</div>`;
  const pane = root.querySelector('[data-prd-pane]');
  let productMap = {};
  async function products() { if (!Object.keys(productMap).length) { const ps = await CAT.listProducts(sb, { limit: 1000 }).catch(() => []); productMap = Object.fromEntries(ps.map((p) => [p.id, p.name])); return ps; } const ps = await CAT.listProducts(sb, { limit: 1000 }).catch(() => []); return ps; }
  const pname = (id) => productMap[id] || id;
  root.querySelectorAll('[data-prd-tab]').forEach((b) => b.addEventListener('click', () => {
    root.querySelectorAll('[data-prd-tab]').forEach((x) => x.classList.toggle('active', x === b));
    b.getAttribute('data-prd-tab') === 'orders' ? orders() : boms();
  }));

  // ═══ ORDINI PRODUZIONE ═══
  async function orders() {
    pane.innerHTML = loading('Carico ordini…');
    try {
      await products();
      const list = await PRD.listProductionOrders(sb, {});
      pane.innerHTML = `
        <div class="v2-toolbar">${w ? '<button class="v2-btn" data-new>+ Nuovo ordine</button>' : '<span class="v2-muted">Sola lettura</span>'}</div>
        <div class="v2-table-wrap"><table class="v2-table"><thead><tr><th>Numero</th><th>Prodotto</th><th>Qtà</th><th>Stato</th><th>Scadenza</th></tr></thead>
          <tbody>${renderPOrderRows(list, pname)}</tbody></table></div>`;
      const nw = pane.querySelector('[data-new]'); if (nw) nw.addEventListener('click', () => orderForm());
      pane.querySelectorAll('[data-po]').forEach((tr) => tr.addEventListener('click', () => orderDetail(tr.getAttribute('data-po'))));
    } catch (e) { pane.innerHTML = errorBox(PRD.friendlyError(e)); }
  }
  async function orderForm() {
    if (!w) return orders();
    const ps = await products();
    const opts = ps.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');
    pane.innerHTML = `<form class="v2-form" data-po-form>
      <h2>Nuovo ordine di produzione</h2>
      <label>Prodotto finito*<select name="product_id" required><option value="">— seleziona —</option>${opts}</select></label>
      <div class="v2-form-row"><label>Quantità<input name="quantity" type="number" step="1" value="1"></label>
        <label>Scadenza<input name="due_date" type="date"></label></div>
      <label>Note<textarea name="notes"></textarea></label>
      <div class="v2-form-actions"><button type="button" class="v2-btn v2-ghost" data-cancel>Annulla</button><button type="submit" class="v2-btn">Crea</button></div>
      <div class="v2-form-msg" data-msg></div></form>`;
    const f = pane.querySelector('[data-po-form]');
    pane.querySelector('[data-cancel]').addEventListener('click', orders);
    f.addEventListener('submit', async (ev) => {
      ev.preventDefault(); const msg = f.querySelector('[data-msg]');
      const data = Object.fromEntries(new FormData(f).entries());
      if (!data.product_id) { msg.textContent = 'Seleziona il prodotto.'; return; }
      msg.textContent = 'Creazione…';
      try { data.bom_id = await PRD.bomForProduct(sb, data.product_id); const out = await PRD.createProductionOrder(sb, tenantId, data); toast(root, 'Ordine creato'); orderDetail(out.id); }
      catch (e) { msg.textContent = PRD.friendlyError(e); }
    });
  }
  async function orderDetail(id) {
    pane.innerHTML = loading('Carico ordine…');
    try {
      await products();
      const bundle = await PRD.getProductionOrder(sb, id);
      pane.innerHTML = renderPOrderDetail(bundle, role, pname);
      pane.querySelector('[data-back]').addEventListener('click', orders);
      const st = pane.querySelector('[data-status]'); if (st) st.addEventListener('change', async () => { try { await PRD.changeStatus(sb, id, st.value); toast(root, 'Stato aggiornato'); orderDetail(id); } catch (e) { alert(PRD.friendlyError(e)); } });
      const cp = pane.querySelector('[data-complete]'); if (cp) cp.addEventListener('click', async () => {
        if (!window.confirm('Completare la produzione? Verranno consumati i componenti e caricato il prodotto finito a magazzino.')) return;
        try { const r = await PRD.completeProduction(sb, tenantId, id); toast(root, `Completato: ${r.consumed} componenti consumati, ${r.produced} prodotti a magazzino`); orderDetail(id); }
        catch (e) { alert(PRD.friendlyError(e)); }
      });
      const dl = pane.querySelector('[data-del]'); if (dl) dl.addEventListener('click', async () => { if (!window.confirm('Archiviare questo ordine di produzione?')) return; try { await PRD.softDeleteProductionOrder(sb, id); toast(root, 'Archiviato'); orders(); } catch (e) { alert(PRD.friendlyError(e)); } });
    } catch (e) { pane.innerHTML = errorBox(PRD.friendlyError(e)); }
  }

  // ═══ DISTINTE BASE ═══
  async function boms() {
    pane.innerHTML = loading('Carico distinte…');
    try {
      await products();
      const list = await PRD.listBoms(sb, {});
      pane.innerHTML = `
        <div class="v2-toolbar">${w ? '<button class="v2-btn" data-new-bom>+ Nuova distinta</button>' : '<span class="v2-muted">Sola lettura</span>'}</div>
        <div class="v2-table-wrap"><table class="v2-table"><thead><tr><th>Nome</th><th>Prodotto finito</th><th>Stato</th></tr></thead>
          <tbody>${renderBomRows(list, pname)}</tbody></table></div>`;
      const nb = pane.querySelector('[data-new-bom]'); if (nb) nb.addEventListener('click', () => bomForm());
      pane.querySelectorAll('[data-bom]').forEach((tr) => tr.addEventListener('click', () => bomDetail(tr.getAttribute('data-bom'))));
    } catch (e) { pane.innerHTML = errorBox(PRD.friendlyError(e)); }
  }
  async function bomForm() {
    if (!w) return boms();
    const ps = await products();
    const opts = ps.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');
    pane.innerHTML = `<form class="v2-form" data-bom-form>
      <h2>Nuova distinta base</h2>
      <label>Nome*<input name="name" required></label>
      <label>Prodotto finito*<select name="product_id" required><option value="">— seleziona —</option>${opts}</select></label>
      <div class="v2-form-actions"><button type="button" class="v2-btn v2-ghost" data-cancel>Annulla</button><button type="submit" class="v2-btn">Crea</button></div>
      <div class="v2-form-msg" data-msg></div></form>`;
    const f = pane.querySelector('[data-bom-form]');
    pane.querySelector('[data-cancel]').addEventListener('click', boms);
    f.addEventListener('submit', async (ev) => { ev.preventDefault(); const msg = f.querySelector('[data-msg]'); const data = Object.fromEntries(new FormData(f).entries());
      if (!data.name || !data.product_id) { msg.textContent = 'Nome e prodotto obbligatori.'; return; }
      try { const out = await PRD.createBom(sb, tenantId, data); toast(root, 'Distinta creata'); bomDetail(out.id); } catch (e) { msg.textContent = PRD.friendlyError(e); } });
  }
  async function bomDetail(id) {
    pane.innerHTML = loading('Carico distinta…');
    try {
      const ps = await products();
      const bundle = await PRD.getBom(sb, id);
      const b = bundle.bom;
      const lines = bundle.lines.map((l) => `<li class="v2-li-act"><span>${esc(pname(l.component_product_id))} × ${l.quantity}</span>${w ? `<span class="v2-li-btns"><button class="v2-btn v2-xs v2-danger" data-del-line="${esc(l.id)}">🗑</button></span>` : ''}</li>`).join('') || '<li class="v2-muted">Nessun componente.</li>';
      const opts = ps.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');
      pane.innerHTML = `<div class="v2-detail">
        <div class="v2-detail-head"><button class="v2-btn v2-ghost" data-back>← Distinte</button></div>
        <h2>📋 ${esc(b.name)} <span class="v2-muted">→ ${esc(pname(b.product_id))}</span></h2>
        <div class="v2-card"><h3>Componenti</h3><ul class="v2-list">${lines}</ul>
          ${w ? `<form class="v2-form" data-line-form><div class="v2-form-row">
            <label>Componente<select name="component_product_id">${opts}</select></label>
            <label>Quantità<input name="quantity" type="number" step="0.01" value="1"></label></div>
            <div class="v2-form-actions"><button type="submit" class="v2-btn v2-sm">+ Aggiungi componente</button></div></form>` : ''}</div></div>`;
      pane.querySelector('[data-back]').addEventListener('click', boms);
      pane.querySelectorAll('[data-del-line]').forEach((x) => x.addEventListener('click', async () => { try { await PRD.deleteBomLine(sb, x.getAttribute('data-del-line')); bomDetail(id); } catch (e) { alert(PRD.friendlyError(e)); } }));
      const lf = pane.querySelector('[data-line-form]'); if (lf) lf.addEventListener('submit', async (ev) => { ev.preventDefault(); const data = Object.fromEntries(new FormData(lf).entries()); try { await PRD.addBomLine(sb, tenantId, id, data); bomDetail(id); } catch (e) { alert(PRD.friendlyError(e)); } });
    } catch (e) { pane.innerHTML = errorBox(PRD.friendlyError(e)); }
  }

  orders();
}
