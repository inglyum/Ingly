// INGLY OS V2 — CRM UI (live). CRM a schede: Clienti · Aziende · Attività.
// Collega la vista a Supabase: lista, ricerca, filtri, dettaglio, create/edit,
// archiviazione, contatti, attività. Stati loading/error/empty. RBAC lato UI
// (RLS è il confine reale). Attività = log immutabile (Phase 14): solo create+read.
import * as CRM from './crm.js';
import { roleForTenant } from './context.js';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const eur = (n) => '€' + (Number(n || 0)).toLocaleString('it-IT', { maximumFractionDigits: 0 });
const day = (s) => esc((s || '').slice(0, 10));

// ── render puri (testabili) ────────────────────────────────────────────────
export function renderCustomerRows(list) {
  if (!list || !list.length) return `<tr><td colspan="6"><div class="v2-empty">Nessun cliente. Crea il primo cliente o modifica i filtri.</div></td></tr>`;
  return list.map((c) => `<tr data-cust="${esc(c.id)}" class="v2-row">
    <td>${esc(c.name)}</td><td>${esc(c.email || '—')}</td><td>${esc(c.phone || '—')}</td>
    <td>${esc(c.segment || '—')}</td><td><span class="v2-chip">${esc(c.type || 'B2C')}</span></td>
    <td class="v2-num">${eur(c.value_cached)}</td></tr>`).join('');
}

export function renderCompanyRows(list) {
  if (!list || !list.length) return `<tr><td colspan="3"><div class="v2-empty">Nessuna azienda. Crea la prima azienda o modifica la ricerca.</div></td></tr>`;
  return list.map((c) => `<tr data-company="${esc(c.id)}" class="v2-row">
    <td>${esc(c.name)}</td><td>${esc(c.vat || '—')}</td>
    <td>${(c.tags || []).map((t) => `<span class="v2-chip">${esc(t)}</span>`).join(' ') || '—'}</td></tr>`).join('');
}

export function renderActivityRows(list) {
  if (!list || !list.length) return `<div class="v2-empty">Nessuna attività registrata.</div>`;
  return `<ul class="v2-list">${list.map((a) =>
    `<li><span class="v2-chip">${esc(a.type)}</span> ${esc(a.body || '')} <span class="v2-muted">${day(a.occurred_at)}</span></li>`).join('')}</ul>`;
}

export function renderCustomerDetail(bundle, role) {
  const c = bundle.customer;
  if (!c) return `<div class="v2-empty">Cliente non trovato.</div>`;
  const w = CRM.canWrite(role);
  const d = CRM.canDelete(role);
  const contacts = (bundle.contacts || []).map((k) =>
    `<li class="v2-li-act"><span>${esc(k.name)}${k.role ? ' · ' + esc(k.role) : ''}${k.email ? ' · ' + esc(k.email) : ''}${k.phone ? ' · ' + esc(k.phone) : ''}</span>
      ${w ? `<span class="v2-li-btns"><button class="v2-btn v2-xs" data-edit-contact="${esc(k.id)}">✏️</button>${d ? `<button class="v2-btn v2-xs v2-danger" data-del-contact="${esc(k.id)}">🗑</button>` : ''}</span>` : ''}</li>`).join('') || '<li class="v2-muted">Nessun contatto.</li>';
  const acts = (bundle.activities || []).map((a) =>
    `<li><b>${esc(a.type)}</b> — ${esc(a.body || '')} <span class="v2-muted">${day(a.occurred_at)}</span></li>`).join('') || '<li class="v2-muted">Nessuna attività.</li>';
  return `<div class="v2-detail">
    <div class="v2-detail-head"><button class="v2-btn v2-ghost" data-back>← Lista</button>
      <div style="display:flex;gap:8px">
        ${w ? `<button class="v2-btn" data-edit="${esc(c.id)}">Modifica</button>` : ''}
        ${d ? `<button class="v2-btn v2-danger" data-del="${esc(c.id)}">Archivia</button>` : ''}
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

export function renderCompanyDetail(bundle, role) {
  const c = bundle.company;
  if (!c) return `<div class="v2-empty">Azienda non trovata.</div>`;
  const w = CRM.canWrite(role); const d = CRM.canDelete(role);
  const custs = (bundle.customers || []).map((x) =>
    `<li>${esc(x.name)} <span class="v2-chip">${esc(x.type)}</span> <span class="v2-muted">${eur(x.value_cached)}</span></li>`).join('') || '<li class="v2-muted">Nessun cliente collegato.</li>';
  return `<div class="v2-detail">
    <div class="v2-detail-head"><button class="v2-btn v2-ghost" data-back>← Lista</button>
      <div style="display:flex;gap:8px">
        ${w ? `<button class="v2-btn" data-edit-company="${esc(c.id)}">Modifica</button>` : ''}
        ${d ? `<button class="v2-btn v2-danger" data-del-company="${esc(c.id)}">Archivia</button>` : ''}
      </div></div>
    <h2>🏢 ${esc(c.name)}</h2>
    <div class="v2-kv"><div><span>P.IVA</span>${esc(c.vat || '—')}</div>
      <div><span>Tag</span>${(c.tags || []).map((t) => esc(t)).join(', ') || '—'}</div></div>
    <div class="v2-card"><h3>Clienti collegati</h3><ul class="v2-list">${custs}</ul></div></div>`;
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

export function renderCompanyForm(c) {
  c = c || {};
  return `<form class="v2-form" data-company-form="${esc(c.id || '')}">
    <h2>${c.id ? 'Modifica azienda' : 'Nuova azienda'}</h2>
    <label>Nome*<input name="name" required value="${esc(c.name || '')}"></label>
    <div class="v2-form-row">
      <label>P.IVA<input name="vat" value="${esc(c.vat || '')}"></label>
      <label>Tag (virgola)<input name="tags" value="${esc((c.tags || []).join(', '))}"></label></div>
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

// ── mount (runtime) ─────────────────────────────────────────────────────────
export function mount(container, { sb, ctx }) {
  if (!container) return;
  const role = roleForTenant(ctx || {}, (ctx || {}).activeTenant) || '—';
  const tenantId = (ctx || {}).activeTenant || null;
  const w = CRM.canWrite(role);
  const root = container.querySelector('[data-crm-root]') || container;

  // shell a schede
  root.innerHTML = `
    <div class="v2-tabs" data-crm-tabs>
      <button class="v2-tab active" data-crm-tab="customers">👥 Clienti</button>
      <button class="v2-tab" data-crm-tab="companies">🏢 Aziende</button>
      <button class="v2-tab" data-crm-tab="activities">🗓️ Attività</button>
    </div>
    <div data-crm-pane><div class="v2-loading">⏳ Inizializzazione…</div></div>`;
  const pane = root.querySelector('[data-crm-pane]');
  root.querySelectorAll('[data-crm-tab]').forEach((b) => b.addEventListener('click', () => {
    root.querySelectorAll('[data-crm-tab]').forEach((x) => x.classList.toggle('active', x === b));
    const t = b.getAttribute('data-crm-tab');
    if (t === 'customers') customers.list();
    else if (t === 'companies') companies.list();
    else activities.list();
  }));

  // ════ CLIENTI ════════════════════════════════════════════════════════════
  const cState = { search: '', segment: '', type: '' };
  let deb;
  const customers = {
    async list() {
      pane.innerHTML = loading('Carico clienti…');
      try {
        const list = await CRM.listCustomers(sb, cState);
        pane.innerHTML = `
          <div class="v2-toolbar">
            <input class="v2-search" data-q placeholder="🔍 Cerca cliente per nome/email…" value="${esc(cState.search)}">
            <select class="v2-filter" data-ftype><option value="">Tutti i tipi</option><option value="B2C"${cState.type === 'B2C' ? ' selected' : ''}>B2C</option><option value="B2B"${cState.type === 'B2B' ? ' selected' : ''}>B2B</option></select>
            ${w ? '<button class="v2-btn" data-new>+ Nuovo cliente</button>' : '<span class="v2-muted">Sola lettura (ruolo ' + esc(role) + ')</span>'}
          </div>
          <div class="v2-table-wrap"><table class="v2-table"><thead><tr>
            <th>Nome</th><th>Email</th><th>Telefono</th><th>Segmento</th><th>Tipo</th><th>Valore</th></tr></thead>
            <tbody>${renderCustomerRows(list)}</tbody></table></div>`;
        const q = pane.querySelector('[data-q]');
        if (q) q.addEventListener('input', () => { clearTimeout(deb); deb = setTimeout(() => { cState.search = q.value; customers.list(); }, 250); });
        const ft = pane.querySelector('[data-ftype]'); if (ft) ft.addEventListener('change', () => { cState.type = ft.value; customers.list(); });
        const nw = pane.querySelector('[data-new]'); if (nw) nw.addEventListener('click', () => customers.form());
        pane.querySelectorAll('[data-cust]').forEach((tr) => tr.addEventListener('click', () => customers.detail(tr.getAttribute('data-cust'))));
      } catch (e) { pane.innerHTML = errorBox(CRM.friendlyError(e)); }
    },
    async detail(id) {
      pane.innerHTML = loading('Carico scheda…');
      try {
        const bundle = await CRM.getCustomer(sb, id);
        pane.innerHTML = renderCustomerDetail(bundle, role);
        pane.querySelector('[data-back]').addEventListener('click', () => customers.list());
        const ed = pane.querySelector('[data-edit]'); if (ed) ed.addEventListener('click', () => customers.form(bundle.customer));
        const dl = pane.querySelector('[data-del]'); if (dl) dl.addEventListener('click', async () => {
          if (!window.confirm('Archiviare (soft-delete) questo cliente?')) return;
          try { await CRM.softDeleteCustomer(sb, id); toast(root, 'Cliente archiviato'); customers.list(); }
          catch (e) { alert(CRM.friendlyError(e)); }
        });
        const ac = pane.querySelector('[data-add-contact]'); if (ac) ac.addEventListener('click', () => quickAddContact(id));
        const aa = pane.querySelector('[data-add-activity]'); if (aa) aa.addEventListener('click', () => quickAddActivity(id));
        pane.querySelectorAll('[data-edit-contact]').forEach((b) => b.addEventListener('click', async () => {
          const val = window.prompt('Nome contatto:'); if (val == null) return;
          const rl = window.prompt('Ruolo (opz.):') || undefined;
          try { await CRM.updateContact(sb, b.getAttribute('data-edit-contact'), { name: val, role: rl }); customers.detail(id); }
          catch (e) { alert(CRM.friendlyError(e)); }
        }));
        pane.querySelectorAll('[data-del-contact]').forEach((b) => b.addEventListener('click', async () => {
          if (!window.confirm('Eliminare questo contatto?')) return;
          try { await CRM.softDeleteContact(sb, b.getAttribute('data-del-contact')); customers.detail(id); }
          catch (e) { alert(CRM.friendlyError(e)); }
        }));
      } catch (e) { pane.innerHTML = errorBox(CRM.friendlyError(e)); }
    },
    form(c) {
      if (!w) return customers.list();
      pane.innerHTML = renderForm(role, c);
      const form = pane.querySelector('[data-cust-form]');
      pane.querySelector('[data-cancel]').addEventListener('click', () => (c ? customers.detail(c.id) : customers.list()));
      form.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const msg = form.querySelector('[data-msg]');
        const data = Object.fromEntries(new FormData(form).entries());
        if (!data.name) { msg.textContent = 'Il nome è obbligatorio.'; return; }
        msg.textContent = 'Salvataggio…';
        try {
          if (c && c.id) { await CRM.updateCustomer(sb, c.id, data); toast(root, 'Cliente aggiornato'); customers.detail(c.id); }
          else { const out = await CRM.createCustomer(sb, tenantId, data); toast(root, 'Cliente creato'); customers.detail(out.id); }
        } catch (e) { msg.textContent = CRM.friendlyError(e); }
      });
    },
  };
  async function quickAddContact(id) {
    const val = window.prompt('Nome contatto:'); if (!val) return;
    try { await CRM.addContact(sb, tenantId, id, { name: val }); customers.detail(id); }
    catch (e) { alert(CRM.friendlyError(e)); }
  }
  async function quickAddActivity(id) {
    const val = window.prompt('Attività (nota):'); if (!val) return;
    try { await CRM.addActivity(sb, tenantId, id, { type: 'note', body: val }); customers.detail(id); }
    catch (e) { alert(CRM.friendlyError(e)); }
  }

  // ════ AZIENDE ════════════════════════════════════════════════════════════
  const coState = { search: '' };
  let cDeb;
  const companies = {
    async list() {
      pane.innerHTML = loading('Carico aziende…');
      try {
        const list = await CRM.listCompanies(sb, coState);
        pane.innerHTML = `
          <div class="v2-toolbar">
            <input class="v2-search" data-q placeholder="🔍 Cerca azienda per nome/P.IVA…" value="${esc(coState.search)}">
            ${w ? '<button class="v2-btn" data-new>+ Nuova azienda</button>' : '<span class="v2-muted">Sola lettura</span>'}
          </div>
          <div class="v2-table-wrap"><table class="v2-table"><thead><tr>
            <th>Nome</th><th>P.IVA</th><th>Tag</th></tr></thead>
            <tbody>${renderCompanyRows(list)}</tbody></table></div>`;
        const q = pane.querySelector('[data-q]');
        if (q) q.addEventListener('input', () => { clearTimeout(cDeb); cDeb = setTimeout(() => { coState.search = q.value; companies.list(); }, 250); });
        const nw = pane.querySelector('[data-new]'); if (nw) nw.addEventListener('click', () => companies.form());
        pane.querySelectorAll('[data-company]').forEach((tr) => tr.addEventListener('click', () => companies.detail(tr.getAttribute('data-company'))));
      } catch (e) { pane.innerHTML = errorBox(CRM.friendlyError(e)); }
    },
    async detail(id) {
      pane.innerHTML = loading('Carico azienda…');
      try {
        const bundle = await CRM.getCompany(sb, id);
        pane.innerHTML = renderCompanyDetail(bundle, role);
        pane.querySelector('[data-back]').addEventListener('click', () => companies.list());
        const ed = pane.querySelector('[data-edit-company]'); if (ed) ed.addEventListener('click', () => companies.form(bundle.company));
        const dl = pane.querySelector('[data-del-company]'); if (dl) dl.addEventListener('click', async () => {
          if (!window.confirm('Archiviare questa azienda?')) return;
          try { await CRM.softDeleteCompany(sb, id); toast(root, 'Azienda archiviata'); companies.list(); }
          catch (e) { alert(CRM.friendlyError(e)); }
        });
      } catch (e) { pane.innerHTML = errorBox(CRM.friendlyError(e)); }
    },
    form(c) {
      if (!w) return companies.list();
      pane.innerHTML = renderCompanyForm(c);
      const form = pane.querySelector('[data-company-form]');
      pane.querySelector('[data-cancel]').addEventListener('click', () => (c ? companies.detail(c.id) : companies.list()));
      form.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const msg = form.querySelector('[data-msg]');
        const raw = Object.fromEntries(new FormData(form).entries());
        if (!raw.name) { msg.textContent = 'Il nome è obbligatorio.'; return; }
        const data = { name: raw.name, vat: raw.vat || null, tags: (raw.tags || '').split(',').map((t) => t.trim()).filter(Boolean) };
        msg.textContent = 'Salvataggio…';
        try {
          if (c && c.id) { await CRM.updateCompany(sb, c.id, data); toast(root, 'Azienda aggiornata'); companies.detail(c.id); }
          else { const out = await CRM.createCompany(sb, tenantId, data); toast(root, 'Azienda creata'); companies.detail(out.id); }
        } catch (e) { msg.textContent = CRM.friendlyError(e); }
      });
    },
  };

  // ════ ATTIVITÀ (log immutabile) ══════════════════════════════════════════
  const aState = { type: '' };
  const activities = {
    async list() {
      pane.innerHTML = loading('Carico attività…');
      try {
        const list = await CRM.listActivities(sb, aState);
        pane.innerHTML = `
          <div class="v2-toolbar">
            <select class="v2-filter" data-ftype><option value="">Tutti i tipi</option>${CRM.ACTIVITY_TYPES.map((t) => `<option value="${t}"${aState.type === t ? ' selected' : ''}>${t}</option>`).join('')}</select>
            <span class="v2-muted">Storico immutabile · le attività si aggiungono dalla scheda cliente</span>
          </div>
          <div class="v2-card">${renderActivityRows(list)}</div>`;
        const ft = pane.querySelector('[data-ftype]'); if (ft) ft.addEventListener('change', () => { aState.type = ft.value; activities.list(); });
      } catch (e) { pane.innerHTML = errorBox(CRM.friendlyError(e)); }
    },
  };

  customers.list();
}
