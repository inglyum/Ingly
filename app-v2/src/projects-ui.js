// INGLY OS V2 — Progetti/Commesse UI (live). Lista/ricerca/filtro stato, nuovo
// (cliente), dettaglio con economics (ricavi/costi/margine derivati), task board
// con avanzamento, cambio stato, archivia.
import * as PRJ from './projects.js';
import * as CRM from './crm.js';
import { roleForTenant } from './context.js';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const eur = (n) => '€' + (Number(n || 0)).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const day = (s) => esc((s || '').slice(0, 10));
const SL = { PLANNED: 'Pianificata', ACTIVE: 'Attiva', ON_HOLD: 'In pausa', COMPLETED: 'Completata', CANCELLED: 'Annullata' };
const TL = { TODO: 'Da fare', DOING: 'In corso', DONE: 'Fatto' };

export function renderProjectRows(list) {
  if (!list || !list.length) return `<tr><td colspan="6"><div class="v2-empty">Nessuna commessa. Crea la prima o modifica i filtri.</div></td></tr>`;
  return list.map((p) => `<tr data-prj="${esc(p.id)}" class="v2-row">
    <td>${esc(p.code || '—')}</td><td>${esc(p.name)}</td><td>${esc(p.customer_name || '—')}</td>
    <td><span class="v2-chip">${esc(SL[p.status] || p.status)}</span></td>
    <td>${day(p.due_date)}</td><td class="v2-num">${eur(p.budget)}</td></tr>`).join('');
}

export function renderProjectDetail(bundle, role) {
  const p = bundle.project;
  if (!p) return `<div class="v2-empty">Commessa non trovata.</div>`;
  const w = PRJ.canWrite(role); const d = PRJ.canDelete(role);
  const ec = bundle.economics; const prog = bundle.progress;
  const marginTone = ec.margin >= 0 ? '#4ade80' : '#f87171';
  const tasks = (bundle.tasks || []).map((t) => `<li class="v2-li-act" data-task="${esc(t.id)}">
    <span><b>${esc(t.title)}</b>${t.assignee ? ' · ' + esc(t.assignee) : ''}${t.due_date ? ' · ' + day(t.due_date) : ''} <span class="v2-chip">${esc(TL[t.status] || t.status)}</span></span>
    ${w ? `<span class="v2-li-btns">
      <button class="v2-btn v2-xs" data-task-next="${esc(t.id)}" data-cur="${esc(t.status)}">▶</button>
      <button class="v2-btn v2-xs v2-danger" data-task-del="${esc(t.id)}">🗑</button></span>` : ''}</li>`).join('') || '<li class="v2-muted">Nessuna attività.</li>';
  const statusOpts = PRJ.PROJECT_STATUSES.map((s) => `<option value="${s}"${p.status === s ? ' selected' : ''}>${SL[s]}</option>`).join('');
  return `<div class="v2-detail">
    <div class="v2-detail-head"><button class="v2-btn v2-ghost" data-back>← Lista</button>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${w ? `<button class="v2-btn" data-edit="${esc(p.id)}">Modifica</button>` : ''}
        ${d ? `<button class="v2-btn v2-danger" data-del="${esc(p.id)}">Archivia</button>` : ''}
      </div></div>
    <h2>${esc(p.code || '')} · ${esc(p.name)} <span class="v2-chip">${esc(SL[p.status] || p.status)}</span></h2>
    <div class="v2-kv"><div><span>Cliente</span>${esc(p.customer_name || '—')}</div>
      <div><span>Inizio</span>${day(p.start_date)}</div>
      <div><span>Scadenza</span>${day(p.due_date)}</div>
      <div><span>Stato</span>${w ? `<select class="v2-filter" data-status>${statusOpts}</select>` : esc(SL[p.status] || p.status)}</div></div>
    <div class="v2-grid">
      <div class="v2-kpi"><div class="v2-kpi-l">Budget</div><div class="v2-kpi-v">${eur(ec.budget)}</div></div>
      <div class="v2-kpi"><div class="v2-kpi-l">Ricavi (ordini)</div><div class="v2-kpi-v">${eur(ec.revenue)}</div></div>
      <div class="v2-kpi"><div class="v2-kpi-l">Costi (acquisti)</div><div class="v2-kpi-v">${eur(ec.cost)}</div></div>
      <div class="v2-kpi"><div class="v2-kpi-l">Margine</div><div class="v2-kpi-v" style="color:${marginTone}">${eur(ec.margin)} · ${ec.marginPct}%</div></div>
    </div>
    <div class="v2-card">
      <h3>Avanzamento · ${prog}%</h3>
      <div class="prj-bar"><div class="prj-bar-fill" style="width:${prog}%"></div></div>
      <ul class="v2-list">${tasks}</ul>
      ${w ? '<button class="v2-btn v2-sm" data-add-task>+ Attività</button>' : ''}
    </div>
    ${p.notes ? `<p class="v2-notes">${esc(p.notes)}</p>` : ''}</div>`;
}

export function renderProjectForm(p, customers) {
  p = p || {};
  const opts = (customers || []).map((c) => `<option value="${esc(c.id)}"${p.customer_id === c.id ? ' selected' : ''}>${esc(c.name)}</option>`).join('');
  return `<form class="v2-form" data-prj-form="${esc(p.id || '')}">
    <h2>${p.id ? 'Modifica commessa' : 'Nuova commessa'}</h2>
    <label>Nome*<input name="name" required value="${esc(p.name || '')}"></label>
    <label>Cliente<select name="customer_id"><option value="">— nessuno —</option>${opts}</select></label>
    <div class="v2-form-row">
      <label>Inizio<input name="start_date" type="date" value="${esc(p.start_date || '')}"></label>
      <label>Scadenza<input name="due_date" type="date" value="${esc(p.due_date || '')}"></label>
      <label>Budget €<input name="budget" type="number" step="0.01" value="${esc(p.budget != null ? p.budget : '')}"></label></div>
    <label>Note<textarea name="notes">${esc(p.notes || '')}</textarea></label>
    <div class="v2-form-actions"><button type="button" class="v2-btn v2-ghost" data-cancel>Annulla</button>
      <button type="submit" class="v2-btn">Salva</button></div>
    <div class="v2-form-msg" data-msg></div></form>`;
}

const loading = (m) => `<div class="v2-loading">⏳ ${esc(m || 'Caricamento…')}</div>`;
const errorBox = (m) => `<div class="v2-errbox">⚠️ ${esc(m || 'Errore')}</div>`;
const toast = (root, msg) => { const t = document.createElement('div'); t.className = 'v2-toast'; t.textContent = msg; root.appendChild(t); setTimeout(() => t.remove(), 2600); };
const nextStatus = (cur) => (cur === 'TODO' ? 'DOING' : cur === 'DOING' ? 'DONE' : 'TODO');

export function mount(container, { sb, ctx }) {
  if (!container) return;
  const role = roleForTenant(ctx || {}, (ctx || {}).activeTenant) || '—';
  const tenantId = (ctx || {}).activeTenant || null;
  const w = PRJ.canWrite(role);
  const root = container.querySelector('[data-projects-root]') || container;
  root.innerHTML = `<div data-prj-pane></div>`;
  const pane = root.querySelector('[data-prj-pane]');
  const state = { search: '', status: '' };
  let deb;

  async function list() {
    pane.innerHTML = loading('Carico commesse…');
    try {
      const items = await PRJ.listProjects(sb, state);
      pane.innerHTML = `
        <div class="v2-toolbar">
          <input class="v2-search" data-q placeholder="🔍 Cerca per codice/nome/cliente…" value="${esc(state.search)}">
          <select class="v2-filter" data-fstatus><option value="">Tutti gli stati</option>${PRJ.PROJECT_STATUSES.map((s) => `<option value="${s}"${state.status === s ? ' selected' : ''}>${SL[s]}</option>`).join('')}</select>
          ${w ? '<button class="v2-btn" data-new>+ Nuova commessa</button>' : '<span class="v2-muted">Sola lettura</span>'}
        </div>
        <div class="v2-table-wrap"><table class="v2-table"><thead><tr>
          <th>Codice</th><th>Nome</th><th>Cliente</th><th>Stato</th><th>Scadenza</th><th>Budget</th></tr></thead>
          <tbody>${renderProjectRows(items)}</tbody></table></div>`;
      const q = pane.querySelector('[data-q]');
      if (q) q.addEventListener('input', () => { clearTimeout(deb); deb = setTimeout(() => { state.search = q.value; list(); }, 250); });
      const fs = pane.querySelector('[data-fstatus]'); if (fs) fs.addEventListener('change', () => { state.status = fs.value; list(); });
      const nw = pane.querySelector('[data-new]'); if (nw) nw.addEventListener('click', () => form());
      pane.querySelectorAll('[data-prj]').forEach((tr) => tr.addEventListener('click', () => detail(tr.getAttribute('data-prj'))));
    } catch (e) { pane.innerHTML = errorBox(PRJ.friendlyError(e)); }
  }

  async function form(existing) {
    if (!w) return list();
    pane.innerHTML = loading('Carico clienti…');
    let customers = [];
    try { customers = await CRM.listCustomers(sb, { limit: 500 }); } catch (_) { customers = []; }
    pane.innerHTML = renderProjectForm(existing, customers);
    const f = pane.querySelector('[data-prj-form]');
    pane.querySelector('[data-cancel]').addEventListener('click', () => (existing ? detail(existing.id) : list()));
    f.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const msg = f.querySelector('[data-msg]');
      const data = Object.fromEntries(new FormData(f).entries());
      if (!data.name) { msg.textContent = 'Il nome è obbligatorio.'; return; }
      if (data.customer_id) { const sel = f.querySelector('select[name="customer_id"]'); data.customer_name = sel.options[sel.selectedIndex].textContent; }
      msg.textContent = 'Salvataggio…';
      try {
        if (existing && existing.id) { await PRJ.updateProject(sb, existing.id, data); toast(root, 'Commessa aggiornata'); detail(existing.id); }
        else { const out = await PRJ.createProject(sb, tenantId, data); toast(root, 'Commessa creata'); detail(out.id); }
      } catch (e) { msg.textContent = PRJ.friendlyError(e); }
    });
  }

  async function detail(id) {
    pane.innerHTML = loading('Carico commessa…');
    try {
      const bundle = await PRJ.getProject(sb, id);
      pane.innerHTML = renderProjectDetail(bundle, role);
      pane.querySelector('[data-back]').addEventListener('click', list);
      const ed = pane.querySelector('[data-edit]'); if (ed) ed.addEventListener('click', () => form(bundle.project));
      const dl = pane.querySelector('[data-del]'); if (dl) dl.addEventListener('click', async () => {
        if (!window.confirm('Archiviare questa commessa?')) return;
        try { await PRJ.softDeleteProject(sb, id); toast(root, 'Archiviata'); list(); }
        catch (e) { alert(PRJ.friendlyError(e)); }
      });
      const st = pane.querySelector('[data-status]'); if (st) st.addEventListener('change', async () => {
        try { await PRJ.changeStatus(sb, id, st.value); toast(root, 'Stato aggiornato'); detail(id); }
        catch (e) { alert(PRJ.friendlyError(e)); }
      });
      pane.querySelectorAll('[data-task-next]').forEach((b) => b.addEventListener('click', async () => {
        try { await PRJ.setTaskStatus(sb, b.getAttribute('data-task-next'), nextStatus(b.getAttribute('data-cur'))); detail(id); }
        catch (e) { alert(PRJ.friendlyError(e)); }
      }));
      pane.querySelectorAll('[data-task-del]').forEach((b) => b.addEventListener('click', async () => {
        try { await PRJ.deleteTask(sb, b.getAttribute('data-task-del')); detail(id); }
        catch (e) { alert(PRJ.friendlyError(e)); }
      }));
      const at = pane.querySelector('[data-add-task]'); if (at) at.addEventListener('click', async () => {
        const title = window.prompt('Titolo attività:'); if (!title) return;
        try { await PRJ.addTask(sb, tenantId, id, { title }); detail(id); }
        catch (e) { alert(PRJ.friendlyError(e)); }
      });
    } catch (e) { pane.innerHTML = errorBox(PRJ.friendlyError(e)); }
  }

  list();
}
