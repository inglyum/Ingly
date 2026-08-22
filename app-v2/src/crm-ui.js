// INGLY OS V2 — CRM UI (live). Collega la vista CRM a Supabase: lista, ricerca,
// filtri, dettaglio, create/edit, azienda, contatti, attività. Stati
// loading/error/empty. RBAC lato UI (RLS è il confine reale).
import * as CRM from './crm.js';
import { roleForTenant } from './context.js';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const eur = (n) => '€' + (Number(n || 0)).toLocaleString('it-IT', { maximumFractionDigits: 0 });

// ── render puri (testabili) ────────────────────────────────────────────────
export function renderCustomerRows(list) {
  if (!list || !list.length) return `<tr><td colspan="6"><div class="v2-empty">Nessun cliente. Crea il primo cliente o modifica i filtri.</div></td></tr>`;
  return list.map((c) => `<tr data-cust="${esc(c.id)}" class="v2-row">
    <td>${esc(c.name)}</td><td>${esc(c.email || '—')}</td><td>${esc(c.phone || '—')}</td>
    <td>${esc(c.segment || '—')}</td><td><span class="v2-chip">${esc(c.type || 'B2C')}</span></td>
    <td class="v2-num">${eur(c.value_cached)}</td></tr>`).join('');
}

export function renderCustomerDetail(bundle, role) {
  const c = bundle.customer;
  if (!c) return `<div class="v2-empty">Cliente non trovato.</div>`;
  const w = CRM.canWrite(role);
  const d = CRM.canDelete(role);
  const contacts = (bundle.contacts || []).map((k) =>
    `<li>${esc(k.name)}${k.role ? ' · ' + esc(k.role) : ''}${k.email ? ' · ' + esc(k.email) : ''}</li>`).join('') || '<li class="v2-muted">Nessun contatto.</li>';
  const acts = (bundle.activities || []).map((a) =>
    `<li><b>${esc(a.type)}</b> — ${esc(a.body || '')} <span class="v2-muted">${esc((a.occurred_at || '').slice(0, 10))}</span></li>`).join('') || '<li class="v2-muted">Nessuna attività.</li>';
  return `<div class="v2-detail">
    <div class="v2-detail-head"><button class="v2-btn v2-ghost" data-back>← Lista</button>
      <div style="display:flex;gap:8px">
        ${w ? `<button class="v2-btn" data-edit="${esc(c.id)}">Modifica</button>` : ''}
        ${d ? `<button class="v2-btn v2-danger" data-del="${esc(c.id)}">Elimina</button>` : ''}
      </div></div>
    <h2>${esc(c.name)} <span class="v2-chip">${esc(c.type)}</span></h2>
    <div class="v2-kv"><div><span>Email</span>${esc(c.email || '—')}</div>
      <div><span>Telefono</span>${esc(c.phone || '—')}</div>
      <div><span>Segmento</span>${esc(c.segment || '—')}</div>
      <div><span>Valore</span>${eur(c.value_cached)}</div></div>
    ${c.notes ? `<p class="v2-notes">${esc(c.notes)}</p>` : ''}
    <div class="v2-cols">
      <div class="v2-card"><h3>Contatti</h3><ul class="v2-list">${contacts}</ul>
        ${w ? `<button class="v2-btn v2-sm" data-add-contact="${esc(c.id)}">+ Contatto</button>` : ''}</div>
      <div class="v2-card"><h3>Attività</h3><ul class="v2-list">${acts}</ul>
        ${w ? `<button class="v2-btn v2-sm" data-add-activity="${esc(c.id)}">+ Attività</button>` : ''}</div>
    </div></div>`;
}

export function renderForm(role, c) {
  c = c || {};
  return `<form class="v2-form" data-cust-form="${esc(c.id || '')}">
    <h2>${c.id ? 'Modifica cliente' : 'Nuovo cliente'}</h2>
    <label>Nome*<input name="name" required value="${esc(c.name || '')}"></label>
    <div class="v2-form-row">
      <label>Email<input name="email" type="email" value="${esc(c.email || '')}"></label>
      <label>Telefono<input name="phone" value="${esc(c.phone || '')}"></label></div>
    <div class="v2-form-row">
      <label>Tipo<select name="type"><option${c.type === 'B2B' ? '' : ' selected'}>B2C</option><option${c.type === 'B2B' ? ' selected' : ''}>B2B</option></select></label>
      <label>Segmento<input name="segment" value="${esc(c.segment || '')}"></label></div>
    <label>Note<textarea name="notes">${esc(c.notes || '')}</textarea></label>
    <div class="v2-form-actions"><button type="button" class="v2-btn v2-ghost" data-cancel>Annulla</button>
      <button type="submit" class="v2-btn">Salva</button></div>
    <div class="v2-form-msg" data-msg></div></form>`;
}

const loading = (m) => `<div class="v2-loading">⏳ ${esc(m || 'Caricamento…')}</div>`;
const errorBox = (m) => `<div class="v2-errbox">⚠️ ${esc(m || 'Errore')}</div>`;

// ── mount (runtime) ─────────────────────────────────────────────────────────
export function mount(container, { sb, ctx }) {
  if (!container) return;
  const role = roleForTenant(ctx || {}, (ctx || {}).activeTenant) || '—';
  const tenantId = (ctx || {}).activeTenant || null;
  const w = CRM.canWrite(role);
  const state = { search: '', segment: '', type: '' };

  const pane = container.querySelector('[data-crm-pane]') || container;

  async function showList() {
    pane.innerHTML = loading('Carico clienti…');
    try {
      const list = await CRM.listCustomers(sb, state);
      pane.innerHTML = `
        <div class="v2-toolbar">
          <input class="v2-search" data-q placeholder="🔍 Cerca cliente per nome/email…" value="${esc(state.search)}">
          <select class="v2-filter" data-fsegment><option value="">Tutti i segmenti</option></select>
          <select class="v2-filter" data-ftype><option value="">Tutti</option><option value="B2C">B2C</option><option value="B2B">B2B</option></select>
          ${w ? '<button class="v2-btn" data-new>+ Nuovo cliente</button>' : '<span class="v2-muted">Sola lettura (ruolo ' + esc(role) + ')</span>'}
        </div>
        <div class="v2-table-wrap"><table class="v2-table"><thead><tr>
          <th>Nome</th><th>Email</th><th>Telefono</th><th>Segmento</th><th>Tipo</th><th>Valore</th></tr></thead>
          <tbody>${renderCustomerRows(list)}</tbody></table></div>`;
      wireList();
    } catch (e) { pane.innerHTML = errorBox(CRM.friendlyError(e)); }
  }

  let deb;
  function wireList() {
    const q = pane.querySelector('[data-q]');
    if (q) q.addEventListener('input', () => { clearTimeout(deb); deb = setTimeout(() => { state.search = q.value; showList(); }, 250); });
    const fs = pane.querySelector('[data-fsegment]'); if (fs) fs.addEventListener('change', () => { state.segment = fs.value; showList(); });
    const ft = pane.querySelector('[data-ftype]'); if (ft) ft.addEventListener('change', () => { state.type = ft.value; showList(); });
    const nw = pane.querySelector('[data-new]'); if (nw) nw.addEventListener('click', () => showForm());
    pane.querySelectorAll('[data-cust]').forEach((tr) => tr.addEventListener('click', () => showDetail(tr.getAttribute('data-cust'))));
  }

  async function showDetail(id) {
    pane.innerHTML = loading('Carico scheda…');
    try {
      const bundle = await CRM.getCustomer(sb, id);
      pane.innerHTML = renderCustomerDetail(bundle, role);
      pane.querySelector('[data-back]').addEventListener('click', showList);
      const ed = pane.querySelector('[data-edit]'); if (ed) ed.addEventListener('click', () => showForm(bundle.customer));
      const dl = pane.querySelector('[data-del]'); if (dl) dl.addEventListener('click', async () => {
        if (!window.confirm('Eliminare (soft-delete) questo cliente?')) return;
        try { await CRM.softDeleteCustomer(sb, id); await showList(); }
        catch (e) { alert(CRM.friendlyError(e)); }
      });
      const ac = pane.querySelector('[data-add-contact]'); if (ac) ac.addEventListener('click', () => quickAdd('contact', id));
      const aa = pane.querySelector('[data-add-activity]'); if (aa) aa.addEventListener('click', () => quickAdd('activity', id));
    } catch (e) { pane.innerHTML = errorBox(CRM.friendlyError(e)); }
  }

  function showForm(c) {
    if (!w) return showList();
    pane.innerHTML = renderForm(role, c);
    const form = pane.querySelector('[data-cust-form]');
    pane.querySelector('[data-cancel]').addEventListener('click', () => (c ? showDetail(c.id) : showList()));
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const msg = form.querySelector('[data-msg]');
      const data = Object.fromEntries(new FormData(form).entries());
      if (!data.name) { msg.textContent = 'Il nome è obbligatorio.'; return; }
      msg.textContent = 'Salvataggio…';
      try {
        if (c && c.id) { await CRM.updateCustomer(sb, c.id, data); await showDetail(c.id); }
        else { const out = await CRM.createCustomer(sb, tenantId, data); await showDetail(out.id); }
      } catch (e) { msg.textContent = CRM.friendlyError(e); }
    });
  }

  async function quickAdd(kind, id) {
    const val = window.prompt(kind === 'contact' ? 'Nome contatto:' : 'Attività (nota):');
    if (!val) return;
    try {
      if (kind === 'contact') await CRM.addContact(sb, tenantId, id, { name: val });
      else await CRM.addActivity(sb, tenantId, id, { type: 'note', body: val });
      await showDetail(id);
    } catch (e) { alert(CRM.friendlyError(e)); }
  }

  showList();
}
