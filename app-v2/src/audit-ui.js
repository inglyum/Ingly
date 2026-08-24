// INGLY OS V2 — Audit Log UI (sola lettura). Elenco filtrabile delle operazioni
// tracciate. Accesso riservato a OWNER/ADMIN (RLS lato server).
import * as AUD from './audit.js';
import { canEditSettings } from './settings.js';
import { roleForTenant } from './context.js';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dt = (s) => esc((s || '').replace('T', ' ').slice(0, 16));
const short = (id) => esc(String(id || '').slice(0, 8));
const loading = (m) => `<div class="v2-loading">⏳ ${esc(m || 'Caricamento…')}</div>`;
const errorBox = (m) => `<div class="v2-errbox">⚠️ ${esc(m || 'Errore')}</div>`;

const OP_CLASS = { INSERT: 'v2-ok', UPDATE: '', DELETE: 'v2-bad' };

export function renderRows(list) {
  if (!list || !list.length) return `<tr><td colspan="5"><div class="v2-empty">Nessuna operazione registrata.</div></td></tr>`;
  return list.map((e) => `<tr>
    <td>${dt(e.at)}</td>
    <td>${esc(AUD.tableLabel(e.table_name))}</td>
    <td><span class="v2-chip ${OP_CLASS[e.op] || ''}">${esc(AUD.opLabel(e.op))}</span></td>
    <td class="v2-muted">${short(e.row_id)}</td>
    <td class="v2-muted">${short(e.actor) || '—'}</td></tr>`).join('');
}

export function mount(container, { sb, ctx }) {
  if (!container) return;
  const role = roleForTenant(ctx || {}, (ctx || {}).activeTenant) || '—';
  const root = container.querySelector('[data-audit-root]') || container;
  if (!canEditSettings(role)) { root.innerHTML = `<div class="v2-note">🔒 L'audit log è riservato a OWNER/ADMIN.</div>`; return; }
  root.innerHTML = `<div data-audit-pane>${loading('Carico audit…')}</div>`;
  const pane = root.querySelector('[data-audit-pane]');
  const state = { table: '', op: '' };

  async function list() {
    pane.innerHTML = loading('Carico audit…');
    try {
      const rows = await AUD.listAudit(sb, state);
      const tblOpts = Object.entries(AUD.TABLE_LABEL).map(([k, v]) => `<option value="${k}"${state.table === k ? ' selected' : ''}>${esc(v)}</option>`).join('');
      const opOpts = Object.entries(AUD.OP_LABEL).map(([k, v]) => `<option value="${k}"${state.op === k ? ' selected' : ''}>${esc(v)}</option>`).join('');
      pane.innerHTML = `
        <div class="v2-toolbar">
          <select class="v2-filter" data-ftable><option value="">Tutte le entità</option>${tblOpts}</select>
          <select class="v2-filter" data-fop><option value="">Tutte le operazioni</option>${opOpts}</select>
          <span class="v2-muted">${rows.length} operazioni</span>
        </div>
        <div class="v2-table-wrap"><table class="v2-table"><thead><tr>
          <th>Quando</th><th>Entità</th><th>Operazione</th><th>Record</th><th>Utente</th></tr></thead>
          <tbody>${renderRows(rows)}</tbody></table></div>`;
      const ft = pane.querySelector('[data-ftable]'); if (ft) ft.addEventListener('change', () => { state.table = ft.value; list(); });
      const fo = pane.querySelector('[data-fop]'); if (fo) fo.addEventListener('change', () => { state.op = fo.value; list(); });
    } catch (e) { pane.innerHTML = errorBox(AUD.friendlyError(e)); }
  }
  list();
}
