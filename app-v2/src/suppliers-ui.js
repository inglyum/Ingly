// INGLY OS V2 — Fornitori UI (live). Lista/ricerca/detail/create/edit/archivia.
import * as SUP from './suppliers.js';
import { roleForTenant } from './context.js';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function renderSupplierRows(list) {
  if (!list || !list.length) return `<tr><td colspan="5"><div class="v2-empty">Nessun fornitore. Crea il primo o modifica la ricerca.</div></td></tr>`;
  return list.map((s) => `<tr data-sup="${esc(s.id)}" class="v2-row">
    <td>${esc(s.name)}</td><td>${esc(s.vat || '—')}</td><td>${esc(s.email || '—')}</td>
    <td>${esc(s.phone || '—')}</td><td>${s.active === false ? '<span class="v2-muted">disattivo</span>' : '<span class="v2-chip">attivo</span>'}</td></tr>`).join('');
}

export function renderSupplierDetail(su, role) {
  if (!su) return `<div class="v2-empty">Fornitore non trovato.</div>`;
  const w = SUP.canWrite(role); const d = SUP.canDelete(role);
  return `<div class="v2-detail">
    <div class="v2-detail-head"><button class="v2-btn v2-ghost" data-back>← Lista</button>
      <div style="display:flex;gap:8px">
        ${w ? `<button class="v2-btn" data-edit="${esc(su.id)}">Modifica</button>` : ''}
        ${d ? `<button class="v2-btn v2-danger" data-del="${esc(su.id)}">Archivia</button>` : ''}
      </div></div>
    <h2>🚚 ${esc(su.name)}</h2>
    <div class="v2-kv"><div><span>P.IVA</span>${esc(su.vat || '—')}</div>
      <div><span>Email</span>${esc(su.email || '—')}</div>
      <div><span>Telefono</span>${esc(su.phone || '—')}</div>
      <div><span>Stato</span>${su.active === false ? 'disattivo' : 'attivo'}</div></div>
    ${su.notes ? `<p class="v2-notes">${esc(su.notes)}</p>` : ''}</div>`;
}

export function renderSupplierForm(su) {
  su = su || {};
  return `<form class="v2-form" data-sup-form="${esc(su.id || '')}">
    <h2>${su.id ? 'Modifica fornitore' : 'Nuovo fornitore'}</h2>
    <label>Nome*<input name="name" required value="${esc(su.name || '')}"></label>
    <div class="v2-form-row">
      <label>P.IVA<input name="vat" value="${esc(su.vat || '')}"></label>
      <label>Email<input name="email" type="email" value="${esc(su.email || '')}"></label></div>
    <div class="v2-form-row">
      <label>Telefono<input name="phone" value="${esc(su.phone || '')}"></label>
      <label class="v2-chk"><input type="checkbox" name="active" ${su.active === false ? '' : 'checked'}> Attivo</label></div>
    <label>Note<textarea name="notes">${esc(su.notes || '')}</textarea></label>
    <div class="v2-form-actions"><button type="button" class="v2-btn v2-ghost" data-cancel>Annulla</button>
      <button type="submit" class="v2-btn">Salva</button></div>
    <div class="v2-form-msg" data-msg></div></form>`;
}

const loading = (m) => `<div class="v2-loading">⏳ ${esc(m || 'Caricamento…')}</div>`;
const errorBox = (m) => `<div class="v2-errbox">⚠️ ${esc(m || 'Errore')}</div>`;
const toast = (root, msg) => { const t = document.createElement('div'); t.className = 'v2-toast'; t.textContent = msg; root.appendChild(t); setTimeout(() => t.remove(), 2600); };

export function mount(container, { sb, ctx }) {
  if (!container) return;
  const role = roleForTenant(ctx || {}, (ctx || {}).activeTenant) || '—';
  const tenantId = (ctx || {}).activeTenant || null;
  const w = SUP.canWrite(role);
  const root = container.querySelector('[data-suppliers-root]') || container;
  root.innerHTML = `<div data-s-pane></div>`;
  const pane = root.querySelector('[data-s-pane]');
  const state = { search: '' };
  let deb;

  async function list() {
    pane.innerHTML = loading('Carico fornitori…');
    try {
      const items = await SUP.listSuppliers(sb, state);
      pane.innerHTML = `
        <div class="v2-toolbar">
          <input class="v2-search" data-q placeholder="🔍 Cerca per nome/P.IVA/email…" value="${esc(state.search)}">
          ${w ? '<button class="v2-btn" data-new>+ Nuovo fornitore</button>' : '<span class="v2-muted">Sola lettura</span>'}
        </div>
        <div class="v2-table-wrap"><table class="v2-table"><thead><tr>
          <th>Nome</th><th>P.IVA</th><th>Email</th><th>Telefono</th><th>Stato</th></tr></thead>
          <tbody>${renderSupplierRows(items)}</tbody></table></div>`;
      const q = pane.querySelector('[data-q]');
      if (q) q.addEventListener('input', () => { clearTimeout(deb); deb = setTimeout(() => { state.search = q.value; list(); }, 250); });
      const nw = pane.querySelector('[data-new]'); if (nw) nw.addEventListener('click', () => form());
      pane.querySelectorAll('[data-sup]').forEach((tr) => tr.addEventListener('click', () => detail(tr.getAttribute('data-sup'))));
    } catch (e) { pane.innerHTML = errorBox(SUP.friendlyError(e)); }
  }
  async function detail(id) {
    pane.innerHTML = loading('Carico scheda…');
    try {
      const su = await SUP.getSupplier(sb, id);
      pane.innerHTML = renderSupplierDetail(su, role);
      pane.querySelector('[data-back]').addEventListener('click', list);
      const ed = pane.querySelector('[data-edit]'); if (ed) ed.addEventListener('click', () => form(su));
      const dl = pane.querySelector('[data-del]'); if (dl) dl.addEventListener('click', async () => {
        if (!window.confirm('Archiviare questo fornitore?')) return;
        try { await SUP.softDeleteSupplier(sb, id); toast(root, 'Archiviato'); list(); }
        catch (e) { alert(SUP.friendlyError(e)); }
      });
    } catch (e) { pane.innerHTML = errorBox(SUP.friendlyError(e)); }
  }
  function form(su) {
    if (!w) return list();
    pane.innerHTML = renderSupplierForm(su);
    const f = pane.querySelector('[data-sup-form]');
    pane.querySelector('[data-cancel]').addEventListener('click', () => (su ? detail(su.id) : list()));
    f.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const msg = f.querySelector('[data-msg]');
      const raw = Object.fromEntries(new FormData(f).entries());
      if (!raw.name) { msg.textContent = 'Il nome è obbligatorio.'; return; }
      const data = { name: raw.name, vat: raw.vat || null, email: raw.email || null, phone: raw.phone || null, active: raw.active === 'on', notes: raw.notes || null };
      msg.textContent = 'Salvataggio…';
      try {
        if (su && su.id) { await SUP.updateSupplier(sb, su.id, data); toast(root, 'Aggiornato'); detail(su.id); }
        else { const out = await SUP.createSupplier(sb, tenantId, data); toast(root, 'Creato'); detail(out.id); }
      } catch (e) { msg.textContent = SUP.friendlyError(e); }
    });
  }
  list();
}
