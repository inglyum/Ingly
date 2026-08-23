// INGLY OS V2 — Smart Quoter UI (live). Form parametrico con breakdown di prezzo
// in tempo reale fedele alla KB e creazione preventivo. Premium: nessun
// alert/confirm nativo, toast per il feedback.
import * as Q from './quoter.js';
import * as CRM from './crm.js';
import { roleForTenant } from './context.js';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const eur = (n) => '€' + (Number(n || 0)).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const toast = (root, msg) => { const t = document.createElement('div'); t.className = 'v2-toast'; t.textContent = msg; root.appendChild(t); setTimeout(() => t.remove(), 2600); };

export function renderPreview(calc) {
  const rows = calc.breakdown.map((b) => `<tr><td>${esc(b.label)}</td><td class="v2-num">${eur(b.value)}</td><td class="v2-muted">${esc(b.source)}</td></tr>`).join('');
  const warn = calc.warnings.length ? `<div class="v2-errbox" style="margin-top:10px">⚠️ ${calc.warnings.map(esc).join(' · ')}</div>` : '';
  const marginCls = calc.marginOk ? 'v2-ok' : 'v2-bad';
  return `
    <div class="v2-table-wrap"><table class="v2-table"><thead><tr><th>Voce</th><th>Valore</th><th>Fonte (KB)</th></tr></thead>
      <tbody>${rows}</tbody></table></div>
    <div class="v2-summary" style="margin-top:12px">
      <div><span>Costo pieno unitario</span><b>${eur(calc.cost)}</b></div>
      <div><span>Prezzo (,90)</span><b>${eur(calc.unit)}</b></div>
      ${calc.discountPct ? `<div><span>Sconto</span><b>-${(calc.discountPct * 100).toFixed(0)}%</b></div>` : ''}
      <div><span>Prezzo unitario finale</span><b>${eur(calc.discountedUnit)}</b></div>
      <div><span>Quantità</span><b>${calc.quantity}</b></div>
      <div><span>Margine</span><b class="${marginCls}">${(calc.margin * 100).toFixed(0)}% (min ${(calc.minMargin * 100).toFixed(0)}%)</b></div>
      ${calc.acconto ? `<div><span>Acconto 50%</span><b>${eur(calc.acconto)}</b></div>` : ''}
      <div class="v2-summary-tot"><span>Totale</span><b>${eur(calc.lineTotal)}</b></div>
    </div>${warn}`;
}

const loading = (m) => `<div class="v2-loading">⏳ ${esc(m || 'Caricamento…')}</div>`;
const errorBox = (m) => `<div class="v2-errbox">⚠️ ${esc(m || 'Errore')}</div>`;

export function mount(container, { sb, ctx }) {
  if (!container) return;
  const role = roleForTenant(ctx || {}, (ctx || {}).activeTenant) || '—';
  const w = CRM.canWrite(role);
  const tenantId = (ctx || {}).activeTenant || null;
  const root = container.querySelector('[data-quoter-root]') || container;
  root.innerHTML = loading('Inizializzazione…');

  let customers = [];
  CRM.listCustomers(sb, { limit: 500 }).then((cs) => { customers = cs || []; draw(); }).catch(() => { customers = []; draw(); });

  const chOpts = Object.keys(Q.CHANNELS).map((k) => `<option value="${k}">${esc(Q.CHANNELS[k].label)}</option>`).join('');
  const ptOpts = Object.keys(Q.PSY_MIN).map((k) => `<option value="${k}">${esc(Q.PSY_MIN_LABEL[k])}${Q.PSY_MIN[k] ? ' (min ' + Q.PSY_MIN[k].toFixed(2) + '€)' : ''}</option>`).join('');

  function readInputs() {
    const v = (n) => (root.querySelector(`[data-q="${n}"]`) || {}).value;
    const ck = (n) => !!(root.querySelector(`[data-q="${n}"]`) || {}).checked;
    return {
      materiale: v('materiale'), macchina: v('macchina'), lavoroMin: v('lavoroMin'), design: v('design'),
      channel: v('channel'), markup: v('markup'), quantity: v('quantity'), productType: v('productType'),
      express: ck('express'), referral: ck('referral'), riordino: ck('riordino'),
    };
  }

  function recompute() {
    const pane = root.querySelector('[data-preview]');
    if (!pane) return;
    try { pane.innerHTML = renderPreview(Q.computeQuote(readInputs())); }
    catch (e) { pane.innerHTML = errorBox(Q.friendlyError(e)); }
  }

  function draw() {
    root.innerHTML = `
      <div class="v2-cols v2-quoter">
        <div class="v2-card">
          <h3>Parametri (formula KB)</h3>
          <div class="v2-form-grid">
            <label>Materiale €<input data-q="materiale" type="number" step="0.01" min="0" value="0"></label>
            <label>Macchina €<input data-q="macchina" type="number" step="0.01" min="0" value="0"></label>
            <label>Lavoro (min)<input data-q="lavoroMin" type="number" step="1" min="0" value="0"></label>
            <label>Design € (una tantum)<input data-q="design" type="number" step="1" min="0" value="0"></label>
            <label>Canale<select data-q="channel">${chOpts}</select></label>
            <label>Markup<input data-q="markup" type="number" step="0.1" min="0" value="3"></label>
            <label>Tipo prodotto<select data-q="productType">${ptOpts}</select></label>
            <label>Quantità<input data-q="quantity" type="number" step="1" min="1" value="1"></label>
          </div>
          <div class="v2-checks">
            <label><input type="checkbox" data-q="express"> Express &lt;48h (+25%)</label>
            <label><input type="checkbox" data-q="referral"> Referral (−10%)</label>
            <label><input type="checkbox" data-q="riordino"> Riordino (−10%)</label>
          </div>
          ${w ? `<hr class="v2-hr"><h3>Crea preventivo</h3>
          <div class="v2-form-grid">
            <label>Cliente<select data-q="customer"><option value="">— nessuno —</option>${customers.map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}</select></label>
            <label>Descrizione<input data-q="descr" placeholder="Es. Targa A5 incisa personalizzata"></label>
          </div>
          <button class="v2-btn" data-create>🧾 Crea preventivo</button>` : '<p class="v2-muted">Il tuo ruolo può consultare il calcolo ma non creare preventivi.</p>'}
        </div>
        <div class="v2-card">
          <h3>Prezzo e margine</h3>
          <div data-preview></div>
        </div>
      </div>`;
    root.querySelectorAll('[data-q]').forEach((el) => {
      const ev = (el.type === 'checkbox' || el.tagName === 'SELECT') ? 'change' : 'input';
      el.addEventListener(ev, () => {
        if (el.getAttribute('data-q') === 'channel') { const ch = Q.CHANNELS[el.value]; const mk = root.querySelector('[data-q="markup"]'); if (ch && mk) mk.value = ch.markup; }
        recompute();
      });
    });
    const btn = root.querySelector('[data-create]');
    if (btn) btn.addEventListener('click', async () => {
      const calc = Q.computeQuote(readInputs());
      const customerSel = root.querySelector('[data-q="customer"]');
      const customerId = customerSel ? customerSel.value : '';
      const customerName = customerId ? (customers.find((c) => String(c.id) === String(customerId)) || {}).name : null;
      const description = (root.querySelector('[data-q="descr"]') || {}).value || 'Prodotto personalizzato';
      btn.disabled = true;
      try {
        const quote = await Q.createQuoteFromCalc(sb, tenantId, { customerId: customerId || null, customerName, description, calc });
        toast(root, 'Preventivo creato: ' + (quote.number || quote.id));
        setTimeout(() => { location.hash = '#/quotes'; }, 500);
      } catch (e) { toast(root, Q.friendlyError(e)); btn.disabled = false; }
    });
    recompute();
  }
}
