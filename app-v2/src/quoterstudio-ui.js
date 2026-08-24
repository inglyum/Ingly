// INGLY OS V2 — Smart Quoter Studio (premium). Ogni prodotto è costruito da
// LAVORAZIONI (Configura Lavorazione): materiale, laser/macchina, manodopera,
// verniciatura, gadget/minuteria, prodotto da catalogo. Ogni lavorazione può
// leggere una RISORSA DA LISTINO reale (catalogo/magazzino) — nessuna seconda
// anagrafica. Risponde a "quanto costa produrre" e "a quanto vendere". Snapshot
// storico congelato. No alert/confirm nativi. Responsive.
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
const toast = (msg) => { const t = document.createElement('div'); t.className = 'v2-toast'; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 2600); };
const loading = (m) => `<div class="v2-loading">⏳ ${esc(m || 'Caricamento…')}</div>`;
const errorBox = (m) => `<div class="v2-errbox">⚠️ ${esc(m || 'Errore')}</div>`;

const CATS = Q.WORKING_CATEGORIES;
const CAT_LABEL = Object.fromEntries(CATS.map((c) => [c.k, c.label]));
const CAT_ICON = Object.fromEntries(CATS.map((c) => [c.k, c.icon]));
const RISK_LABEL = { high: '⚠️ Margine a rischio', medium: '⚠️ Margine sotto soglia', low: '✅ Margine sano' };

function newWorking(cat) {
  const b = { category: cat || 'material', description: '', resource_id: null };
  if (cat === 'machine') return { ...b, minutes: 10, cost_per_min: 0 };
  if (cat === 'labor') return { ...b, minutes: 30, hours: 0, rate_per_hour: 18 };
  if (cat === 'painting') return { ...b, surface_mq: 1, cost_per_mq: 0, coats: 1 };
  if (cat === 'gadget' || cat === 'catalog') return { ...b, quantity: 1, unit_cost: 0 };
  return { ...b, mq: 1, sfrido_pct: 15, cost_per_mq: 0 }; // material
}
const newLine = () => ({ description: 'Prodotto', product_id: null, quantity: 1, markup_pct: 200, discount_pct: 0, vat_rate: 22, spec: '', image_url: '', workings: [newWorking('material')] });

export function mount(container, { sb, ctx }) {
  if (!container) return;
  const role = roleForTenant(ctx || {}, (ctx || {}).activeTenant) || '—';
  const w = CRM.canWrite(role);
  const tenantId = (ctx || {}).activeTenant || null;
  const root = container.querySelector('[data-quoterstudio-root]') || container;
  root.innerHTML = loading('Inizializzazione Smart Quoter…');

  const S = { doc: { title: '', customer_id: '', customer_name: '', priority: 'normal', category: '', notes: '', valid_until: '', deposit_pct: 0, lines: [newLine()] }, sel: 0, selW: 0, id: null };
  let customers = [], products = [], settings = {}, prodById = {};

  const line = () => S.doc.lines[S.sel];
  const working = () => { const l = line(); return l && l.workings[S.selW]; };
  function computedDoc() { return Q.computeDocument(S.doc.lines, { depositPct: S.doc.deposit_pct, minMarginPct: 55 }); }

  Promise.all([
    CRM.listCustomers(sb, { limit: 500 }).catch(() => []),
    listProducts(sb, { limit: 1000 }).catch(() => []),
    getSettings(sb, tenantId).catch(() => ({})),
  ]).then(([cs, ps, st]) => { customers = cs; products = ps; settings = st || {}; prodById = Object.fromEntries(ps.map((p) => [p.id, p])); draw(); })
    .catch((e) => { root.innerHTML = errorBox(Q.friendlyError(e)); });

  // ---------- RENDER ----------
  function draw() { root.innerHTML = `<div class="v2-studio">${renderLeft()}${renderCenter()}${renderRight()}</div>`; wire(); }

  function renderLeft() {
    const custOpts = customers.map((x) => `<option value="${esc(x.id)}"${S.doc.customer_id === x.id ? ' selected' : ''}>${esc(x.name)}</option>`).join('');
    const prods = S.doc.lines.map((l, i) => {
      const c = Q.computeLine(l, {});
      return `<div class="v2-studio-line${i === S.sel ? ' active' : ''}" data-prod="${i}">
        <div class="v2-sl-main"><b>${esc(l.description || 'Prodotto ' + (i + 1))}</b>
          <span class="v2-muted">${l.workings.length} lavorazioni · costo ${eur(c.unitCost)} · ${eur(c.total)}</span></div>
        <div class="v2-sl-act"><button class="v2-btn v2-xs v2-danger" data-delprod="${i}">✕</button></div></div>`;
    }).join('');
    const l = line();
    const works = l ? l.workings.map((wk, j) => {
      const cw = Q.computeWorking(wk);
      return `<div class="v2-work-row${j === S.selW ? ' active' : ''}" data-work="${j}">
        <div class="v2-wr-main"><b>${CAT_ICON[wk.category] || '•'} ${esc(wk.description || CAT_LABEL[wk.category] || 'Lavorazione')}</b>
          <span class="v2-muted">${esc(CAT_LABEL[wk.category] || wk.category)} · ${eur(cw.cost)}</span></div>
        <div class="v2-sl-act">
          <button class="v2-btn v2-xs" data-wdup="${j}" title="Duplica">⧉</button>
          <button class="v2-btn v2-xs" data-wup="${j}" title="Su">↑</button>
          <button class="v2-btn v2-xs" data-wdown="${j}" title="Giù">↓</button>
          <button class="v2-btn v2-xs v2-danger" data-wdel="${j}" title="Elimina">✕</button></div></div>`;
    }).join('') : '';
    return `<div class="v2-studio-col v2-studio-left">
      <h3>Progetto</h3>
      <label>Titolo<input data-h="title" value="${esc(S.doc.title)}" placeholder="Es. Kit matrimonio Rossi"></label>
      <label>Cliente<select data-h="customer_id"><option value="">— nessuno —</option>${custOpts}</select></label>
      <div class="v2-form-row">
        <label>Priorità<select data-h="priority">${['low', 'normal', 'high', 'urgent'].map((p) => `<option value="${p}"${S.doc.priority === p ? ' selected' : ''}>${p}</option>`).join('')}</select></label>
        <label>Validità<input data-h="valid_until" type="date" value="${esc((S.doc.valid_until || '').slice(0, 10))}"></label>
      </div>
      <div class="v2-form-row">
        <label>Categoria<input data-h="category" value="${esc(S.doc.category)}"></label>
        <label>Acconto %<input data-h="deposit_pct" type="number" min="0" max="100" value="${esc(S.doc.deposit_pct || 0)}"></label>
      </div>
      <div class="v2-studio-lines-h"><h3>Prodotti</h3><button class="v2-btn v2-xs" data-addprod>+ Prodotto</button></div>
      <div class="v2-studio-lines">${prods}</div>
      <div class="v2-studio-lines-h"><h3>Lavorazioni</h3><button class="v2-btn v2-xs" data-addwork>+ Aggiungi lavorazione</button></div>
      <div class="v2-studio-lines">${works || '<div class="v2-empty">Nessuna lavorazione.</div>'}</div>
    </div>`;
  }

  function resourceOpts(sel) {
    return '<option value="">— manuale —</option>' + products.map((p) => `<option value="${esc(p.id)}"${sel === p.id ? ' selected' : ''}>${esc(p.name)} · ${eur(p.cost)}${p.unit ? '/' + esc(p.unit) : ''}</option>`).join('');
  }

  function renderCenter() {
    const l = line(); const wk = working();
    if (!l) return `<div class="v2-studio-col v2-studio-center"><div class="v2-empty">Aggiungi un prodotto.</div></div>`;
    const catOpts = CATS.map((c) => `<option value="${c.k}"${wk && wk.category === c.k ? ' selected' : ''}>${c.icon} ${c.label}</option>`).join('');
    let params = '<div class="v2-empty">Seleziona o aggiungi una lavorazione.</div>';
    if (wk) {
      const f = (k, label, step) => `<label>${esc(label)}<input data-w="${k}" type="number" step="${step || '0.01'}" value="${esc(wk[k] != null ? wk[k] : 0)}"></label>`;
      const cw = Q.computeWorking(wk);
      let fields = '';
      if (wk.category === 'material') fields = `${f('mq', 'Quantità (mq)', '0.01')}${f('sfrido_pct', 'Sfrido %', '1')}${f('cost_per_mq', 'Costo / mq €', '0.01')}`;
      else if (wk.category === 'machine') fields = `${f('minutes', 'Minuti', '1')}${f('cost_per_min', 'Costo / min €', '0.01')}`;
      else if (wk.category === 'labor') fields = `${f('minutes', 'Minuti', '1')}${f('hours', 'Ore', '0.25')}${f('rate_per_hour', 'Tariffa €/h', '0.5')}`;
      else if (wk.category === 'painting') fields = `${f('surface_mq', 'Superficie (mq)', '0.01')}${f('cost_per_mq', 'Costo / mq €', '0.01')}${f('coats', 'Mani', '1')}`;
      else fields = `${f('quantity', 'Quantità', '1')}${f('unit_cost', 'Costo unitario €', '0.01')}`;
      params = `
        <label>Categoria<select data-w="category">${catOpts}</select></label>
        <label>Risorsa da listino<select data-wres>${resourceOpts(wk.resource_id)}</select></label>
        <label>Descrizione<input data-w="description" value="${esc(wk.description || '')}"></label>
        <div class="v2-breakdown-inputs">${fields}</div>
        <div class="v2-work-cost">Costo lavorazione: <b>${eur(cw.cost)}</b></div>`;
    }
    return `<div class="v2-studio-col v2-studio-center">
      <h3>⚙️ Configura Lavorazione</h3>
      <div class="v2-muted" style="margin-bottom:10px">Prodotto: <b>${esc(l.description || 'Prodotto ' + (S.sel + 1))}</b></div>
      <label>Nome prodotto<input data-l="description" value="${esc(l.description || '')}"></label>
      <label>Prodotto dal catalogo<select data-lprod><option value="">— libero —</option>${products.map((p) => `<option value="${esc(p.id)}"${l.product_id === p.id ? ' selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>
      ${params}
      <label style="margin-top:12px">Specifiche tecniche<textarea data-l="spec">${esc(l.spec || '')}</textarea></label>
      <label>Immagine (URL/Storage)<input data-l="image_url" value="${esc(l.image_url || '')}"></label>
    </div>`;
  }

  function renderRight() {
    const l = line(); const cl = Q.computeLine(l, {}); const d = computedDoc();
    const cats = ['material', 'machine', 'labor', 'painting', 'gadget', 'catalog'];
    const catSum = Object.fromEntries(cats.map((k) => [k, 0]));
    (cl.workings || []).forEach((wk) => { catSum[wk.category] = (catSum[wk.category] || 0) + wk.cost; });
    const rows = cats.filter((k) => catSum[k] > 0).map((k) => `<div class="v2-sum-line"><span>${CAT_ICON[k]} ${esc(CAT_LABEL[k])}</span><b>${eur(catSum[k])}</b></div>`).join('') || '<div class="v2-muted">Nessuna lavorazione</div>';
    const tiers = Q.anchoringTiers(cl.unitCost, Number(l.markup_pct) || 0);
    const sugg = Q.priceForMargin(cl.unitCost, 60);
    const riskCls = cl.marginPct < 55 ? 'v2-bad' : cl.marginPct < 65 ? '' : 'v2-ok';
    return `<div class="v2-studio-col v2-studio-right">
      <h3>Cost Breakdown <span class="v2-muted">prodotto</span></h3>
      ${rows}
      <div class="v2-sum-line v2-sum-tot"><span>Costo produzione (unit.)</span><b data-r="unitcost">${eur(cl.unitCost)}</b></div>
      <div class="v2-form-row" style="margin-top:8px">
        <label>Markup %<input data-l="markup_pct" type="number" step="1" value="${esc(l.markup_pct)}"></label>
        <label>Sconto %<input data-l="discount_pct" type="number" step="1" value="${esc(l.discount_pct)}"></label>
        <label>IVA %<input data-l="vat_rate" type="number" step="1" value="${esc(l.vat_rate)}"></label>
      </div>
      <div class="v2-form-row"><label>Quantità<input data-l="quantity" type="number" min="1" step="1" value="${esc(l.quantity)}"></label></div>
      <div class="v2-sum-line"><span>Prezzo cliente (unit.)</span><b data-r="unitprice">${eur(cl.unitPrice)}</b></div>
      <div class="v2-sum-line"><span>Margine</span><b data-r="margin" class="${riskCls}">${eur(cl.margin)} (${cl.marginPct}%)</b></div>
      <div class="v2-note ${riskCls}" data-r="risk" style="margin:6px 0">${esc(RISK_LABEL[Q.marginRisk(cl.marginPct, 55)])}</div>
      <div class="v2-sum-line"><span>Prezzo minimo</span><b data-r="minprice">${eur(cl.minPrice)}</b></div>
      <div class="v2-sum-line"><span>Prezzo target (margine 60%)</span><b data-r="target">${sugg != null ? eur(sugg) : '—'}</b></div>
      <div class="v2-anchor">
        <div><span>Economy</span><b data-r="economy">${eur(tiers.economy)}</b></div>
        <div class="v2-anchor-mid"><span>Consigliato</span><b data-r="consigliato">${eur(tiers.consigliato)}</b></div>
        <div><span>Premium</span><b data-r="premium">${eur(tiers.premium)}</b></div>
      </div>
      <h4>Totale documento</h4>
      <div class="v2-sum-line"><span>Imponibile</span><b data-r="doc-imp">${eur(d.imponibile)}</b></div>
      <div class="v2-sum-line"><span>IVA</span><b data-r="doc-iva">${eur(d.iva)}</b></div>
      <div class="v2-sum-line v2-sum-tot"><span>Totale cliente</span><b data-r="doc-total">${eur(d.total)}</b></div>
      ${d.deposit ? `<div class="v2-sum-line"><span>Acconto ${d.depositPct}%</span><b data-r="doc-dep">${eur(d.deposit)}</b></div>` : '<div class="v2-sum-line"><span>Acconto</span><b data-r="doc-dep">€0,00</b></div>'}
      <div class="v2-studio-actions">
        ${w ? '<button class="v2-btn" data-save>💾 Salva</button>' : ''}
        ${w && S.id ? '<button class="v2-btn v2-ghost" data-dup>Duplica</button>' : ''}
        <button class="v2-btn v2-ghost" data-pdf-client>📄 PDF Cliente</button>
        <button class="v2-btn v2-ghost" data-pdf-internal>🔒 PDF Interno</button>
        <button class="v2-btn v2-ghost" data-share>💬 WhatsApp</button>
        ${w && S.id ? '<button class="v2-btn v2-ghost" data-accept>✅ Accetta</button>' : ''}
        ${w && S.id ? '<button class="v2-btn" data-convert>➡️ Converti in ordine</button>' : ''}
      </div>
      <div class="v2-studio-open"><label>Apri esistente<select data-open><option value="">—</option></select></label></div>
    </div>`;
  }

  // ---------- WIRE ----------
  function wire() {
    root.querySelectorAll('[data-h]').forEach((el) => el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', () => {
      const k = el.getAttribute('data-h'); S.doc[k] = el.value;
      if (k === 'customer_id') { const c = customers.find((x) => String(x.id) === String(el.value)); S.doc.customer_name = c ? c.name : ''; }
      if (k === 'deposit_pct') refreshTotals();
    }));
    // campi prodotto (line): description/spec/image → no re-render; markup/discount/vat/quantity → refreshTotals
    root.querySelectorAll('[data-l]').forEach((el) => el.addEventListener('input', () => {
      const l = line(); if (!l) return; const k = el.getAttribute('data-l'); l[k] = el.value;
      if (k === 'description') updateProdLabel();
      if (['markup_pct', 'discount_pct', 'vat_rate', 'quantity'].includes(k)) refreshTotals();
    }));
    const lprod = root.querySelector('[data-lprod]'); if (lprod) lprod.addEventListener('change', () => { const l = line(); const p = prodById[lprod.value]; l.product_id = lprod.value || null; if (p && !l.description) l.description = p.name; draw(); });
    // configura lavorazione
    root.querySelectorAll('[data-w]').forEach((el) => el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', () => {
      const wk = working(); if (!wk) return; const k = el.getAttribute('data-w'); wk[k] = el.value;
      if (k === 'category') { Object.assign(wk, newWorking(el.value), { description: wk.description, resource_id: null }); draw(); return; }
      updateWorkLabel(); refreshTotals();
    }));
    const wres = root.querySelector('[data-wres]'); if (wres) wres.addEventListener('change', () => applyResource(wres.value));
    // selezioni & liste
    root.querySelectorAll('[data-prod]').forEach((el) => el.addEventListener('click', (e) => { if (e.target.closest('[data-delprod]')) return; S.sel = Number(el.getAttribute('data-prod')); S.selW = 0; draw(); }));
    root.querySelectorAll('[data-work]').forEach((el) => el.addEventListener('click', (e) => { if (e.target.closest('[data-wdup],[data-wup],[data-wdown],[data-wdel]')) return; S.selW = Number(el.getAttribute('data-work')); draw(); }));
    const ap = root.querySelector('[data-addprod]'); if (ap) ap.addEventListener('click', () => { S.doc.lines.push(newLine()); S.sel = S.doc.lines.length - 1; S.selW = 0; draw(); });
    root.querySelectorAll('[data-delprod]').forEach((b) => b.addEventListener('click', () => { S.doc.lines.splice(Number(b.getAttribute('data-delprod')), 1); if (!S.doc.lines.length) S.doc.lines.push(newLine()); S.sel = Math.max(0, Math.min(S.sel, S.doc.lines.length - 1)); S.selW = 0; draw(); }));
    const aw = root.querySelector('[data-addwork]'); if (aw) aw.addEventListener('click', () => { const l = line(); l.workings.push(newWorking('material')); S.selW = l.workings.length - 1; draw(); });
    root.querySelectorAll('[data-wdel]').forEach((b) => b.addEventListener('click', () => { const l = line(); l.workings.splice(Number(b.getAttribute('data-wdel')), 1); if (!l.workings.length) l.workings.push(newWorking('material')); S.selW = Math.max(0, Math.min(S.selW, l.workings.length - 1)); draw(); }));
    root.querySelectorAll('[data-wdup]').forEach((b) => b.addEventListener('click', () => { const l = line(); const j = Number(b.getAttribute('data-wdup')); l.workings.splice(j + 1, 0, { ...l.workings[j] }); S.selW = j + 1; draw(); }));
    root.querySelectorAll('[data-wup]').forEach((b) => b.addEventListener('click', () => moveWork(Number(b.getAttribute('data-wup')), -1)));
    root.querySelectorAll('[data-wdown]').forEach((b) => b.addEventListener('click', () => moveWork(Number(b.getAttribute('data-wdown')), 1)));
    // azioni
    const save = root.querySelector('[data-save]'); if (save) save.addEventListener('click', onSave);
    const dup = root.querySelector('[data-dup]'); if (dup) dup.addEventListener('click', onDuplicate);
    const pc = root.querySelector('[data-pdf-client]'); if (pc) pc.addEventListener('click', () => DOC.printDoc(DOC.clientDocHTML(docForPdf(), computedDoc(), settings, S.doc.category === 'B2B' ? 'b2b' : 'premium')));
    const pi = root.querySelector('[data-pdf-internal]'); if (pi) pi.addEventListener('click', () => DOC.printDoc(DOC.internalDocHTML(docForPdf(), computedDoc(), settings)));
    const sh = root.querySelector('[data-share]'); if (sh) sh.addEventListener('click', () => { const cust = customers.find((x) => String(x.id) === String(S.doc.customer_id)); try { window.open(DOC.whatsappLink(docForPdf(), computedDoc(), cust && cust.phone), '_blank'); } catch (_) {} toast('Link WhatsApp pronto'); });
    const acc = root.querySelector('[data-accept]'); if (acc) acc.addEventListener('click', async () => { try { await changeStatus(sb, S.id, 'ACCEPTED'); toast('Preventivo accettato'); } catch (e) { toast(Q.friendlyError(e)); } });
    const conv = root.querySelector('[data-convert]'); if (conv) conv.addEventListener('click', async () => { try { const o = await convertQuoteToOrder(sb, tenantId, S.id); toast('Ordine creato: ' + (o.number || '')); setTimeout(() => { location.hash = '#/gestione_ordini'; }, 500); } catch (e) { toast(Q.friendlyError(e)); } });
    populateOpen();
  }

  function applyResource(id) {
    const wk = working(); const p = prodById[id]; if (!wk) return;
    wk.resource_id = id || null;
    if (p) {
      if (!wk.description) wk.description = p.name;
      const cost = Number(p.cost) || 0;
      if (wk.category === 'material' || wk.category === 'painting') wk.cost_per_mq = cost;
      else if (wk.category === 'gadget' || wk.category === 'catalog') wk.unit_cost = cost;
      // machine/labor: la risorsa fornisce il nome; tariffa/min impostate dall'utente
    }
    draw();
  }
  function moveWork(i, dir) { const l = line(); const j = i + dir; if (j < 0 || j >= l.workings.length) return; const t = l.workings[i]; l.workings[i] = l.workings[j]; l.workings[j] = t; S.selW = j; draw(); }
  function docForPdf() { return { ...S.doc, id: S.id, number: S._number }; }

  function refreshTotals() {
    const l = line(); const cl = Q.computeLine(l, {}); const d = computedDoc();
    const tiers = Q.anchoringTiers(cl.unitCost, Number(l.markup_pct) || 0);
    const sugg = Q.priceForMargin(cl.unitCost, 60);
    const riskCls = cl.marginPct < 55 ? 'v2-bad' : cl.marginPct < 65 ? '' : 'v2-ok';
    const set = (k, v) => { const el = root.querySelector(`[data-r="${k}"]`); if (el) el.textContent = v; };
    set('unitcost', eur(cl.unitCost)); set('unitprice', eur(cl.unitPrice)); set('minprice', eur(cl.minPrice));
    set('target', sugg != null ? eur(sugg) : '—'); set('economy', eur(tiers.economy)); set('consigliato', eur(tiers.consigliato)); set('premium', eur(tiers.premium));
    set('doc-imp', eur(d.imponibile)); set('doc-iva', eur(d.iva)); set('doc-total', eur(d.total)); set('doc-dep', eur(d.deposit));
    const mg = root.querySelector('[data-r="margin"]'); if (mg) { mg.textContent = `${eur(cl.margin)} (${cl.marginPct}%)`; mg.className = riskCls; }
    const rk = root.querySelector('[data-r="risk"]'); if (rk) { rk.textContent = RISK_LABEL[Q.marginRisk(cl.marginPct, 55)]; rk.className = 'v2-note ' + riskCls; }
  }
  function updateProdLabel() { const el = root.querySelector(`.v2-studio-line[data-prod="${S.sel}"] .v2-sl-main b`); if (el) el.textContent = line().description || 'Prodotto ' + (S.sel + 1); }
  function updateWorkLabel() { const wk = working(); const el = root.querySelector(`.v2-work-row[data-work="${S.selW}"]`); if (!el || !wk) return; const cw = Q.computeWorking(wk); el.querySelector('.v2-wr-main b').textContent = `${CAT_ICON[wk.category] || '•'} ${wk.description || CAT_LABEL[wk.category] || 'Lavorazione'}`; el.querySelector('.v2-wr-main span').textContent = `${CAT_LABEL[wk.category] || wk.category} · ${eur(cw.cost)}`; }

  async function onSave() {
    const save = root.querySelector('[data-save]'); if (save) save.disabled = true;
    try { const head = await STU.saveQuoteDoc(sb, tenantId, { ...S.doc, id: S.id }); S.id = head.id; S._number = head.number; toast('Preventivo salvato: ' + (head.number || S.id)); draw(); }
    catch (e) { toast(Q.friendlyError(e)); if (save) save.disabled = false; }
  }
  async function onDuplicate() { try { const head = await STU.duplicateQuoteDoc(sb, tenantId, S.id); toast('Duplicato: ' + (head.number || head.id)); await openDoc(head.id); } catch (e) { toast(Q.friendlyError(e)); } }

  async function populateOpen() {
    const sel = root.querySelector('[data-open]'); if (!sel) return;
    try { const { data } = await sb.from('sales_quote').select('id,number,title,customer_name').is('deleted_at', null).order('created_at', { ascending: false }).limit(50);
      (data || []).forEach((q) => { const o = document.createElement('option'); o.value = q.id; o.textContent = (q.number || 'Bozza') + ' · ' + (q.title || q.customer_name || ''); sel.appendChild(o); });
      sel.addEventListener('change', () => { if (sel.value) openDoc(sel.value); });
    } catch (_) { /* lista non disponibile */ }
  }

  async function openDoc(id) {
    try {
      const { quote, lines } = await STU.loadQuoteDoc(sb, id); if (!quote) return;
      S.id = quote.id; S._number = quote.number;
      S.doc = {
        title: quote.title || '', customer_id: quote.customer_id || '', customer_name: quote.customer_name || '',
        priority: quote.priority || 'normal', category: quote.category || '', notes: quote.notes || '',
        valid_until: quote.valid_until || '', deposit_pct: quote.deposit_pct || 0,
        lines: (lines.length ? lines : [null]).map((l) => l ? {
          description: l.description || '', product_id: l.product_id || null, quantity: l.quantity != null ? l.quantity : 1,
          markup_pct: l.markup_pct != null ? l.markup_pct : 200, discount_pct: l.discount_pct || 0, vat_rate: l.vat_rate != null ? l.vat_rate : 22,
          spec: l.spec || '', image_url: l.image_url || '',
          workings: Array.isArray(l.workings) && l.workings.length ? l.workings.map((x) => ({ ...x })) : [newWorking('material')],
        } : newLine()),
      };
      S.sel = 0; S.selW = 0; draw();
    } catch (e) { toast(Q.friendlyError(e)); }
  }
}
