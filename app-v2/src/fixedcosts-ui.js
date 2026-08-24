// INGLY OS V2 — Costi fissi UI (live). Burn mensile/annuo, break-even, elenco
// con creazione/modifica. Premium, no alert nativi.
import * as FC from './fixedcosts.js';
import { roleForTenant } from './context.js';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const eur = (n) => '€' + (Number(n || 0)).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const loading = (m) => `<div class="v2-loading">⏳ ${esc(m || 'Caricamento…')}</div>`;
const errorBox = (m) => `<div class="v2-errbox">⚠️ ${esc(m || 'Errore')}</div>`;
const toast = (root, msg) => { const t = document.createElement('div'); t.className = 'v2-toast'; t.textContent = msg; root.appendChild(t); setTimeout(() => t.remove(), 2600); };

export function renderSummary(sum) {
  return `<div class="v2-grid">
    <div class="v2-kpi"><div class="v2-kpi-l">Burn mensile</div><div class="v2-kpi-v">${eur(sum.monthlyBurn)}</div></div>
    <div class="v2-kpi"><div class="v2-kpi-l">Costo annuo</div><div class="v2-kpi-v">${eur(sum.annualBurn)}</div></div>
    <div class="v2-kpi"><div class="v2-kpi-l">Voci attive</div><div class="v2-kpi-v">${sum.count}</div></div>
    <div class="v2-kpi"><div class="v2-kpi-l">Break-even <span class="v2-muted">(ticket €45)</span></div>
      <div class="v2-kpi-v">${sum.breakEvenOrders != null ? sum.breakEvenOrders + ' ordini/mese' : '—'}</div></div>
  </div>`;
}

export function renderRows(list) {
  if (!list || !list.length) return `<tr><td colspan="6"><div class="v2-empty">Nessun costo fisso. Aggiungine uno.</div></td></tr>`;
  return list.map((r) => `<tr>
    <td>${esc(r.name)}</td><td>${esc(r.category || '—')}</td>
    <td class="v2-num">${eur(r.amount)}</td><td>${esc(FC.CADENCE_LABEL[r.cadence] || r.cadence)}</td>
    <td class="v2-num">${eur(FC.monthlyAmount(r.amount, r.cadence))}/mese</td>
    <td><button class="v2-btn v2-xs" data-edit="${esc(r.id)}">Modifica</button>
      <button class="v2-btn v2-xs v2-danger" data-del="${esc(r.id)}">🗑</button></td></tr>`).join('');
}

export function renderForm(r) {
  r = r || {};
  const cad = FC.CADENCES.map((c) => `<option value="${c}"${r.cadence === c ? ' selected' : ''}>${esc(FC.CADENCE_LABEL[c])}</option>`).join('');
  return `<form class="v2-form" data-fc-form="${esc(r.id || '')}">
    <h3>${r.id ? 'Modifica costo fisso' : 'Nuovo costo fisso'}</h3>
    <label>Nome*<input name="name" required value="${esc(r.name || '')}"></label>
    <div class="v2-form-row">
      <label>Categoria<input name="category" value="${esc(r.category || '')}" placeholder="Affitto, Software…"></label>
      <label>Importo €<input name="amount" type="number" step="0.01" value="${esc(r.amount != null ? r.amount : 0)}"></label></div>
    <label>Cadenza<select name="cadence">${cad}</select></label>
    <label><input type="checkbox" name="active" ${r.active === false ? '' : 'checked'}> Attivo</label>
    <label>Note<textarea name="notes">${esc(r.notes || '')}</textarea></label>
    <div class="v2-form-actions"><button type="button" class="v2-btn v2-ghost" data-cancel>Annulla</button>
      <button type="submit" class="v2-btn">${r.id ? 'Salva' : 'Crea'}</button></div>
    <div class="v2-form-msg" data-msg></div></form>`;
}

export function mount(container, { sb, ctx }) {
  if (!container) return;
  const role = roleForTenant(ctx || {}, (ctx || {}).activeTenant) || '—';
  const w = FC.canWrite(role);
  const tenantId = (ctx || {}).activeTenant || null;
  const root = container.querySelector('[data-fixedcosts-root]') || container;
  root.innerHTML = `<div data-fc-pane>${loading('Carico costi fissi…')}</div>`;
  const pane = root.querySelector('[data-fc-pane]');

  async function list() {
    pane.innerHTML = loading('Carico costi fissi…');
    try {
      const rows = await FC.listFixedCosts(sb, {});
      const sum = FC.summarize(rows, 45); // ticket medio KB €45
      pane.innerHTML = `
        ${renderSummary(sum)}
        <div class="v2-toolbar">${w ? '<button class="v2-btn" data-new>+ Nuovo costo</button>' : ''}
          <span class="v2-muted">${sum.count} voci attive · ${eur(sum.monthlyBurn)}/mese</span></div>
        <div class="v2-table-wrap"><table class="v2-table"><thead><tr>
          <th>Nome</th><th>Categoria</th><th>Importo</th><th>Cadenza</th><th>Mensile</th><th></th></tr></thead>
          <tbody>${renderRows(rows)}</tbody></table></div>`;
      const nw = pane.querySelector('[data-new]'); if (nw) nw.addEventListener('click', () => form());
      pane.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', async () => { const r = (await FC.listFixedCosts(sb, {})).find((x) => String(x.id) === b.getAttribute('data-edit')); form(r); }));
      pane.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => { try { await FC.softDeleteFixedCost(sb, b.getAttribute('data-del')); toast(root, 'Eliminato'); list(); } catch (e) { toast(root, FC.friendlyError(e)); } }));
    } catch (e) { pane.innerHTML = errorBox(FC.friendlyError(e)); }
  }

  function form(r) {
    pane.innerHTML = renderForm(r);
    const f = pane.querySelector('[data-fc-form]');
    pane.querySelector('[data-cancel]').addEventListener('click', list);
    f.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const data = Object.fromEntries(new FormData(f).entries());
      data.active = f.querySelector('[name="active"]').checked;
      const msg = f.querySelector('[data-msg]');
      try {
        if (r && r.id) await FC.updateFixedCost(sb, r.id, data); else await FC.createFixedCost(sb, tenantId, data);
        toast(root, 'Salvato'); list();
      } catch (e) { msg.textContent = FC.friendlyError(e); }
    });
  }
  list();
}
