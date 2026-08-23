// INGLY OS V2 — Impostazioni ERP UI (live). Form a sezioni (Azienda · Fisco ·
// Pricing · Numerazione · Cassa). Scrittura riservata a OWNER/ADMIN. Premium:
// toast, nessun alert/confirm nativo. Nota chiara: valori memorizzati, non
// ancora cablati nei calcoli (default-OFF).
import * as SET from './settings.js';
import { roleForTenant } from './context.js';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const loading = (m) => `<div class="v2-loading">⏳ ${esc(m || 'Caricamento…')}</div>`;
const errorBox = (m) => `<div class="v2-errbox">⚠️ ${esc(m || 'Errore')}</div>`;
const toast = (root, msg) => { const t = document.createElement('div'); t.className = 'v2-toast'; t.textContent = msg; root.appendChild(t); setTimeout(() => t.remove(), 2600); };

const txt = (k, label, v, ro) => `<label>${esc(label)}<input data-s="${k}" value="${esc(v == null ? '' : v)}"${ro ? ' disabled' : ''}></label>`;
const num = (k, label, v, ro) => `<label>${esc(label)}<input data-s="${k}" type="number" step="0.01" value="${esc(v == null ? '' : v)}"${ro ? ' disabled' : ''}></label>`;

export function renderForm(s, editable) {
  const ro = !editable;
  const cashSum = Number(s.cash_tax_pct || 0) + Number(s.cash_reserve_pct || 0) + Number(s.cash_goals_pct || 0) + Number(s.cash_operational_pct || 0);
  const cashOk = Math.abs(cashSum - 100) < 0.01;
  return `
    <div class="v2-note">ℹ️ Le impostazioni sono memorizzate ma <b>non ancora cablate</b> nei calcoli di pricing/numerazione (default-OFF): fanno fede i valori KB. Il collegamento sarà una modifica separata e approvata.</div>
    ${!editable ? '<div class="v2-note">Il tuo ruolo può consultare le impostazioni ma non modificarle (solo OWNER/ADMIN).</div>' : ''}
    <div class="v2-card"><h3>Azienda</h3><div class="v2-form-grid">
      ${txt('company_name', 'Ragione sociale', s.company_name, ro)}
      ${txt('vat_number', 'Partita IVA', s.vat_number, ro)}
      ${txt('address', 'Indirizzo', s.address, ro)}
      ${txt('city', 'Città', s.city, ro)}
      ${txt('email', 'Email', s.email, ro)}
      ${txt('phone', 'Telefono', s.phone, ro)}
    </div></div>
    <div class="v2-card"><h3>Fisco</h3><div class="v2-form-grid">
      ${num('default_vat_rate', 'IVA default %', s.default_vat_rate, ro)}
    </div></div>
    <div class="v2-card"><h3>Pricing (default KB)</h3><div class="v2-form-grid">
      ${num('labor_rate', 'Tariffa lavoro €/h', s.labor_rate, ro)}
      ${num('sfrido_pct', 'Sfrido materiale %', s.sfrido_pct, ro)}
      ${num('markup_b2c', 'Markup B2C', s.markup_b2c, ro)}
      ${num('markup_b2b', 'Markup B2B', s.markup_b2b, ro)}
      ${num('markup_etsy', 'Markup Etsy', s.markup_etsy, ro)}
    </div></div>
    <div class="v2-card"><h3>Numerazione (prefissi)</h3><div class="v2-form-grid">
      ${txt('quote_prefix', 'Preventivi', s.quote_prefix, ro)}
      ${txt('order_prefix', 'Ordini', s.order_prefix, ro)}
      ${txt('invoice_prefix', 'Fatture', s.invoice_prefix, ro)}
    </div></div>
    <div class="v2-card"><h3>Cassa profit-first</h3><div class="v2-form-grid">
      ${num('cash_tax_pct', 'Tasse %', s.cash_tax_pct, ro)}
      ${num('cash_reserve_pct', 'Riserva %', s.cash_reserve_pct, ro)}
      ${num('cash_goals_pct', 'Obiettivi %', s.cash_goals_pct, ro)}
      ${num('cash_operational_pct', 'Operativo %', s.cash_operational_pct, ro)}
    </div><div class="v2-muted" style="margin-top:8px" data-cashsum>Somma: ${cashSum}% ${cashOk ? '✅' : '⚠️ deve fare 100%'}</div></div>
    ${editable ? '<button class="v2-btn" data-save>💾 Salva impostazioni</button>' : ''}`;
}

export function mount(container, { sb, ctx }) {
  if (!container) return;
  const role = roleForTenant(ctx || {}, (ctx || {}).activeTenant) || '—';
  const editable = SET.canEditSettings(role);
  const tenantId = (ctx || {}).activeTenant || null;
  const root = container.querySelector('[data-settings-root]') || container;
  root.innerHTML = loading('Carico impostazioni…');

  async function draw() {
    try {
      const s = await SET.getSettings(sb, tenantId);
      root.innerHTML = `<div data-s-pane>${renderForm(s, editable)}</div>`;
      const pane = root.querySelector('[data-s-pane]');
      // aggiorna la somma cassa in tempo reale
      const recalcCash = () => {
        const g = (k) => Number((pane.querySelector(`[data-s="${k}"]`) || {}).value || 0);
        const sum = g('cash_tax_pct') + g('cash_reserve_pct') + g('cash_goals_pct') + g('cash_operational_pct');
        const el = pane.querySelector('[data-cashsum]'); if (el) el.textContent = `Somma: ${Math.round(sum * 100) / 100}% ${Math.abs(sum - 100) < 0.01 ? '✅' : '⚠️ deve fare 100%'}`;
      };
      pane.querySelectorAll('[data-s^="cash_"]').forEach((el) => el.addEventListener('input', recalcCash));
      const save = pane.querySelector('[data-save]');
      if (save) save.addEventListener('click', async () => {
        const patch = {}; pane.querySelectorAll('[data-s]').forEach((el) => { patch[el.getAttribute('data-s')] = el.value; });
        save.disabled = true;
        try { await SET.saveSettings(sb, tenantId, patch); toast(root, 'Impostazioni salvate'); }
        catch (e) { toast(root, SET.friendlyError(e)); }
        finally { save.disabled = false; }
      });
    } catch (e) { root.innerHTML = errorBox(SET.friendlyError(e)); }
  }
  draw();
}
