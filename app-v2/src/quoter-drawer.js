// INGLY OS V2 — Smart Quoter drawer (slide-over riutilizzabile). Integra il
// preventivatore nel workflow: apribile dal Catalogo e dal dettaglio Preventivo
// per alimentare direttamente una riga documento. Deterministico, live, con
// breakdown e snapshot; nessun alert nativo, error/validation inline, responsive.
import * as Q from './quoter.js';
import { renderPreview } from './quoter-ui.js';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function fieldsHtml(prefill) {
  const p = prefill || {};
  const chOpts = Object.keys(Q.CHANNELS).map((k) => `<option value="${k}"${p.channel === k ? ' selected' : ''}>${esc(Q.CHANNELS[k].label)}</option>`).join('');
  const ptOpts = Object.keys(Q.PSY_MIN).map((k) => `<option value="${k}"${p.productType === k ? ' selected' : ''}>${esc(Q.PSY_MIN_LABEL[k])}${Q.PSY_MIN[k] ? ' (min ' + Q.PSY_MIN[k].toFixed(2) + '€)' : ''}</option>`).join('');
  const chKey = Q.CHANNELS[p.channel] ? p.channel : 'B2C';
  return `
    <label>Descrizione<input data-q="descr" value="${esc(p.description || '')}" placeholder="Es. Targa A5 incisa"></label>
    <div class="v2-form-grid">
      <label>Materiale €<input data-q="materiale" type="number" step="0.01" min="0" value="${esc(p.materiale != null ? p.materiale : 0)}"></label>
      <label>Macchina €<input data-q="macchina" type="number" step="0.01" min="0" value="${esc(p.macchina != null ? p.macchina : 0)}"></label>
      <label>Lavoro (min)<input data-q="lavoroMin" type="number" step="1" min="0" value="${esc(p.lavoroMin != null ? p.lavoroMin : 0)}"></label>
      <label>Design €<input data-q="design" type="number" step="1" min="0" value="${esc(p.design != null ? p.design : 0)}"></label>
      <label>Canale<select data-q="channel">${chOpts}</select></label>
      <label>Markup<input data-q="markup" type="number" step="0.1" min="0" value="${esc(Q.CHANNELS[chKey].markup)}"></label>
      <label>Tipo prodotto<select data-q="productType">${ptOpts}</select></label>
      <label>Quantità<input data-q="quantity" type="number" step="1" min="1" value="${esc(p.quantity != null ? p.quantity : 1)}"></label>
    </div>
    <div class="v2-checks">
      <label><input type="checkbox" data-q="express"> Express &lt;48h (+25%)</label>
      <label><input type="checkbox" data-q="referral"> Referral (−10%)</label>
      <label><input type="checkbox" data-q="riordino"> Riordino (−10%)</label>
    </div>`;
}

// Apre il drawer. onConfirm(calc, description) è chiamato alla conferma.
export function openQuoterDrawer({ sb, ctx, prefill, confirmLabel, onConfirm } = {}) {
  const host = document.createElement('div');
  host.className = 'v2-drawer-overlay';
  host.innerHTML = `
    <div class="v2-drawer" role="dialog" aria-modal="true" aria-label="Smart Quoter">
      <div class="v2-drawer-head">
        <h3>🧮 Smart Quoter</h3>
        <button class="v2-btn v2-ghost" data-close aria-label="Chiudi">✕</button>
      </div>
      <div class="v2-drawer-body">
        <div class="v2-drawer-form">${fieldsHtml(prefill)}</div>
        <div class="v2-drawer-preview"><h4>Prezzo e margine</h4><div data-preview></div></div>
      </div>
      <div class="v2-drawer-foot">
        <div class="v2-drawer-msg" data-msg></div>
        <div style="display:flex;gap:8px">
          <button class="v2-btn v2-ghost" data-cancel>Annulla</button>
          <button class="v2-btn" data-confirm>${esc(confirmLabel || 'Aggiungi riga')}</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(host);
  const panel = host.querySelector('.v2-drawer');
  const preview = host.querySelector('[data-preview]');
  const msg = host.querySelector('[data-msg]');

  const read = () => {
    const v = (n) => (host.querySelector(`[data-q="${n}"]`) || {}).value;
    const ck = (n) => !!(host.querySelector(`[data-q="${n}"]`) || {}).checked;
    return { materiale: v('materiale'), macchina: v('macchina'), lavoroMin: v('lavoroMin'), design: v('design'),
      channel: v('channel'), markup: v('markup'), quantity: v('quantity'), productType: v('productType'),
      express: ck('express'), referral: ck('referral'), riordino: ck('riordino') };
  };
  let lastCalc = null;
  const recompute = () => {
    try { lastCalc = Q.computeQuote(read()); preview.innerHTML = renderPreview(lastCalc); msg.textContent = ''; }
    catch (e) { preview.innerHTML = `<div class="v2-errbox">⚠️ ${esc(Q.friendlyError(e))}</div>`; lastCalc = null; }
  };
  host.querySelectorAll('[data-q]').forEach((el) => {
    const ev = (el.type === 'checkbox' || el.tagName === 'SELECT') ? 'change' : 'input';
    el.addEventListener(ev, () => {
      if (el.getAttribute('data-q') === 'channel') { const ch = Q.CHANNELS[el.value]; const mk = host.querySelector('[data-q="markup"]'); if (ch && mk) mk.value = ch.markup; }
      recompute();
    });
  });

  const close = () => { document.removeEventListener('keydown', onKey); host.remove(); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  host.addEventListener('mousedown', (e) => { if (e.target === host) close(); });
  host.querySelector('[data-close]').addEventListener('click', close);
  host.querySelector('[data-cancel]').addEventListener('click', close);

  const confirmBtn = host.querySelector('[data-confirm]');
  confirmBtn.addEventListener('click', async () => {
    if (!lastCalc) { msg.textContent = 'Calcolo non valido: correggi i parametri.'; return; }
    const description = (host.querySelector('[data-q="descr"]') || {}).value || '';
    confirmBtn.disabled = true; msg.textContent = '';
    try { await (onConfirm ? onConfirm(lastCalc, description) : Promise.resolve()); close(); }
    catch (e) { msg.textContent = Q.friendlyError(e); confirmBtn.disabled = false; }
  });

  recompute();
  const firstInput = panel.querySelector('[data-q="materiale"]');
  try { if (firstInput) firstInput.focus(); } catch (_) { /* headless */ }
  return { close };
}
