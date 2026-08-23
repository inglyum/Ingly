// INGLY OS V2 — Fattura Elettronica / SDI: drawer di generazione. Mostra i dati
// fiscali del cliente (editabili, salvabili sull'anagrafica), lo stato del
// cedente, la validazione e l'anteprima XML. Se mancano campi obbligatori NON
// genera un file: elenca cosa manca. Nessun alert nativo, responsive.
import * as SDI from './sdi.js';
import { getInvoice } from './invoices.js';
import { getCustomer, updateCustomer } from './crm.js';
import { getSettings } from './settings.js';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const toast = (root, msg) => { const t = document.createElement('div'); t.className = 'v2-toast'; t.textContent = msg; root.appendChild(t); setTimeout(() => t.remove(), 2600); };

const BUYER_FIELDS = [
  ['vat', 'Partita IVA'], ['fiscal_code', 'Codice Fiscale'], ['sdi_code', 'Codice Destinatario (7)'],
  ['pec', 'PEC'], ['address', 'Indirizzo'], ['cap', 'CAP'], ['comune', 'Comune'], ['provincia', 'Provincia'], ['nazione', 'Nazione'],
];

export function renderValidation(v) {
  if (v.ok) return `<div class="v2-note v2-ok">✅ Dati completi: XML pronto per la generazione.</div>`;
  return `<div class="v2-errbox">⚠️ Mancano ${v.missing.length} campi obbligatori:</div>
    <ul class="v2-search-list">${v.missing.map((m) => `<li class="v2-search-item"><span class="v2-search-item-l">${esc(m.label)}</span></li>`).join('')}</ul>`;
}

export function openSdiDrawer({ sb, tenantId, invoiceId } = {}) {
  const host = document.createElement('div');
  host.className = 'v2-drawer-overlay';
  host.innerHTML = `<div class="v2-drawer" role="dialog" aria-modal="true" aria-label="Fattura elettronica">
    <div class="v2-drawer-head"><h3>🧾 Fattura Elettronica / SDI</h3><button class="v2-btn v2-ghost" data-close aria-label="Chiudi">✕</button></div>
    <div class="v2-drawer-body"><div data-sdi-body>⏳ Carico dati fattura…</div></div>
    <div class="v2-drawer-foot"><div class="v2-drawer-msg" data-msg></div>
      <div style="display:flex;gap:8px"><button class="v2-btn v2-ghost" data-cancel>Chiudi</button>
      <button class="v2-btn" data-gen disabled>Genera XML</button></div></div></div>`;
  document.body.appendChild(host);
  const body = host.querySelector('[data-sdi-body]');
  const msg = host.querySelector('[data-msg]');
  const genBtn = host.querySelector('[data-gen]');
  const close = () => { document.removeEventListener('keydown', onKey); host.remove(); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  host.addEventListener('mousedown', (e) => { if (e.target === host) close(); });
  host.querySelector('[data-close]').addEventListener('click', close);
  host.querySelector('[data-cancel]').addEventListener('click', close);

  let seller = {}, buyer = {}, invoice = {}, lines = [];

  const readBuyer = () => { const o = { ...buyer }; BUYER_FIELDS.forEach(([k]) => { const el = host.querySelector(`[data-b="${k}"]`); if (el) o[k] = el.value; }); return o; };

  function refresh() {
    const b = readBuyer();
    const v = SDI.validateForSdi(seller, b, invoice);
    const val = host.querySelector('[data-validation]');
    if (val) val.innerHTML = renderValidation(v);
    genBtn.disabled = !v.ok;
  }

  function drawForm() {
    const sellerOk = seller.vat_number && seller.company_name && seller.tax_regime && seller.sede_cap && seller.sede_comune && seller.sede_provincia && seller.address;
    body.innerHTML = `
      <div class="v2-drawer-form">
        <h4>Cedente (azienda)</h4>
        <div class="v2-note">${sellerOk ? '✅ Dati cedente completi (da Impostazioni ERP).' : '⚠️ Dati cedente incompleti: compilali in <b>Impostazioni ERP → Fattura elettronica</b>.'}</div>
        <h4>Cliente (dati fiscali)</h4>
        <div class="v2-form-grid">
          ${BUYER_FIELDS.map(([k, label]) => `<label>${esc(label)}<input data-b="${k}" value="${esc(buyer[k] || '')}"></label>`).join('')}
        </div>
        <button class="v2-btn v2-sm" data-save-buyer>💾 Salva dati cliente</button>
      </div>
      <div class="v2-drawer-preview">
        <h4>Validazione</h4>
        <div data-validation></div>
        <h4 style="margin-top:12px">Anteprima XML</h4>
        <pre class="v2-xml" data-xml>—</pre>
      </div>`;
    host.querySelectorAll('[data-b]').forEach((el) => el.addEventListener('input', refresh));
    const sb2 = host.querySelector('[data-save-buyer]');
    if (sb2) sb2.addEventListener('click', async () => {
      const b = readBuyer();
      sb2.disabled = true;
      try { await updateCustomer(sb, invoice.customer_id, { vat: b.vat, fiscal_code: b.fiscal_code, sdi_code: b.sdi_code, pec: b.pec, address: b.address, cap: b.cap, comune: b.comune, provincia: b.provincia, nazione: b.nazione }); buyer = b; toast(host, 'Dati cliente salvati'); }
      catch (e) { msg.textContent = SDI.friendlyError(e); }
      finally { sb2.disabled = false; }
    });
    refresh();
  }

  genBtn.addEventListener('click', () => {
    const b = readBuyer();
    const v = SDI.validateForSdi(seller, b, invoice);
    if (!v.ok) { msg.textContent = 'Compila i campi mancanti prima di generare.'; return; }
    const xml = SDI.buildFatturaXML({ seller, buyer: b, invoice, lines });
    const pre = host.querySelector('[data-xml]'); if (pre) pre.textContent = xml;
    msg.textContent = '';
    // download best-effort (in sandbox artefatti può essere inibito)
    try {
      const blob = new Blob([xml], { type: 'application/xml' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = SDI.sdiFileName(seller, invoice);
      document.body.appendChild(a); a.click(); a.remove();
    } catch (_) { /* download non disponibile: l'XML resta in anteprima/copia */ }
    toast(host, 'XML generato');
  });

  Promise.all([getInvoice(sb, invoiceId), getSettings(sb, tenantId).catch(() => ({}))]).then(async ([bundle, settings]) => {
    invoice = bundle.invoice || {}; lines = bundle.lines || []; seller = settings || {};
    if (invoice.customer_id) { try { buyer = (await getCustomer(sb, invoice.customer_id)) || {}; } catch (_) { buyer = {}; } }
    drawForm();
  }).catch((e) => { body.innerHTML = `<div class="v2-errbox">⚠️ ${esc(SDI.friendlyError(e))}</div>`; });

  return { close };
}
