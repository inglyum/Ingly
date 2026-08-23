// INGLY OS V2 — Catalogo UI PREMIUM. Griglia prodotti con immagini, ricerca,
// filtri (categoria/stato), ordinamento, skeleton loading, empty/error state,
// drawer di dettaglio, form premium con upload immagine (drag&drop/preview/
// replace/remove/progress). Nessun alert()/confirm(): modale + toast custom.
// Architettura invariata: data-layer catalog.js + storage.js. Compatibile
// Supabase reale e mock demo.
import * as CAT from './catalog.js';
import * as ST from './storage.js';
import { roleForTenant } from './context.js';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const eur = (n) => '€' + (Number(n || 0)).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const kindLabel = (k) => (k === 'service' ? 'Servizio' : 'Prodotto');

// ── render puri (testabili) ────────────────────────────────────────────────
function thumb(p, big) {
  const cls = big ? 'cat-img cat-img-lg' : 'cat-img';
  if (p.image_url) return `<div class="${cls}"><img src="${esc(p.image_url)}" alt="${esc(p.name)}" loading="lazy"></div>`;
  return `<div class="${cls} cat-img-ph" aria-hidden="true"><span>${esc((p.name || '?').slice(0, 1).toUpperCase())}</span></div>`;
}

export function renderProductCard(p) {
  const mp = CAT.marginPercent(p);
  const mtone = mp >= 50 ? 'good' : (mp >= 20 ? 'mid' : 'low');
  return `<article class="cat-card" data-prod="${esc(p.id)}" tabindex="0" role="button" aria-label="${esc(p.name)}">
    ${thumb(p)}
    <div class="cat-card-body">
      <div class="cat-card-top">
        <h3 class="cat-name">${esc(p.name)}</h3>
        <span class="cat-status ${p.active === false ? 'off' : 'on'}">${p.active === false ? 'Archiviato' : 'Attivo'}</span>
      </div>
      <div class="cat-meta">${esc(p.sku || '—')} · <span class="v2-chip">${esc(kindLabel(p.kind))}</span>${p.category ? ' · ' + esc(p.category) : ''}</div>
      <div class="cat-pricerow">
        <div><span class="cat-lbl">Prezzo</span><b>${eur(p.price)}</b></div>
        <div><span class="cat-lbl">Costo</span><b>${eur(p.cost)}</b></div>
        <div><span class="cat-lbl">Margine</span><b class="cat-margin ${mtone}">${mp}%</b></div>
      </div>
    </div></article>`;
}

export function renderProductGrid(list) {
  if (!list || !list.length) return renderEmpty();
  return `<div class="cat-grid">${list.map(renderProductCard).join('')}</div>`;
}
// compat storica (alcuni test): righe → ora rende la griglia premium
export const renderProductRows = renderProductGrid;

export function renderSkeleton(n = 6) {
  return `<div class="cat-grid">${Array.from({ length: n }).map(() => `<div class="cat-card cat-skel">
    <div class="cat-img skel"></div><div class="cat-card-body">
    <div class="skel-line w60"></div><div class="skel-line w40"></div><div class="skel-line w80"></div></div></div>`).join('')}</div>`;
}

export function renderEmpty() {
  return `<div class="cat-empty"><div class="cat-empty-ico">📦</div>
    <h3>Nessun prodotto</h3><p>Crea il primo prodotto o servizio, oppure modifica i filtri di ricerca.</p></div>`;
}

export function renderProductDetail(p, role) {
  if (!p) return `<div class="cat-empty"><h3>Prodotto non trovato</h3></div>`;
  const w = CAT.canWrite(role); const d = CAT.canDelete(role);
  const mp = CAT.marginPercent(p);
  return `<div class="cat-detail">
    <header class="cat-detail-head">
      <button class="btn btn-ghost" data-back>← Catalogo</button>
      <div class="cat-detail-actions">
        ${w ? '<button class="btn" data-edit="' + esc(p.id) + '">Modifica</button>' : ''}
        ${d ? '<button class="btn btn-danger" data-del="' + esc(p.id) + '">Archivia</button>' : ''}
      </div>
    </header>
    <div class="cat-detail-body">
      ${thumb(p, true)}
      <div class="cat-detail-info">
        <div class="cat-detail-title"><h2>${esc(p.name)}</h2>
          <span class="cat-status ${p.active === false ? 'off' : 'on'}">${p.active === false ? 'Archiviato' : 'Attivo'}</span></div>
        <div class="cat-detail-meta">${esc(p.sku || '—')} · ${esc(kindLabel(p.kind))}${p.category ? ' · ' + esc(p.category) : ''}</div>
        ${p.description || p.notes ? `<p class="cat-desc">${esc(p.description || p.notes)}</p>` : ''}
        <div class="cat-kpis">
          <div class="cat-kpi"><span>Prezzo</span><b>${eur(p.price)}</b></div>
          <div class="cat-kpi"><span>Costo</span><b>${eur(p.cost)}</b></div>
          <div class="cat-kpi"><span>Margine</span><b>${eur(CAT.marginValue(p))}</b></div>
          <div class="cat-kpi"><span>Margine %</span><b>${mp}%</b></div>
          <div class="cat-kpi"><span>Unità</span><b>${esc(p.unit || 'pz')}</b></div>
          <div class="cat-kpi"><span>IVA</span><b>${p.vat != null && p.vat !== '' ? esc(p.vat) + '%' : '—'}</b></div>
        </div>
        ${(p.tags && p.tags.length) ? `<div class="cat-tags">${p.tags.map((t) => `<span class="v2-chip">${esc(t)}</span>`).join(' ')}</div>` : ''}
      </div>
    </div></div>`;
}

export function renderProductForm(p) {
  p = p || {};
  const img = p.image_url;
  return `<form class="cat-form" data-prod-form="${esc(p.id || '')}" novalidate>
    <h2>${p.id ? 'Modifica prodotto' : 'Nuovo prodotto'}</h2>
    <div class="cat-form-grid">
      <div class="cat-form-left">
        <div class="cat-drop ${img ? 'has-img' : ''}" data-drop tabindex="0" role="button" aria-label="Carica immagine">
          <input type="file" accept="image/png,image/jpeg,image/webp" data-file hidden>
          <div class="cat-drop-preview" data-preview>${img ? `<img src="${esc(img)}" alt="anteprima">` : ''}</div>
          <div class="cat-drop-hint" data-hint>
            <div class="cat-drop-ico">🖼️</div>
            <div><b>Trascina un'immagine</b> o clicca per caricare</div>
            <div class="cat-drop-sub">PNG · JPG · WEBP — max 5 MB</div>
          </div>
          <div class="cat-drop-progress" data-progress hidden><div class="bar" data-bar></div></div>
        </div>
        <div class="cat-drop-actions">
          <button type="button" class="btn btn-ghost btn-sm" data-img-replace>Sostituisci</button>
          <button type="button" class="btn btn-ghost btn-sm" data-img-remove ${img ? '' : 'hidden'}>Rimuovi</button>
        </div>
        <div class="cat-field-err" data-img-err></div>
      </div>
      <div class="cat-form-right">
        <label class="fld">Nome*<input name="name" required value="${esc(p.name || '')}"></label>
        <div class="fld-row">
          <label class="fld">SKU<input name="sku" value="${esc(p.sku || '')}"></label>
          <label class="fld">Categoria<input name="category" value="${esc(p.category || '')}"></label>
        </div>
        <div class="fld-row">
          <label class="fld">Tipo<select name="kind"><option value="product"${p.kind === 'service' ? '' : ' selected'}>Prodotto</option><option value="service"${p.kind === 'service' ? ' selected' : ''}>Servizio</option></select></label>
          <label class="fld">Unità<select name="unit">${['pz', 'h', 'm', 'm²', 'kg'].map((u) => `<option${(p.unit || 'pz') === u ? ' selected' : ''}>${u}</option>`).join('')}</select></label>
        </div>
        <div class="fld-row">
          <label class="fld">Prezzo €<input name="price" type="number" step="0.01" min="0" value="${esc(p.price != null ? p.price : '')}"></label>
          <label class="fld">Costo €<input name="cost" type="number" step="0.01" min="0" value="${esc(p.cost != null ? p.cost : '')}"></label>
          <label class="fld">IVA %<input name="vat" type="number" step="0.01" min="0" value="${esc(p.vat != null ? p.vat : '')}"></label>
        </div>
        <div class="cat-margin-preview" data-margin-preview></div>
        <label class="fld">Tag (virgola)<input name="tags" value="${esc((p.tags || []).join(', '))}"></label>
        <label class="fld">Descrizione<textarea name="description">${esc(p.description || p.notes || '')}</textarea></label>
        <label class="chk"><input type="checkbox" name="active" ${p.active === false ? '' : 'checked'}> Attivo</label>
      </div>
    </div>
    <div class="cat-form-actions">
      <button type="button" class="btn btn-ghost" data-cancel>Annulla</button>
      <button type="submit" class="btn">Salva</button>
    </div>
    <div class="cat-form-msg" data-msg></div>
  </form>`;
}

// ── UI kit locale (no alert/confirm) ────────────────────────────────────────
function toast(root, msg, type) {
  const t = document.createElement('div');
  t.className = 'v2-toast' + (type === 'error' ? ' v2-toast-err' : type === 'ok' ? ' v2-toast-ok' : '');
  t.textContent = msg; root.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 250); }, 2600);
}
function confirmModal(root, { title, message, danger }) {
  return new Promise((resolve) => {
    const ov = document.createElement('div'); ov.className = 'v2-modal-ov';
    ov.innerHTML = `<div class="v2-modal" role="dialog" aria-modal="true">
      <h3>${esc(title || 'Conferma')}</h3><p>${esc(message || '')}</p>
      <div class="v2-modal-actions">
        <button class="btn btn-ghost" data-no>Annulla</button>
        <button class="btn ${danger ? 'btn-danger' : ''}" data-yes>Conferma</button>
      </div></div>`;
    root.appendChild(ov);
    const done = (v) => { ov.remove(); document.removeEventListener('keydown', onKey); resolve(v); };
    const onKey = (e) => { if (e.key === 'Escape') done(false); if (e.key === 'Enter') done(true); };
    ov.querySelector('[data-no]').addEventListener('click', () => done(false));
    ov.querySelector('[data-yes]').addEventListener('click', () => done(true));
    ov.addEventListener('click', (e) => { if (e.target === ov) done(false); });
    document.addEventListener('keydown', onKey);
    ov.querySelector('[data-yes]').focus();
  });
}

const errorBox = (m) => `<div class="cat-error"><div class="cat-empty-ico">⚠️</div><h3>Errore</h3><p>${esc(m || 'Errore')}</p><button class="btn" data-retry>Riprova</button></div>`;

// ── mount (runtime) ─────────────────────────────────────────────────────────
export function mount(container, { sb, ctx }) {
  if (!container) return;
  const role = roleForTenant(ctx || {}, (ctx || {}).activeTenant) || '—';
  const tenantId = (ctx || {}).activeTenant || null;
  const w = CAT.canWrite(role);
  const root = container.querySelector('[data-catalog-root]') || container;
  root.innerHTML = `<div data-cat-pane></div>`;
  const pane = root.querySelector('[data-cat-pane]');
  const state = { search: '', kind: '', category: '', status: '', sort: 'name' };
  let deb; let categories = [];

  async function list() {
    pane.innerHTML = `<div class="cat-toolbar-skel"></div>${renderSkeleton()}`;
    try {
      let items = await CAT.listProducts(sb, { search: state.search, kind: state.kind, category: state.category });
      // categorie distinte per il filtro
      categories = [...new Set(items.map((p) => p.category).filter(Boolean))].sort();
      if (state.status === 'active') items = items.filter((p) => p.active !== false);
      if (state.status === 'archived') items = items.filter((p) => p.active === false);
      items = sortItems(items, state.sort);
      pane.innerHTML = `
        <div class="cat-toolbar">
          <input class="v2-search" data-q placeholder="🔍 Cerca per nome o SKU…" value="${esc(state.search)}">
          <select class="v2-filter" data-fcat><option value="">Tutte le categorie</option>${categories.map((c) => `<option value="${esc(c)}"${state.category === c ? ' selected' : ''}>${esc(c)}</option>`).join('')}</select>
          <select class="v2-filter" data-fkind><option value="">Prodotti e servizi</option><option value="product"${state.kind === 'product' ? ' selected' : ''}>Solo prodotti</option><option value="service"${state.kind === 'service' ? ' selected' : ''}>Solo servizi</option></select>
          <select class="v2-filter" data-fstatus><option value="">Tutti</option><option value="active"${state.status === 'active' ? ' selected' : ''}>Attivi</option><option value="archived"${state.status === 'archived' ? ' selected' : ''}>Archiviati</option></select>
          <select class="v2-filter" data-fsort>
            <option value="name"${state.sort === 'name' ? ' selected' : ''}>Nome A→Z</option>
            <option value="price_desc"${state.sort === 'price_desc' ? ' selected' : ''}>Prezzo ↓</option>
            <option value="price_asc"${state.sort === 'price_asc' ? ' selected' : ''}>Prezzo ↑</option>
            <option value="margin_desc"${state.sort === 'margin_desc' ? ' selected' : ''}>Margine ↓</option>
          </select>
          ${w ? '<button class="btn" data-new>+ Nuovo prodotto</button>' : '<span class="v2-muted">Sola lettura</span>'}
        </div>
        ${renderProductGrid(items)}`;
      const q = pane.querySelector('[data-q]');
      if (q) q.addEventListener('input', () => { clearTimeout(deb); deb = setTimeout(() => { state.search = q.value; list(); }, 250); });
      bindSel('[data-fcat]', 'category'); bindSel('[data-fkind]', 'kind'); bindSel('[data-fstatus]', 'status'); bindSel('[data-fsort]', 'sort');
      const nw = pane.querySelector('[data-new]'); if (nw) nw.addEventListener('click', () => form());
      pane.querySelectorAll('[data-prod]').forEach((c) => {
        c.addEventListener('click', () => detail(c.getAttribute('data-prod')));
        c.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); detail(c.getAttribute('data-prod')); } });
      });
    } catch (e) {
      pane.innerHTML = errorBox(CAT.friendlyError(e));
      const rt = pane.querySelector('[data-retry]'); if (rt) rt.addEventListener('click', list);
    }
  }
  function bindSel(sel, key) { const el = pane.querySelector(sel); if (el) el.addEventListener('change', () => { state[key] = el.value; list(); }); }
  function sortItems(items, sort) {
    const a = items.slice();
    if (sort === 'price_desc') a.sort((x, y) => (y.price || 0) - (x.price || 0));
    else if (sort === 'price_asc') a.sort((x, y) => (x.price || 0) - (y.price || 0));
    else if (sort === 'margin_desc') a.sort((x, y) => CAT.marginPercent(y) - CAT.marginPercent(x));
    else a.sort((x, y) => String(x.name || '').localeCompare(String(y.name || '')));
    return a;
  }

  async function detail(id) {
    pane.innerHTML = renderSkeleton(1);
    try {
      const p = await CAT.getProduct(sb, id);
      pane.innerHTML = renderProductDetail(p, role);
      pane.querySelector('[data-back]').addEventListener('click', list);
      const ed = pane.querySelector('[data-edit]'); if (ed) ed.addEventListener('click', () => form(p));
      const dl = pane.querySelector('[data-del]'); if (dl) dl.addEventListener('click', async () => {
        const ok = await confirmModal(root, { title: 'Archivia prodotto', message: `Archiviare “${p.name}”? Potrai ripristinarlo dai filtri.`, danger: true });
        if (!ok) return;
        try { await CAT.softDeleteProduct(sb, id); toast(root, 'Prodotto archiviato', 'ok'); list(); }
        catch (e) { toast(root, CAT.friendlyError(e), 'error'); }
      });
    } catch (e) { pane.innerHTML = errorBox(CAT.friendlyError(e)); const rt = pane.querySelector('[data-retry]'); if (rt) rt.addEventListener('click', () => detail(id)); }
  }

  function form(p) {
    if (!w) return list();
    pane.innerHTML = renderProductForm(p);
    const f = pane.querySelector('[data-prod-form]');
    // stato immagine locale: { url, path, local, file } — parte dai valori esistenti
    let image = { url: (p && p.image_url) || null, path: null, local: false, file: null };

    // ── margine live ──
    const marginBox = f.querySelector('[data-margin-preview]');
    const recomputeMargin = () => {
      const price = Number(f.querySelector('[name="price"]').value) || 0;
      const cost = Number(f.querySelector('[name="cost"]').value) || 0;
      const mv = CAT.marginValue({ price, cost }); const mp = CAT.marginPercent({ price, cost });
      marginBox.innerHTML = `Margine: <b>${eur(mv)}</b> · <b>${mp}%</b>`;
    };
    f.querySelector('[name="price"]').addEventListener('input', recomputeMargin);
    f.querySelector('[name="cost"]').addEventListener('input', recomputeMargin);
    recomputeMargin();

    // ── immagine: dropzone ──
    const drop = f.querySelector('[data-drop]');
    const fileInput = f.querySelector('[data-file]');
    const preview = f.querySelector('[data-preview]');
    const hint = f.querySelector('[data-hint]');
    const imgErr = f.querySelector('[data-img-err]');
    const removeBtn = f.querySelector('[data-img-remove]');
    const progress = f.querySelector('[data-progress]'); const bar = f.querySelector('[data-bar]');

    function showPreview(url) {
      preview.innerHTML = url ? `<img src="${esc(url)}" alt="anteprima">` : '';
      drop.classList.toggle('has-img', !!url);
      hint.style.display = url ? 'none' : '';
      removeBtn.hidden = !url;
    }
    function pickFile(file) {
      imgErr.textContent = '';
      const v = ST.validateImage(file);
      if (!v.ok) { imgErr.textContent = v.error; toast(root, v.error, 'error'); return; }
      const url = (globalThis.URL && URL.createObjectURL) ? URL.createObjectURL(file) : null;
      image = { url, path: null, local: true, file };
      showPreview(url);
    }
    drop.addEventListener('click', (e) => { if (e.target.closest('[data-img-remove]')) return; fileInput.click(); });
    drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); } });
    fileInput.addEventListener('change', () => { if (fileInput.files && fileInput.files[0]) pickFile(fileInput.files[0]); });
    ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('drag'); }));
    ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('drag'); }));
    drop.addEventListener('drop', (e) => { const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; if (file) pickFile(file); });
    f.querySelector('[data-img-replace]').addEventListener('click', () => fileInput.click());
    removeBtn.addEventListener('click', () => { image = { url: null, path: null, local: false, file: null }; showPreview(null); });

    f.querySelector('[data-cancel]').addEventListener('click', () => (p ? detail(p.id) : list()));

    f.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const msg = f.querySelector('[data-msg]');
      const raw = Object.fromEntries(new FormData(f).entries());
      if (!raw.name) { msg.textContent = 'Il nome è obbligatorio.'; return; }
      msg.textContent = '';
      const submitBtn = f.querySelector('button[type="submit"]'); submitBtn.disabled = true;
      try {
        // upload immagine se ne è stata scelta una nuova
        let image_url = image.url || null;
        if (image.file) {
          progress.hidden = false;
          const res = await ST.uploadProductImage(sb, tenantId, image.file, (pr) => { bar.style.width = Math.round(pr * 100) + '%'; });
          image_url = res.url; progress.hidden = true;
        } else if (image.url === null) {
          image_url = null; // rimossa
        }
        const data = {
          name: raw.name, sku: raw.sku || null, category: raw.category || null,
          kind: raw.kind || 'product', unit: raw.unit || 'pz',
          price: Number(raw.price || 0), cost: Number(raw.cost || 0),
          vat: raw.vat === '' ? null : Number(raw.vat),
          active: raw.active === 'on',
          tags: (raw.tags || '').split(',').map((t) => t.trim()).filter(Boolean),
          description: raw.description || null, image_url,
        };
        if (p && p.id) { await CAT.updateProduct(sb, p.id, data); toast(root, 'Prodotto aggiornato', 'ok'); detail(p.id); }
        else { const out = await CAT.createProduct(sb, tenantId, data); toast(root, 'Prodotto creato', 'ok'); detail(out.id); }
      } catch (e) { progress.hidden = true; submitBtn.disabled = false; msg.textContent = CAT.friendlyError(e); toast(root, CAT.friendlyError(e), 'error'); }
    });
  }

  list();
}
