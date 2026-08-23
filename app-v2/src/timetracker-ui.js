// INGLY OS V2 — Time Tracker UI (live). Registro ore con riepilogo (totali,
// fatturabili, valore) e KPI ore fatturabili settimana (KB ≥15h). Premium.
import * as TT from './timetracker.js';
import * as CRM from './crm.js';
import { listProjects } from './projects.js';
import { roleForTenant } from './context.js';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const eur = (n) => '€' + (Number(n || 0)).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const day = (s) => esc((s || '').slice(0, 10));
const hm = (min) => { const m = Number(min) || 0; return Math.floor(m / 60) + 'h' + String(m % 60).padStart(2, '0'); };
const loading = (m) => `<div class="v2-loading">⏳ ${esc(m || 'Caricamento…')}</div>`;
const errorBox = (m) => `<div class="v2-errbox">⚠️ ${esc(m || 'Errore')}</div>`;
const toast = (root, msg) => { const t = document.createElement('div'); t.className = 'v2-toast'; t.textContent = msg; root.appendChild(t); setTimeout(() => t.remove(), 2600); };
const iso = (d) => d.toISOString().slice(0, 10);

export function renderSummary(sum, weekHours) {
  const kpiOk = weekHours >= 15;
  return `<div class="v2-grid">
    <div class="v2-kpi"><div class="v2-kpi-l">Ore totali</div><div class="v2-kpi-v">${sum.totalHours}h</div></div>
    <div class="v2-kpi"><div class="v2-kpi-l">Ore fatturabili</div><div class="v2-kpi-v">${sum.billableHours}h</div></div>
    <div class="v2-kpi"><div class="v2-kpi-l">Valore fatturabile</div><div class="v2-kpi-v">${eur(sum.billableValue)}</div></div>
    <div class="v2-kpi"><div class="v2-kpi-l">Ore fatturabili settimana <span class="v2-muted">(KB ≥15h)</span></div>
      <div class="v2-kpi-v ${kpiOk ? 'v2-ok' : 'v2-bad'}">${weekHours}h ${kpiOk ? '✅' : '⚠️'}</div></div>
  </div>`;
}

export function renderRows(list, projById) {
  if (!list || !list.length) return `<tr><td colspan="6"><div class="v2-empty">Nessuna registrazione. Aggiungi le tue ore.</div></td></tr>`;
  return list.map((e) => `<tr>
    <td>${day(e.entry_date)}</td><td>${esc(e.description)}</td>
    <td>${esc(e.project_id && projById[e.project_id] ? projById[e.project_id] : '—')}</td>
    <td class="v2-num">${hm(e.minutes)}</td>
    <td>${e.billable ? '<span class="v2-chip v2-ok">Fatturabile</span>' : '<span class="v2-chip">No</span>'}</td>
    <td><button class="v2-btn v2-xs v2-danger" data-del="${esc(e.id)}">🗑</button></td></tr>`).join('');
}

export function mount(container, { sb, ctx }) {
  if (!container) return;
  const role = roleForTenant(ctx || {}, (ctx || {}).activeTenant) || '—';
  const w = CRM.canWrite(role);
  const tenantId = (ctx || {}).activeTenant || null;
  const root = container.querySelector('[data-timetracker-root]') || container;
  root.innerHTML = `<div data-tt-pane>${loading('Carico ore…')}</div>`;
  const pane = root.querySelector('[data-tt-pane]');
  let projects = [];

  function weekRange() { const now = new Date(); const f = new Date(now); f.setDate(now.getDate() - 6); return { from: iso(f), to: iso(now) }; }

  async function list() {
    pane.innerHTML = loading('Carico ore…');
    try {
      if (!projects.length) { try { projects = await listProjects(sb, { limit: 500 }); } catch (_) { projects = []; } }
      const projById = Object.fromEntries(projects.map((p) => [p.id, p.name || p.code || p.id]));
      const entries = await TT.listEntries(sb, {});
      const sum = TT.summarize(entries);
      const wr = weekRange(); const weekHours = TT.billableHours(entries, wr.from, wr.to);
      const projOpts = projects.map((p) => `<option value="${esc(p.id)}">${esc(p.name || p.code || p.id)}</option>`).join('');
      pane.innerHTML = `
        ${renderSummary(sum, weekHours)}
        ${w ? `<form class="v2-form v2-form-inline" data-tt-form>
          <input name="description" placeholder="Attività*" required>
          <select name="project_id"><option value="">— commessa —</option>${projOpts}</select>
          <input name="entry_date" type="date" value="${iso(new Date())}">
          <input name="minutes" type="number" min="0" step="15" placeholder="Minuti" value="60" style="width:90px">
          <input name="hourly_rate" type="number" min="0" step="1" value="18" style="width:80px" title="€/h">
          <label class="v2-inline-check"><input type="checkbox" name="billable" checked> Fatt.</label>
          <button type="submit" class="v2-btn">+ Ore</button>
        </form>` : ''}
        <div class="v2-table-wrap"><table class="v2-table"><thead><tr>
          <th>Data</th><th>Attività</th><th>Commessa</th><th>Durata</th><th>Fatt.</th><th></th></tr></thead>
          <tbody>${renderRows(entries, projById)}</tbody></table></div>`;
      const f = pane.querySelector('[data-tt-form]');
      if (f) f.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const data = Object.fromEntries(new FormData(f).entries());
        data.billable = f.querySelector('[name="billable"]').checked;
        try { await TT.createEntry(sb, tenantId, data); toast(root, 'Ore registrate'); list(); }
        catch (e) { toast(root, TT.friendlyError(e)); }
      });
      pane.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
        try { await TT.softDeleteEntry(sb, b.getAttribute('data-del')); toast(root, 'Eliminata'); list(); }
        catch (e) { toast(root, TT.friendlyError(e)); }
      }));
    } catch (e) { pane.innerHTML = errorBox(TT.friendlyError(e)); }
  }
  list();
}
