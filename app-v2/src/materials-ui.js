// INGLY OS V2 — Materiali UI (master-data). Elenco con stock reale + campi
// materiale, creazione/modifica. Un materiale È un catalog_product kind='material'
// → stesso stock/acquisti/quoter/produzione. Premium, no alert nativi.
import * as MAT from './materials.js';
import { listSuppliers } from './suppliers.js';
import { roleForTenant } from './context.js';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const eur = (n) => '€' + (Number(n || 0)).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const loading = (m) => `<div class="v2-loading">⏳ ${esc(m || 'Caricamento…')}</div>`;
const errorBox = (m) => `<div class="v2-errbox">⚠️ ${esc(m || 'Errore')}</div>`;
const toast = (root, msg) => { const t = document.createElement('div'); t.className = 'v2-toast'; t.textContent = msg; root.appendChild(t); setTimeout(() => t.remove(), 2600); };

export function renderRows(list) {
  if (!list || !list.length) return `<tr><td colspan="7"><div class="v2-empty">Nessun materiale. Aggiungine uno: sarà usabile in Magazzino, Acquisti, Quoter e Produzione.</div></td></tr>`;
  return list.map((m) => `<tr class="${m.below ? 'v2-row-warn' : ''}">
    <td>${esc(m.name)}${m.sku ? ` <span class="v2-muted">${esc(m.sku)}</span>` : ''}</td>
    <td>${esc(m.material_type || m.category || '—')}</td>
    <td class="v2-num">${m.cost_per_mq != null ? eur(m.cost_per_mq) + '/mq' : (m.cost_per_kg != null ? eur(m.cost_per_kg) + '/kg' : eur(m.cost))}</td>
    <td class="v2-num">${m.onHand}${m.unit ? ' ' + esc(m.unit) : ''}${m.below ? ' ⚠️' : ''}</td>
    <td class="v2-num">${m.available}</td>
    <td class="v2-num">${eur(m.stockValue)}</td>
    <td><button class="v2-btn v2-xs" data-edit="${esc(m.id)}">Modifica</button>
      <button class="v2-btn v2-xs v2-danger" data-del="${esc(m.id)}">🗑</button></td></tr>`).join('');
}

export function renderForm(m, suppliers) {
  m = m || {};
  const supOpts = (suppliers || []).map((s) => `<option value="${esc(s.id)}"${m.supplier_id === s.id ? ' selected' : ''}>${esc(s.name)}</option>`).join('');
  return `<form class="v2-form" data-mat-form="${esc(m.id || '')}">
    <h3>${m.id ? 'Modifica materiale' : 'Nuovo materiale'}</h3>
    <div class="v2-form-row">
      <label>Nome*<input name="name" required value="${esc(m.name || '')}" placeholder="Es. MDF 6mm"></label>
      <label>SKU<input name="sku" value="${esc(m.sku || '')}"></label></div>
    <div class="v2-form-row">
      <label>Tipo materiale<input name="material_type" value="${esc(m.material_type || '')}" placeholder="MDF/plexi/acciaio"></label>
      <label>Sottocategoria<input name="subcategory" value="${esc(m.subcategory || '')}"></label></div>
    <div class="v2-form-row">
      <label>Unità<input name="unit" value="${esc(m.unit || 'mq')}"></label>
      <label>Costo unitario €<input name="cost" type="number" step="0.01" value="${esc(m.cost != null ? m.cost : 0)}"></label></div>
    <div class="v2-form-row">
      <label>Costo €/mq<input name="cost_per_mq" type="number" step="0.01" value="${esc(m.cost_per_mq != null ? m.cost_per_mq : '')}"></label>
      <label>Costo €/kg<input name="cost_per_kg" type="number" step="0.01" value="${esc(m.cost_per_kg != null ? m.cost_per_kg : '')}"></label></div>
    <label>Fornitore<select name="supplier_id"><option value="">— nessuno —</option>${supOpts}</select></label>
    <div class="v2-form-row">
      <label>Scorta minima<input name="min_stock" type="number" step="0.01" value="${esc(m.min_stock != null ? m.min_stock : '')}"></label>
      <label>Reorder point<input name="reorder_point" type="number" step="0.01" value="${esc(m.reorder_point != null ? m.reorder_point : '')}"></label></div>
    <label>Note tecniche<textarea name="notes">${esc(m.notes || '')}</textarea></label>
    <label><input type="checkbox" name="active" ${m.active === false ? '' : 'checked'}> Attivo</label>
    <div class="v2-form-actions"><button type="button" class="v2-btn v2-ghost" data-cancel>Annulla</button>
      <button type="submit" class="v2-btn">${m.id ? 'Salva' : 'Crea'}</button></div>
    <div class="v2-form-msg" data-msg></div></form>`;
}

export function mount(container, { sb, ctx }) {
  if (!container) return;
  const role = roleForTenant(ctx || {}, (ctx || {}).activeTenant) || '—';
  const w = MAT.canWrite(role);
  const tenantId = (ctx || {}).activeTenant || null;
  const root = container.querySelector('[data-materials-root]') || container;
  root.innerHTML = `<div data-mat-pane>${loading('Carico materiali…')}</div>`;
  const pane = root.querySelector('[data-mat-pane]');
  let suppliers = [];

  async function list() {
    pane.innerHTML = loading('Carico materiali…');
    try {
      const rows = await MAT.listMaterials(sb, {});
      const below = rows.filter((m) => m.below).length;
      const totVal = rows.reduce((s, m) => s + m.stockValue, 0);
      pane.innerHTML = `
        <div class="v2-toolbar">${w ? '<button class="v2-btn" data-new>+ Nuovo materiale</button>' : ''}
          <span class="v2-muted">${rows.length} materiali · ${below} sotto scorta · valore ${eur(totVal)}</span></div>
        <div class="v2-table-wrap"><table class="v2-table"><thead><tr>
          <th>Materiale</th><th>Tipo</th><th>Costo</th><th>Giacenza</th><th>Disp.</th><th>Valore</th><th></th></tr></thead>
          <tbody>${renderRows(rows)}</tbody></table></div>`;
      const nw = pane.querySelector('[data-new]'); if (nw) nw.addEventListener('click', () => form());
      pane.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', async () => { const m = await MAT.getMaterial(sb, b.getAttribute('data-edit')); form(m); }));
      pane.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => { try { await MAT.softDeleteMaterial(sb, b.getAttribute('data-del')); toast(root, 'Archiviato'); list(); } catch (e) { toast(root, MAT.friendlyError(e)); } }));
    } catch (e) { pane.innerHTML = errorBox(MAT.friendlyError(e)); }
  }

  async function form(m) {
    if (!suppliers.length) { try { suppliers = await listSuppliers(sb, { limit: 500 }); } catch (_) { suppliers = []; } }
    pane.innerHTML = renderForm(m, suppliers);
    const f = pane.querySelector('[data-mat-form]');
    pane.querySelector('[data-cancel]').addEventListener('click', list);
    f.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const data = Object.fromEntries(new FormData(f).entries());
      data.active = f.querySelector('[name="active"]').checked;
      const msg = f.querySelector('[data-msg]');
      try { if (m && m.id) await MAT.updateMaterial(sb, m.id, data); else await MAT.createMaterial(sb, tenantId, data); toast(root, 'Salvato'); list(); }
      catch (err) { msg.textContent = MAT.friendlyError(err); }
    });
  }
  list();
}
