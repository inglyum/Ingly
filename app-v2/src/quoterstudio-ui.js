// INGLY OS V2 — Smart Quoter Studio UI (premium, 3 pannelli). Left: progetto +
// righe. Center: configurazione riga (materiali dal catalogo, macchina, lavoro,
// design, extra, spec, immagine). Right: breakdown, markup, sconto, IVA, totale,
// margine, anchoring, azioni. No alert/confirm nativi. Responsive.
import * as STU from './quoterstudio.js';
import * as Q from './quoter.js';
import * as DOC from './quoterdoc.js';
import * as CRM from './crm.js';
import { listProducts } from './catalog.js';
import { getSettings } from './settings.js';
import { changeStatus } from './quotes.js';
import { convertQuoteToOrder } from './orders.js';
import { roleForTenant } from './context.js';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const eur = (n) => '€' + (Number(n || 0)).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// Toast su document.body: sopravvive ai re-render di draw() del pannello.
const toast = (_root, msg) => { const t = document.createElement('div'); t.className = 'v2-toast'; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 2600); };
const loading = (m) => `<div class="v2-loading">⏳ ${esc(m || 'Caricamento…')}</div>`;
const errorBox = (m) => `<div class="v2-errbox">⚠️ ${esc(m || 'Errore')}</div>`;

const RISK_LABEL = { high: '⚠️ Margine a rischio', medium: '⚠️ Margine sotto soglia', low: '✅ Margine sano' };
const newLine = (kind) => ({ kind: kind || 'product', description: kind === 'extra' ? 'Setup' : '', product_id: null, quantity: 1, cost_material: 0, cost_machine: 0, cost_labor: 0, cost_design: 0, cost_extra: 0, markup_pct: 200, discount_pct: 0, vat_rate: 22, spec: '', image_url: '' });

export function mount(container, { sb, ctx }) {
  if (!container) return;
  const role = roleForTenant(ctx || {}, (ctx || {}).activeTenant) || '—';
  const w = CRM.canWrite(role);
  const tenantId = (ctx || {}).activeTenant || null;
  const root = container.querySelector('[data-quoterstudio-root]') || container;
  root.innerHTML = loading('Inizializzazione Smart Quoter…');

  const S = { doc: { title: '', customer_id: '', customer_name: '', priority: 'normal', category: '', notes: '', valid_until: '', deposit_pct: 0, lines: [newLine('product')] }, sel: 0, id: null };
  let customers = [], products = [], settings = {}, prodById = {};

  function computed() { return Q.computeDocument(S.doc.lines, { depositPct: S.doc.deposit_pct, minMarginPct: 55 }); }

  Promise.all([
    CRM.listCustomers(sb, { limit: 500 }).catch(() => []),
    listProducts(sb, { limit: 1000 }).catch(() => []),
    getSettings(sb, tenantId).catch(() => ({})),
  ]).then(([cs, ps, st]) => { customers = cs; products = ps; settings = st || {}; prodById = Object.fromEntries(ps.map((p) => [p.id, p])); draw(); })
    .catch((e) => { root.innerHTML = errorBox(Q.friendlyError(e)); });

  // ---------- render ----------
  function draw() {
    const c = computed();
    root.innerHTML = `<div class="v2-studio">
      ${renderLeft()}
      ${renderCenter()}
      ${renderRight(c)}
    </div>`;
    wire();
  }

  function renderLeft() {
    const custOpts = customers.map((x) => `<option value="${esc(x.id)}"${S.doc.customer_id === x.id ? ' selected' : ''}>${esc(x.name)}</option>`).join('');
    const lines = S.doc.lines.map((l, i) => {
      const cl = Q.computeLine(l, {});
      return `<div class="v2-studio-line${i === S.sel ? ' active' : ''}" data-line="${i}">
        <div class="v2-sl-main"><b>${esc(l.description || (l.kind === 'extra' ? 'Extra' : 'Riga ' + (i + 1)))}</b>
          <span class="v2-muted">${l.kind === 'extra' ? '🧩 extra' : '📦 prodotto'} · x${cl.qty} · ${eur(cl.imponibile)}</span></div>
        <div class="v2-sl-act">
          <button class="v2-btn v2-xs" data-up="${i}" title="Su">↑</button>
          <button class="v2-btn v2-xs" data-down="${i}" title="Giù">↓</button>
          <button class="v2-btn v2-xs v2-danger" data-delline="${i}" title="Elimina">✕</button>
        </div></div>`;
    }).join('');
    return `<div class="v2-studio-col v2-studio-left">
      <h3>Progetto</h3>
      <label>Titolo<input data-h="title" value="${esc(S.doc.title)}" placeholder="Es. Kit matrimonio Rossi"></label>
      <label>Cliente<select data-h="customer_id"><option value="">— nessuno —</option>${custOpts}</select></label>
      <div class="v2-form-row">
        <label>Priorità<select data-h="priority">${['low', 'normal', 'high', 'urgent'].map((p) => `<option value="${p}"${S.doc.priority === p ? ' selected' : ''}>${p}</option>`).join('')}</select></label>
        <label>Categoria<input data-h="category" value="${esc(S.doc.category)}"></label>
      </div>
      <div class="v2-form-row">
        <label>Validità<input data-h="valid_until" type="date" value="${esc((S.doc.valid_until || '').slice(0, 10))}"></label>
        <label>Acconto %<input data-h="deposit_pct" type="number" min="0" max="100" value="${esc(S.doc.deposit_pct || 0)}"></label>
      </div>
      <label>Note<textarea data-h="notes">${esc(S.doc.notes)}</textarea></label>
      <div class="v2-studio-lines-h"><h3>Righe</h3>
        <div><button class="v2-btn v2-xs" data-addline="product">+ Prodotto</button>
        <button class="v2-btn v2-xs" data-addline="extra">+ Extra</button></div></div>
      <div class="v2-studio-lines">${lines || '<div class="v2-empty">Nessuna riga.</div>'}</div>
    </div>`;
  }

  function renderCenter() {
    const l = S.doc.lines[S.sel];
    if (!l) return `<div class="v2-studio-col v2-studio-center"><div class="v2-empty">Seleziona o aggiungi una riga.</div></div>`;
    const prodOpts = products.map((p) => `<option value="${esc(p.id)}"${l.product_id === p.id ? ' selected' : ''}>${esc(p.name)} · ${eur(p.cost)}</option>`).join('');
    const isExtra = l.kind === 'extra';
    return `<div class="v2-studio-col v2-studio-center">
      <h3>Configurazione riga ${S.sel + 1} <span class="v2-chip">${isExtra ? 'Extra' : 'Prodotto'}</span></h3>
      ${!isExtra ? `<label>Prodotto dal catalogo<select data-c="product_id"><option value="">— libero —</option>${prodOpts}</select></label>` : ''}
      <label>Descrizione<input data-c="description" value="${esc(l.description || '')}"></label>
      <div class="v2-form-row">
        <label>Quantità<input data-c="quantity" type="number" min="1" step="1" value="${esc(l.quantity)}"></label>
        ${isExtra ? `<label>Costo extra €<input data-c="cost_extra" type="number" step="0.01" value="${esc(l.cost_extra)}"></label>` : ''}
      </div>
      ${!isExtra ? `<div class="v2-breakdown-inputs">
        <label>Materiale €<input data-c="cost_material" type="number" step="0.01" value="${esc(l.cost_material)}"></label>
        <label>Macchina €<input data-c="cost_machine" type="number" step="0.01" value="${esc(l.cost_machine)}"></label>
        <label>Lavoro €<input data-c="cost_labor" type="number" step="0.01" value="${esc(l.cost_labor)}"></label>
        <label>Design €<input data-c="cost_design" type="number" step="0.01" value="${esc(l.cost_design)}"></label>
        <label>Extra €<input data-c="cost_extra" type="number" step="0.01" value="${esc(l.cost_extra)}"></label>
      </div>` : ''}
      <div class="v2-form-row">
        <label>Markup %<input data-c="markup_pct" type="number" step="1" value="${esc(l.markup_pct)}"></label>
        <label>Sconto %<input data-c="discount_pct" type="number" step="1" value="${esc(l.discount_pct)}"></label>
        <label>IVA %<input data-c="vat_rate" type="number" step="1" value="${esc(l.vat_rate)}"></label>
      </div>
      <label>Specifiche tecniche<textarea data-c="spec">${esc(l.spec || '')}</textarea></label>
      <label>Immagine (URL/Storage)<input data-c="image_url" value="${esc(l.image_url || '')}" placeholder="riferimento immagine"></label>
    </div>`;
  }

  function renderRight(c) {
    const l = S.doc.lines[S.sel] || {};
    const cl = Q.computeLine(l, {});
    const tiers = Q.anchoringTiers(cl.unitCost, Number(l.markup_pct) || 0);
    const sugg = Q.priceForMargin(cl.unitCost, 60);
    const riskCls = c.risk === 'high' ? 'v2-bad' : c.risk === 'medium' ? '' : 'v2-ok';
    return `<div class="v2-studio-col v2-studio-right">
      <h3>Riepilogo</h3>
      <div class="v2-sum-line"><span>Costo totale</span><b data-r="cost">${eur(c.cost)}</b></div>
      <div class="v2-sum-line"><span>Imponibile</span><b data-r="imponibile">${eur(c.imponibile)}</b></div>
      <div class="v2-sum-line"><span>IVA</span><b data-r="iva">${eur(c.iva)}</b></div>
      <div class="v2-sum-line v2-sum-tot"><span>Totale cliente</span><b data-r="total">${eur(c.total)}</b></div>
      <div class="v2-sum-line"><span>Acconto</span><b data-r="deposit">${eur(c.deposit)}</b></div>
      <div class="v2-sum-line"><span>Margine</span><b data-r="margin" class="${riskCls}">${eur(c.margin)} (${c.marginPct}%)</b></div>
      <div class="v2-note ${riskCls}" data-r="risk" style="margin:8px 0">${esc(RISK_LABEL[c.risk] || '')}</div>
      <h4>Pricing intelligence <span class="v2-muted">(riga ${S.sel + 1})</span></h4>
      <div class="v2-anchor">
        <div><span>Economy</span><b data-r="economy">${eur(tiers.economy)}</b></div>
        <div class="v2-anchor-mid"><span>Consigliato</span><b data-r="consigliato">${eur(tiers.consigliato)}</b></div>
        <div><span>Premium</span><b data-r="premium">${eur(tiers.premium)}</b></div>
      </div>
      <div class="v2-sum-line"><span>Prezzo minimo (break-even)</span><b data-r="minprice">${eur(cl.minPrice)}</b></div>
      <div class="v2-sum-line"><span>Prezzo per margine 60%</span><b data-r="sugg">${sugg != null ? eur(sugg) : '—'}</b></div>
      <div class="v2-studio-actions">
        ${w ? '<button class="v2-btn" data-save>💾 Salva</button>' : ''}
        ${w && S.id ? '<button class="v2-btn v2-ghost" data-dup>Duplica</button>' : ''}
        <button class="v2-btn v2-ghost" data-pdf-client>📄 PDF Cliente</button>
        <button class="v2-btn v2-ghost" data-pdf-internal>🔒 PDF Interno</button>
        <button class="v2-btn v2-ghost" data-share>💬 WhatsApp</button>
        ${w && S.id ? '<button class="v2-btn v2-ghost" data-accept>✅ Accetta</button>' : ''}
        ${w && S.id ? '<button class="v2-btn" data-convert>➡️ Converti in ordine</button>' : ''}
      </div>
      <div class="v2-studio-open">
        <label>Apri esistente<select data-open><option value="">—</option></select></label>
      </div>
    </div>`;
  }

  // ---------- wiring ----------
  function wire() {
    root.querySelectorAll('[data-h]').forEach((el) => el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', () => {
      const k = el.getAttribute('data-h'); S.doc[k] = el.value;
      if (k === 'customer_id') { const c = customers.find((x) => String(x.id) === String(el.value)); S.doc.customer_name = c ? c.name : ''; }
      if (k === 'deposit_pct') refreshTotals();
    }));
    root.querySelectorAll('[data-c]').forEach((el) => el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', () => {
      const l = S.doc.lines[S.sel]; if (!l) return; const k = el.getAttribute('data-c');
      l[k] = el.value;
      if (k === 'product_id' && el.value) { const p = prodById[el.value]; if (p) { l.cost_material = p.cost != null ? p.cost : l.cost_material; if (!l.description) { l.description = p.name; const d = root.querySelector('[data-c="description"]'); if (d) d.value = p.name; } if (p.vat != null) l.vat_rate = p.vat; } draw(); return; }
      refreshTotals(); updateLineLabel();
    }));
    root.querySelectorAll('[data-line]').forEach((el) => el.addEventListener('click', (e) => { if (e.target.closest('[data-up],[data-down],[data-delline]')) return; S.sel = Number(el.getAttribute('data-line')); draw(); }));
    root.querySelectorAll('[data-addline]').forEach((b) => b.addEventListener('click', () => { S.doc.lines.push(newLine(b.getAttribute('data-addline'))); S.sel = S.doc.lines.length - 1; draw(); }));
    root.querySelectorAll('[data-delline]').forEach((b) => b.addEventListener('click', () => { const i = Number(b.getAttribute('data-delline')); S.doc.lines.splice(i, 1); if (!S.doc.lines.length) S.doc.lines.push(newLine('product')); S.sel = Math.max(0, Math.min(S.sel, S.doc.lines.length - 1)); draw(); }));
    root.querySelectorAll('[data-up]').forEach((b) => b.addEventListener('click', () => move(Number(b.getAttribute('data-up')), -1)));
    root.querySelectorAll('[data-down]').forEach((b) => b.addEventListener('click', () => move(Number(b.getAttribute('data-down')), 1)));

    const save = root.querySelector('[data-save]'); if (save) save.addEventListener('click', onSave);
    const dup = root.querySelector('[data-dup]'); if (dup) dup.addEventListener('click', onDuplicate);
    const pc = root.querySelector('[data-pdf-client]'); if (pc) pc.addEventListener('click', () => { DOC.printDoc(DOC.clientDocHTML(docForPdf(), computed(), settings, S.doc.category === 'B2B' ? 'b2b' : 'premium')); });
    const pi = root.querySelector('[data-pdf-internal]'); if (pi) pi.addEventListener('click', () => { DOC.printDoc(DOC.internalDocHTML(docForPdf(), computed(), settings)); });
    const sh = root.querySelector('[data-share]'); if (sh) sh.addEventListener('click', () => { const cust = customers.find((x) => String(x.id) === String(S.doc.customer_id)); const link = DOC.whatsappLink(docForPdf(), computed(), cust && cust.phone); try { window.open(link, '_blank'); } catch (_) {} toast(root, 'Link WhatsApp pronto'); });
    const acc = root.querySelector('[data-accept]'); if (acc) acc.addEventListener('click', async () => { try { await changeStatus(sb, S.id, 'ACCEPTED'); toast(root, 'Preventivo accettato'); } catch (e) { toast(root, Q.friendlyError(e)); } });
    const conv = root.querySelector('[data-convert]'); if (conv) conv.addEventListener('click', async () => { try { const o = await convertQuoteToOrder(sb, tenantId, S.id); toast(root, 'Ordine creato: ' + (o.number || '')); setTimeout(() => { location.hash = '#/gestione_ordini'; }, 500); } catch (e) { toast(root, Q.friendlyError(e)); } });

    populateOpen();
  }

  function move(i, dir) { const j = i + dir; if (j < 0 || j >= S.doc.lines.length) return; const t = S.doc.lines[i]; S.doc.lines[i] = S.doc.lines[j]; S.doc.lines[j] = t; S.sel = j; draw(); }
  function docForPdf() { return { ...S.doc, id: S.id, number: S._number }; }
  // Aggiorna in place SOLO i valori del pannello destro (focus-safe, no rewire).
  function refreshTotals() {
    const c = computed(); const l = S.doc.lines[S.sel] || {}; const cl = Q.computeLine(l, {});
    const tiers = Q.anchoringTiers(cl.unitCost, Number(l.markup_pct) || 0);
    const sugg = Q.priceForMargin(cl.unitCost, 60);
    const riskCls = c.risk === 'high' ? 'v2-bad' : c.risk === 'medium' ? '' : 'v2-ok';
    const set = (k, v) => { const el = root.querySelector(`[data-r="${k}"]`); if (el) el.textContent = v; };
    set('cost', eur(c.cost)); set('imponibile', eur(c.imponibile)); set('iva', eur(c.iva)); set('total', eur(c.total));
    set('deposit', eur(c.deposit)); set('minprice', eur(cl.minPrice)); set('sugg', sugg != null ? eur(sugg) : '—');
    set('economy', eur(tiers.economy)); set('consigliato', eur(tiers.consigliato)); set('premium', eur(tiers.premium));
    const mg = root.querySelector('[data-r="margin"]'); if (mg) { mg.textContent = `${eur(c.margin)} (${c.marginPct}%)`; mg.className = riskCls; }
    const rk = root.querySelector('[data-r="risk"]'); if (rk) { rk.textContent = RISK_LABEL[c.risk] || ''; rk.className = 'v2-note ' + riskCls; }
  }
  function updateLineLabel() { const el = root.querySelector(`.v2-studio-line[data-line="${S.sel}"] .v2-sl-main`); if (!el) return; const l = S.doc.lines[S.sel]; const cl = Q.computeLine(l, {}); el.innerHTML = `<b>${esc(l.description || 'Riga ' + (S.sel + 1))}</b><span class="v2-muted">${l.kind === 'extra' ? '🧩 extra' : '📦 prodotto'} · x${cl.qty} · ${eur(cl.imponibile)}</span>`; }

  async function onSave() {
    const save = root.querySelector('[data-save]'); if (save) save.disabled = true;
    try {
      const head = await STU.saveQuoteDoc(sb, tenantId, { ...S.doc, id: S.id });
      S.id = head.id; S._number = head.number;
      toast(root, 'Preventivo salvato: ' + (head.number || S.id));
      draw();
    } catch (e) { toast(root, Q.friendlyError(e)); if (save) save.disabled = false; }
  }
  async function onDuplicate() {
    try { const head = await STU.duplicateQuoteDoc(sb, tenantId, S.id); toast(root, 'Duplicato: ' + (head.number || head.id)); await openDoc(head.id); }
    catch (e) { toast(root, Q.friendlyError(e)); }
  }

  async function populateOpen() {
    const sel = root.querySelector('[data-open]'); if (!sel) return;
    try {
      const { data } = await sb.from('sales_quote').select('id,number,title,customer_name').is('deleted_at', null).order('created_at', { ascending: false }).limit(50);
      (data || []).forEach((q) => { const o = document.createElement('option'); o.value = q.id; o.textContent = (q.number || 'Bozza') + ' · ' + (q.title || q.customer_name || ''); sel.appendChild(o); });
      sel.addEventListener('change', () => { if (sel.value) openDoc(sel.value); });
    } catch (_) { /* lista non disponibile */ }
  }

  async function openDoc(id) {
    try {
      const { quote, lines } = await STU.loadQuoteDoc(sb, id);
      if (!quote) return;
      S.id = quote.id; S._number = quote.number;
      S.doc = {
        title: quote.title || '', customer_id: quote.customer_id || '', customer_name: quote.customer_name || '',
        priority: quote.priority || 'normal', category: quote.category || '', notes: quote.notes || '',
        valid_until: quote.valid_until || '', deposit_pct: quote.deposit_pct || 0,
        lines: (lines.length ? lines : [newLine('product')]).map((l) => ({
          kind: l.kind || 'product', description: l.description || '', product_id: l.product_id || null,
          quantity: l.quantity != null ? l.quantity : 1, cost_material: l.cost_material || 0, cost_machine: l.cost_machine || 0,
          cost_labor: l.cost_labor || 0, cost_design: l.cost_design || 0, cost_extra: l.cost_extra || 0,
          markup_pct: l.markup_pct != null ? l.markup_pct : 200, discount_pct: l.discount_pct || 0,
          vat_rate: l.vat_rate != null ? l.vat_rate : 22, spec: l.spec || '', image_url: l.image_url || '',
        })),
      };
      S.sel = 0; draw();
    } catch (e) { toast(root, Q.friendlyError(e)); }
  }
}
