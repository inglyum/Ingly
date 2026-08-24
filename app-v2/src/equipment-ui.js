// INGLY OS V2 — Attrezzature / Macchine UI (live). Anagrafica con tariffa €/min
// che alimenta lo Smart Quoter. Premium, no alert nativi.
import * as EQ from './equipment.js';
import { roleForTenant } from './context.js';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const eur = (n) => '€' + (Number(n || 0)).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
const loading = (m) => `<div class="v2-loading">⏳ ${esc(m || 'Caricamento…')}</div>`;
const errorBox = (m) => `<div class="v2-errbox">⚠️ ${esc(m || 'Errore')}</div>`;
const toast = (root, msg) => { const t = document.createElement('div'); t.className = 'v2-toast'; t.textContent = msg; root.appendChild(t); setTimeout(() => t.remove(), 2600); };

export function renderRows(list) {
  if (!list || !list.length) return `<tr><td colspan="5"><div class="v2-empty">Nessuna macchina. Aggiungine una per usarla nel Quoter.</div></td></tr>`;
  return list.map((e) => `<tr>
    <td>${esc(e.name)}</td><td>${esc(e.category || '—')}</td>
    <td class="v2-num">${eur(EQ.costPerMin(e))}/min</td>
    <td>${e.active ? '<span class="v2-chip v2-ok">Attiva</span>' : '<span class="v2-chip">Off</span>'}</td>
    <td><button class="v2-btn v2-xs" data-edit="${esc(e.id)}">Modifica</button>
      <button class="v2-btn v2-xs v2-danger" data-del="${esc(e.id)}">🗑</button></td></tr>`).join('');
}

export function renderForm(e) {
  e = e || {};
  return `<form class="v2-form" data-eq-form="${esc(e.id || '')}">
    <h3>${e.id ? 'Modifica macchina' : 'Nuova macchina'}</h3>
    <label>Nome*<input name="name" required value="${esc(e.name || '')}" placeholder="Es. xTool P2 / Roland UV"></label>
    <div class="v2-form-row">
      <label>Categoria<input name="category" value="${esc(e.category || '')}" placeholder="laser/uv/cnc"></label>
      <label>Costo €/min<input name="cost_per_min" type="number" step="0.0001" value="${esc(e.cost_per_min != null ? e.cost_per_min : 0)}"></label></div>
    <div class="v2-form-row">
      <label>Costo €/h (opz.)<input name="hourly_cost" type="number" step="0.01" value="${esc(e.hourly_cost != null ? e.hourly_cost : '')}"></label>
      <label>Potenza W (opz.)<input name="power_w" type="number" step="1" value="${esc(e.power_w != null ? e.power_w : '')}"></label></div>
    <label><input type="checkbox" name="active" ${e.active === false ? '' : 'checked'}> Attiva</label>
    <label>Note<textarea name="notes">${esc(e.notes || '')}</textarea></label>
    <div class="v2-form-actions"><button type="button" class="v2-btn v2-ghost" data-cancel>Annulla</button>
      <button type="submit" class="v2-btn">${e.id ? 'Salva' : 'Crea'}</button></div>
    <div class="v2-form-msg" data-msg></div></form>`;
}

export function mount(container, { sb, ctx }) {
  if (!container) return;
  const role = roleForTenant(ctx || {}, (ctx || {}).activeTenant) || '—';
  const w = EQ.canWrite(role);
  const tenantId = (ctx || {}).activeTenant || null;
  const root = container.querySelector('[data-equipment-root]') || container;
  root.innerHTML = `<div data-eq-pane>${loading('Carico macchine…')}</div>`;
  const pane = root.querySelector('[data-eq-pane]');

  async function list() {
    pane.innerHTML = loading('Carico macchine…');
    try {
      const rows = await EQ.listEquipment(sb, {});
      pane.innerHTML = `
        <div class="v2-toolbar">${w ? '<button class="v2-btn" data-new>+ Nuova macchina</button>' : ''}
          <span class="v2-muted">${rows.length} macchine · usate come risorsa nel Quoter (Laser/Macchina)</span></div>
        <div class="v2-table-wrap"><table class="v2-table"><thead><tr>
          <th>Nome</th><th>Categoria</th><th>Tariffa</th><th>Stato</th><th></th></tr></thead>
          <tbody>${renderRows(rows)}</tbody></table></div>`;
      const nw = pane.querySelector('[data-new]'); if (nw) nw.addEventListener('click', () => form());
      pane.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', async () => { const r = (await EQ.listEquipment(sb, {})).find((x) => String(x.id) === b.getAttribute('data-edit')); form(r); }));
      pane.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => { try { await EQ.softDeleteEquipment(sb, b.getAttribute('data-del')); toast(root, 'Eliminata'); list(); } catch (e) { toast(root, EQ.friendlyError(e)); } }));
    } catch (e) { pane.innerHTML = errorBox(EQ.friendlyError(e)); }
  }

  function form(e) {
    pane.innerHTML = renderForm(e);
    const f = pane.querySelector('[data-eq-form]');
    pane.querySelector('[data-cancel]').addEventListener('click', list);
    f.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const data = Object.fromEntries(new FormData(f).entries());
      data.active = f.querySelector('[name="active"]').checked;
      const msg = f.querySelector('[data-msg]');
      try { if (e && e.id) await EQ.updateEquipment(sb, e.id, data); else await EQ.createEquipment(sb, tenantId, data); toast(root, 'Salvato'); list(); }
      catch (err) { msg.textContent = EQ.friendlyError(err); }
    });
  }
  list();
}
