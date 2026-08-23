// INGLY OS V2 — Fatture ricorrenti UI (live). Lista template + scadenze,
// creazione/modifica, "Genera ora" e "Genera scadute". Premium, no alert nativi.
import * as REC from './recurring.js';
import * as CRM from './crm.js';
import { roleForTenant } from './context.js';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const eur = (n) => '€' + (Number(n || 0)).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const day = (s) => esc((s || '').slice(0, 10));
const loading = (m) => `<div class="v2-loading">⏳ ${esc(m || 'Caricamento…')}</div>`;
const errorBox = (m) => `<div class="v2-errbox">⚠️ ${esc(m || 'Errore')}</div>`;
const toast = (root, msg) => { const t = document.createElement('div'); t.className = 'v2-toast'; t.textContent = msg; root.appendChild(t); setTimeout(() => t.remove(), 2600); };
const today = () => new Date().toISOString().slice(0, 10);

export function renderRows(list) {
  if (!list || !list.length) return `<tr><td colspan="7"><div class="v2-empty">Nessun template ricorrente. Creane uno.</div></td></tr>`;
  const t = today();
  return list.map((r) => {
    const due = r.active && String(r.next_run_date) <= t;
    return `<tr class="${due ? 'v2-row-warn' : ''}">
      <td>${esc(r.description)}</td><td>${esc(r.customer_name || '—')}</td>
      <td class="v2-num">${eur(r.amount)}</td><td>${esc(REC.CADENCE_LABEL[r.cadence] || r.cadence)}</td>
      <td>${day(r.next_run_date)}${due ? ' ⚠️' : ''}</td>
      <td><span class="v2-chip">${r.active ? 'Attivo' : 'Sospeso'}</span></td>
      <td style="display:flex;gap:6px;flex-wrap:wrap">
        <button class="v2-btn v2-xs" data-gen="${esc(r.id)}">Genera ora</button>
        <button class="v2-btn v2-xs" data-edit="${esc(r.id)}">Modifica</button>
      </td></tr>`;
  }).join('');
}

export function renderForm(r, customers) {
  r = r || {};
  const opts = (customers || []).map((c) => `<option value="${esc(c.id)}"${r.customer_id === c.id ? ' selected' : ''}>${esc(c.name)}</option>`).join('');
  const cad = REC.CADENCES.map((c) => `<option value="${c}"${r.cadence === c ? ' selected' : ''}>${esc(REC.CADENCE_LABEL[c])}</option>`).join('');
  return `<form class="v2-form" data-rec-form="${esc(r.id || '')}">
    <h3>${r.id ? 'Modifica template' : 'Nuovo template ricorrente'}</h3>
    <label>Descrizione*<input name="description" required value="${esc(r.description || '')}"></label>
    <label>Cliente<select name="customer_id"><option value="">— nessuno —</option>${opts}</select></label>
    <div class="v2-form-row">
      <label>Imponibile €<input name="amount" type="number" step="0.01" value="${esc(r.amount != null ? r.amount : 0)}"></label>
      <label>IVA %<input name="vat_rate" type="number" step="0.01" value="${esc(r.vat_rate != null ? r.vat_rate : 22)}"></label></div>
    <div class="v2-form-row">
      <label>Cadenza<select name="cadence">${cad}</select></label>
      <label>Prossima emissione<input name="next_run_date" type="date" value="${esc((r.next_run_date || today()).slice(0, 10))}"></label></div>
    <label><input type="checkbox" name="active" ${r.active === false ? '' : 'checked'}> Attivo</label>
    <label>Note<textarea name="notes">${esc(r.notes || '')}</textarea></label>
    <div class="v2-form-actions"><button type="button" class="v2-btn v2-ghost" data-cancel>Annulla</button>
      <button type="submit" class="v2-btn">${r.id ? 'Salva' : 'Crea'}</button></div>
    <div class="v2-form-msg" data-msg></div></form>`;
}

export function mount(container, { sb, ctx }) {
  if (!container) return;
  const role = roleForTenant(ctx || {}, (ctx || {}).activeTenant) || '—';
  const w = CRM.canWrite(role);
  const tenantId = (ctx || {}).activeTenant || null;
  const root = container.querySelector('[data-recurring-root]') || container;
  root.innerHTML = `<div data-rec-pane>${loading('Carico ricorrenti…')}</div>`;
  const pane = root.querySelector('[data-rec-pane]');
  let customers = [];

  async function list() {
    pane.innerHTML = loading('Carico ricorrenti…');
    try {
      const [rows] = await Promise.all([REC.listRecurring(sb, {})]);
      const dueCount = REC.dueList(rows).length;
      pane.innerHTML = `
        <div class="v2-toolbar">
          ${w ? '<button class="v2-btn" data-new>+ Nuovo template</button>' : ''}
          ${w && dueCount ? `<button class="v2-btn" data-gen-due>⚡ Genera ${dueCount} scadute</button>` : ''}
          <span class="v2-muted">${rows.length} template · ${dueCount} scadute</span>
        </div>
        <div class="v2-table-wrap"><table class="v2-table"><thead><tr>
          <th>Descrizione</th><th>Cliente</th><th>Imponibile</th><th>Cadenza</th><th>Prossima</th><th>Stato</th><th></th></tr></thead>
          <tbody>${renderRows(rows)}</tbody></table></div>`;
      const nw = pane.querySelector('[data-new]'); if (nw) nw.addEventListener('click', () => form());
      const gd = pane.querySelector('[data-gen-due]'); if (gd) gd.addEventListener('click', async () => {
        gd.disabled = true;
        try { const n = await REC.generateDue(sb, tenantId); toast(root, n + ' fatture generate'); list(); }
        catch (e) { toast(root, REC.friendlyError(e)); gd.disabled = false; }
      });
      pane.querySelectorAll('[data-gen]').forEach((b) => b.addEventListener('click', async () => {
        b.disabled = true;
        try { const inv = await REC.generateOne(sb, tenantId, b.getAttribute('data-gen')); toast(root, 'Fattura ' + (inv.number || '') + ' generata'); list(); }
        catch (e) { toast(root, REC.friendlyError(e)); b.disabled = false; }
      }));
      pane.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', async () => {
        const r = await REC.getRecurring(sb, b.getAttribute('data-edit')); form(r);
      }));
    } catch (e) { pane.innerHTML = errorBox(REC.friendlyError(e)); }
  }

  async function form(r) {
    if (!customers.length) { try { customers = await CRM.listCustomers(sb, { limit: 500 }); } catch (_) { customers = []; } }
    pane.innerHTML = renderForm(r, customers);
    const f = pane.querySelector('[data-rec-form]');
    pane.querySelector('[data-cancel]').addEventListener('click', list);
    f.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const fd = new FormData(f); const data = Object.fromEntries(fd.entries());
      data.active = f.querySelector('[name="active"]').checked;
      if (data.customer_id) { const c = customers.find((x) => String(x.id) === String(data.customer_id)); data.customer_name = c ? c.name : null; }
      const msg = f.querySelector('[data-msg]');
      try {
        if (r && r.id) { await REC.updateRecurring(sb, r.id, data); toast(root, 'Template aggiornato'); }
        else { await REC.createRecurring(sb, tenantId, data); toast(root, 'Template creato'); }
        list();
      } catch (e) { msg.textContent = REC.friendlyError(e); }
    });
    const del = pane.querySelector('[data-del]');
    if (del && r && r.id) del.addEventListener('click', async () => { try { await REC.softDeleteRecurring(sb, r.id); toast(root, 'Archiviato'); list(); } catch (e) { toast(root, REC.friendlyError(e)); } });
  }

  list();
}
