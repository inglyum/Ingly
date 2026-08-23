// INGLY OS V2 — Logistica/Spedizioni UI (live). Viste per stato (Da preparare/
// Picking/Packing/Spedizioni/Consegnate) + dettaglio con righe, disponibilità,
// avanzamento stato, spedizione (scarico stock) e consegna.
import * as LOG from './logistics.js';
import { roleForTenant } from './context.js';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const day = (s) => esc((s || '').slice(0, 10));
const SL = { PREPARING: 'Da preparare', PICKED: 'Prelevato', PACKED: 'Imballato', SHIPPED: 'Spedito', DELIVERED: 'Consegnato', CANCELLED: 'Annullato' };
const NEXTLBL = { PREPARING: 'Segna prelevato', PICKED: 'Segna imballato', PACKED: 'Pronto a spedire' };
const VIEW_STATUS = { prepare: 'PREPARING', pick: 'PICKED', pack: 'PACKED', ship: 'SHIPPED', done: 'DELIVERED' };

export function renderShipmentRows(list) {
  if (!list || !list.length) return `<tr><td colspan="6"><div class="v2-empty">Nessuna spedizione in questa fase.</div></td></tr>`;
  return list.map((s) => `<tr data-ship="${esc(s.id)}" class="v2-row">
    <td>${esc(s.number || '—')}</td><td>${esc(s.customer_name || '—')}</td>
    <td><span class="v2-chip">${esc(SL[s.status] || s.status)}</span></td>
    <td>${esc(s.carrier || '—')}</td><td>${esc(s.tracking || '—')}</td>
    <td>${day(s.shipped_date || s.expected_date)}</td></tr>`).join('');
}

export function renderShipmentDetail(bundle, role, avail) {
  const s = bundle.shipment;
  if (!s) return `<div class="v2-empty">Spedizione non trovata.</div>`;
  const w = LOG.canWrite(role); const d = LOG.canDelete(role);
  const shipped = s.status === 'SHIPPED' || s.status === 'DELIVERED';
  const lines = (bundle.lines || []).map((l) => {
    const av = avail ? (avail[l.product_id] != null ? avail[l.product_id] : '—') : '—';
    const short = avail && avail[l.product_id] != null && Number(l.qty_prepared) > avail[l.product_id];
    return `<tr class="${short ? 'v2-row-warn' : ''}">
      <td>${esc(l.description)}</td><td class="v2-num">${l.qty_ordered}</td>
      <td class="v2-num">${w && !shipped ? `<input class="v2-mini" data-line="${esc(l.id)}" type="number" step="1" value="${l.qty_prepared}" style="width:70px">` : l.qty_prepared}</td>
      <td class="v2-num">${l.qty_shipped}</td><td class="v2-num">${av}${short ? ' ⚠️' : ''}</td></tr>`;
  }).join('') || `<tr><td colspan="5"><div class="v2-empty">Nessuna riga.</div></td></tr>`;
  const canAdvance = w && LOG.NEXT_STATUS[s.status];
  return `<div class="v2-detail">
    <div class="v2-detail-head"><button class="v2-btn v2-ghost" data-back>← Lista</button>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${canAdvance ? `<button class="v2-btn" data-advance="${esc(s.id)}">${esc(NEXTLBL[s.status])}</button>` : ''}
        ${w && s.status === 'PACKED' ? `<button class="v2-btn" data-ship="${esc(s.id)}">🚚 Spedisci (scarico stock)</button>` : ''}
        ${w && s.status === 'SHIPPED' ? `<button class="v2-btn" data-deliver="${esc(s.id)}">📬 Consegna</button>` : ''}
        ${d ? `<button class="v2-btn v2-danger" data-del="${esc(s.id)}">Archivia</button>` : ''}
      </div></div>
    <h2>${esc(s.number || '')} <span class="v2-chip">${esc(SL[s.status] || s.status)}</span></h2>
    <div class="v2-kv"><div><span>Cliente</span>${esc(s.customer_name || '—')}</div>
      <div><span>Corriere</span>${esc(s.carrier || '—')}</div>
      <div><span>Tracking</span>${esc(s.tracking || '—')}</div>
      <div><span>Spedita</span>${day(s.shipped_date)}</div>
      <div><span>Consegnata</span>${day(s.delivered_date)}</div></div>
    ${w && s.status === 'PACKED' ? `<div class="v2-form-row" style="max-width:520px">
      <label>Corriere<input data-carrier value="${esc(s.carrier || '')}"></label>
      <label>Tracking<input data-tracking value="${esc(s.tracking || '')}"></label></div>` : ''}
    <div class="v2-table-wrap"><table class="v2-table"><thead><tr>
      <th>Prodotto</th><th>Ordinato</th><th>Preparato</th><th>Spedito</th><th>Disp.</th></tr></thead>
      <tbody>${lines}</tbody></table></div>
    ${s.notes ? `<p class="v2-notes">${esc(s.notes)}</p>` : ''}</div>`;
}

const loading = (m) => `<div class="v2-loading">⏳ ${esc(m || 'Caricamento…')}</div>`;
const errorBox = (m) => `<div class="v2-errbox">⚠️ ${esc(m || 'Errore')}</div>`;
const toast = (root, msg) => { const t = document.createElement('div'); t.className = 'v2-toast'; t.textContent = msg; root.appendChild(t); setTimeout(() => t.remove(), 2600); };

export function mount(container, { sb, ctx }) {
  if (!container) return;
  const role = roleForTenant(ctx || {}, (ctx || {}).activeTenant) || '—';
  const tenantId = (ctx || {}).activeTenant || null;
  const w = LOG.canWrite(role);
  const root = container.querySelector('[data-logistics-root]') || container;
  root.innerHTML = `
    <div class="v2-tabs" data-log-tabs>
      <button class="v2-tab active" data-log-tab="prepare">📋 Da preparare</button>
      <button class="v2-tab" data-log-tab="pick">🔦 Picking</button>
      <button class="v2-tab" data-log-tab="pack">📦 Packing</button>
      <button class="v2-tab" data-log-tab="ship">🚚 Spedizioni</button>
      <button class="v2-tab" data-log-tab="done">✅ Consegnate</button>
    </div>
    <div data-log-pane>${loading('Inizializzazione…')}</div>`;
  const pane = root.querySelector('[data-log-pane]');
  let view = 'prepare';
  root.querySelectorAll('[data-log-tab]').forEach((b) => b.addEventListener('click', () => {
    root.querySelectorAll('[data-log-tab]').forEach((x) => x.classList.toggle('active', x === b));
    view = b.getAttribute('data-log-tab'); list();
  }));

  async function list() {
    pane.innerHTML = loading('Carico spedizioni…');
    try {
      const all = await LOG.listShipments(sb, {});
      const status = VIEW_STATUS[view];
      const rows = all.filter((s) => s.status === status);
      pane.innerHTML = `<div class="v2-table-wrap"><table class="v2-table"><thead><tr>
        <th>Numero</th><th>Cliente</th><th>Stato</th><th>Corriere</th><th>Tracking</th><th>Data</th></tr></thead>
        <tbody>${renderShipmentRows(rows)}</tbody></table></div>`;
      pane.querySelectorAll('[data-ship]').forEach((tr) => tr.addEventListener('click', () => detail(tr.getAttribute('data-ship'))));
    } catch (e) { pane.innerHTML = errorBox(LOG.friendlyError(e)); }
  }

  async function detail(id) {
    pane.innerHTML = loading('Carico spedizione…');
    try {
      const bundle = await LOG.getShipment(sb, id);
      const pids = bundle.lines.map((l) => l.product_id).filter(Boolean);
      const avail = pids.length ? await LOG.availabilityFor(sb, pids) : {};
      pane.innerHTML = renderShipmentDetail(bundle, role, avail);
      pane.querySelector('[data-back]').addEventListener('click', list);
      pane.querySelectorAll('[data-line]').forEach((inp) => inp.addEventListener('change', async () => { try { await LOG.setLinePrepared(sb, inp.getAttribute('data-line'), inp.value); } catch (e) { alert(LOG.friendlyError(e)); } }));
      const adv = pane.querySelector('[data-advance]'); if (adv) adv.addEventListener('click', async () => { try { await LOG.setStatus(sb, id, LOG.NEXT_STATUS[bundle.shipment.status]); toast(root, 'Stato avanzato'); detail(id); } catch (e) { alert(LOG.friendlyError(e)); } });
      const shp = pane.querySelector('[data-ship]'); if (shp) shp.addEventListener('click', async () => {
        const carrier = (pane.querySelector('[data-carrier]') || {}).value; const tracking = (pane.querySelector('[data-tracking]') || {}).value;
        if (!window.confirm('Spedire? Verrà scaricato lo stock delle quantità preparate.')) return;
        try { await LOG.ship(sb, tenantId, id, { carrier, tracking }); toast(root, 'Spedizione evasa (stock scaricato)'); detail(id); }
        catch (e) { alert(e && e.code === 'NOSTOCK' ? e.message : LOG.friendlyError(e)); }
      });
      const dlv = pane.querySelector('[data-deliver]'); if (dlv) dlv.addEventListener('click', async () => { if (!window.confirm('Confermare la consegna?')) return; try { await LOG.deliver(sb, id); toast(root, 'Consegnata · ordine aggiornato'); detail(id); } catch (e) { alert(LOG.friendlyError(e)); } });
      const del = pane.querySelector('[data-del]'); if (del) del.addEventListener('click', async () => { if (!window.confirm('Archiviare questa spedizione?')) return; try { await LOG.softDeleteShipment(sb, id); toast(root, 'Archiviata'); list(); } catch (e) { alert(LOG.friendlyError(e)); } });
    } catch (e) { pane.innerHTML = errorBox(LOG.friendlyError(e)); }
  }

  list();
}
